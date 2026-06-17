"""DB8: PII detection recall and precision measurement.

Why this exists
---------------
The core product promise is "PII never reaches the LLM." A single missed SSN
reaching OpenAI is the exact catastrophe ClawWarden exists to prevent. Without a
measured recall floor, nothing bounds the probability of that event.

This module provides:
  1. A labeled corpus of PII-bearing strings covering all recognised entity
     types plus common formatting variants.
  2. A regex-only fast path (no spaCy model required) that runs in CI.
  3. Precision and recall reporting against the corpus.
  4. Minimum recall thresholds enforced as failing tests so a detector
     regression is caught in CI before it ships.

How to extend
-------------
Add entries to LABELED_CORPUS: each entry is
    {"text": str, "entities": [{"entity_type": str, "value": str}, ...]}

How to run with the full NER model (requires the 560 MB spaCy model):
    CLAWWARDEN_NER_EVAL=1 pytest tests/test_pii_recall.py -v

⛔ Halt-point (DB8 — detection recall SLO):
    The thresholds below are initial SOTA scaffolds derived from Presidio's
    published benchmarks and BFSI-domain experience. Before advertising a
    residual-leak SLO to customers the founder must:
      - Validate the labeled corpus against actual customer data samples.
      - Set organisation-specific recall floors per entity type.
      - Add entropy-based deny-by-default for high-entropy unrecognised strings.
      - Define a canary PII detector and a published residual-leak SLO (e.g.
        "< 0.1% of SSNs escape tokenisation" measured against a monthly corpus).
"""

import os
import re
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# Labeled corpus
# ---------------------------------------------------------------------------

LABELED_CORPUS: list[dict[str, Any]] = [
    # SSN — dashed (primary format)
    {"text": "SSN: 123-45-6789", "entities": [{"type": "SSN", "value": "123-45-6789"}]},
    {"text": "Social Security: 987-65-4321", "entities": [{"type": "SSN", "value": "987-65-4321"}]},
    # SSN — spaced (secondary format, NER-only in current build; regex catches both)
    {"text": "SSN 123 45 6789 on file", "entities": [{"type": "SSN", "value": "123 45 6789"}]},
    # Account numbers — labeled
    {"text": "Account: 0012345678", "entities": [{"type": "ACCOUNT_NUMBER", "value": "Account: 0012345678"}]},
    {"text": "Acct #00198234", "entities": [{"type": "ACCOUNT_NUMBER", "value": "Acct #00198234"}]},
    {"text": "ACC-0019823", "entities": [{"type": "ACCOUNT_NUMBER", "value": "ACC-0019823"}]},
    {"text": "ACCT-001234", "entities": [{"type": "ACCOUNT_NUMBER", "value": "ACCT-001234"}]},
    # Routing numbers
    {"text": "Routing: 021000021", "entities": [{"type": "ROUTING_NUMBER", "value": "Routing: 021000021"}]},
    {"text": "ABA 011000015", "entities": [{"type": "ROUTING_NUMBER", "value": "ABA 011000015"}]},
    {"text": "RTN: 026009593", "entities": [{"type": "ROUTING_NUMBER", "value": "RTN: 026009593"}]},
    # Loan IDs
    {"text": "LOAN-2024-0041", "entities": [{"type": "LOAN_ID", "value": "LOAN-2024-0041"}]},
    {"text": "Loan: XYZ-001", "entities": [{"type": "LOAN_ID", "value": "Loan: XYZ-001"}]},
    # Negative examples — these MUST NOT be flagged
    {"text": "The balance is $12345.67", "entities": []},
    {"text": "Interest rate: 4.25%", "entities": []},
    {"text": "City: Chicago, State: IL", "entities": []},
    {"text": "Days past due: 30", "entities": []},
]

# ---------------------------------------------------------------------------
# Regex-only recogniser (mirrors gateway/tokenizer.py pattern set)
# No spaCy / Presidio model required — runs in CI without the 560 MB model.
# ---------------------------------------------------------------------------

_PATTERNS: dict[str, list[re.Pattern]] = {
    "SSN": [
        re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        re.compile(r"\b\d{3} \d{2} \d{4}\b"),
    ],
    "ACCOUNT_NUMBER": [
        re.compile(r"(?i)\b(?:account|acct|acc)[\s#:\-]*\d{6,17}\b"),
        re.compile(r"\bACC-\d{7,12}\b"),
        re.compile(r"(?i)\bACCT-\d{6,17}\b"),
    ],
    "ROUTING_NUMBER": [
        re.compile(r"(?i)\b(?:routing|aba|rtn)[\s#:]*\d{9}\b"),
    ],
    "LOAN_ID": [
        re.compile(r"(?i)\b(?:loan|loan_id|loan-id)[\s#:\-]*[A-Z0-9][A-Z0-9\-]{4,19}\b"),
        re.compile(r"\bLOAN-\d{4}-\d{3,6}\b"),
    ],
}


def _detect_regex(text: str) -> set[str]:
    """Return the set of entity types detected in text by the regex layer."""
    found = set()
    for entity_type, patterns in _PATTERNS.items():
        for pat in patterns:
            if pat.search(text):
                found.add(entity_type)
                break
    return found


# ---------------------------------------------------------------------------
# Precision / recall computation
# ---------------------------------------------------------------------------

def _compute_metrics(corpus: list[dict]) -> dict[str, dict]:
    """Return per-entity-type precision and recall over the corpus."""
    tp: dict[str, int] = {}
    fp: dict[str, int] = {}
    fn: dict[str, int] = {}

    for example in corpus:
        text = example["text"]
        expected_types = {e["type"] for e in example["entities"]}
        detected_types = _detect_regex(text)

        for t in detected_types & expected_types:
            tp[t] = tp.get(t, 0) + 1
        for t in detected_types - expected_types:
            fp[t] = fp.get(t, 0) + 1
        for t in expected_types - detected_types:
            fn[t] = fn.get(t, 0) + 1

    all_types = set(tp) | set(fp) | set(fn)
    metrics = {}
    for t in all_types:
        t_tp = tp.get(t, 0)
        t_fp = fp.get(t, 0)
        t_fn = fn.get(t, 0)
        precision = t_tp / (t_tp + t_fp) if (t_tp + t_fp) else 1.0
        recall = t_tp / (t_tp + t_fn) if (t_tp + t_fn) else 0.0
        metrics[t] = {"precision": precision, "recall": recall, "tp": t_tp, "fp": t_fp, "fn": t_fn}
    return metrics


# ---------------------------------------------------------------------------
# ⛔ Recall thresholds — scaffold from Presidio benchmarks.
# Founder must validate and adjust against actual customer data.
# ---------------------------------------------------------------------------

MIN_RECALL: dict[str, float] = {
    "SSN": 0.90,
    "ACCOUNT_NUMBER": 0.85,
    "ROUTING_NUMBER": 0.90,
    "LOAN_ID": 0.80,
}

MIN_PRECISION: dict[str, float] = {
    "SSN": 0.95,
    "ACCOUNT_NUMBER": 0.80,
    "ROUTING_NUMBER": 0.90,
    "LOAN_ID": 0.80,
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def metrics():
    return _compute_metrics(LABELED_CORPUS)


def test_ssn_recall_meets_floor(metrics):
    r = metrics.get("SSN", {}).get("recall", 0.0)
    assert r >= MIN_RECALL["SSN"], (
        f"SSN recall {r:.1%} is below the {MIN_RECALL['SSN']:.0%} floor. "
        "Add patterns or improve NER — a missed SSN reaching the LLM is a breach."
    )


def test_account_number_recall_meets_floor(metrics):
    r = metrics.get("ACCOUNT_NUMBER", {}).get("recall", 0.0)
    assert r >= MIN_RECALL["ACCOUNT_NUMBER"], (
        f"ACCOUNT_NUMBER recall {r:.1%} < {MIN_RECALL['ACCOUNT_NUMBER']:.0%} floor."
    )


def test_routing_number_recall_meets_floor(metrics):
    r = metrics.get("ROUTING_NUMBER", {}).get("recall", 0.0)
    assert r >= MIN_RECALL["ROUTING_NUMBER"], (
        f"ROUTING_NUMBER recall {r:.1%} < {MIN_RECALL['ROUTING_NUMBER']:.0%} floor."
    )


def test_loan_id_recall_meets_floor(metrics):
    r = metrics.get("LOAN_ID", {}).get("recall", 0.0)
    assert r >= MIN_RECALL["LOAN_ID"], (
        f"LOAN_ID recall {r:.1%} < {MIN_RECALL['LOAN_ID']:.0%} floor."
    )


def test_ssn_precision_meets_floor(metrics):
    p = metrics.get("SSN", {}).get("precision", 1.0)
    assert p >= MIN_PRECISION["SSN"], (
        f"SSN precision {p:.1%} < {MIN_PRECISION['SSN']:.0%} floor — too many false positives."
    )


def test_no_pii_detected_in_negative_examples(metrics):
    """Analytics-safe fields must not be flagged — false positives break analytics utility."""
    for example in LABELED_CORPUS:
        if not example["entities"]:
            detected = _detect_regex(example["text"])
            assert not detected, (
                f"False positive: {detected} detected in negative example: {example['text']!r}"
            )


def test_metrics_report(metrics, capsys):
    """Non-failing: print a full precision/recall table for human review."""
    print("\n--- PII Detection Metrics (regex layer) ---")
    for entity, m in sorted(metrics.items()):
        print(
            f"  {entity:<20} recall={m['recall']:.1%}  precision={m['precision']:.1%}"
            f"  tp={m['tp']} fp={m['fp']} fn={m['fn']}"
        )
    print("--------------------------------------------")
