"""Tests for the PII evaluation harness (CI-safe — no spaCy model needed).

The NER numbers come from the offline run (docs/eval/); these tests verify the
*harness* itself is correct and exercise the regex detector end-to-end.
"""

from eval.corpus import LABELED_CORPUS
from eval.harness import evaluate
from eval.run_eval import regex_detect


def _perfect_detect(text):
    # A detector that returns the gold spans exactly, for a tiny known corpus.
    spans = []
    for value, etype in [("123-45-6789", "SSN"), ("Jane Smith", "PERSON")]:
        i = text.find(value)
        if i >= 0:
            spans.append((etype, i, i + len(value)))
    return spans


def test_perfect_detector_scores_100_and_zero_leak():
    corpus = [
        {"text": "Jane Smith SSN 123-45-6789", "entities": [
            {"type": "PERSON", "value": "Jane Smith"},
            {"type": "SSN", "value": "123-45-6789"}]},
    ]
    r = evaluate(corpus, _perfect_detect)
    assert r["micro"]["recall"] == 1.0
    assert r["micro"]["precision"] == 1.0
    assert r["residual_leak"]["rate"] == 0.0


def test_missed_entity_counts_as_leak():
    corpus = [{"text": "SSN 123-45-6789", "entities": [{"type": "SSN", "value": "123-45-6789"}]}]
    r = evaluate(corpus, lambda _t: [])  # detects nothing
    assert r["micro"]["recall"] == 0.0
    assert r["residual_leak"]["rate"] == 1.0  # the SSN survives -> leak


def test_regex_detector_runs_over_corpus():
    r = evaluate(LABELED_CORPUS, regex_detect)
    # Regex misses PERSON/DATE (no NER) -> some leak, but the structured fields
    # it does cover must be perfect-recall.
    assert r["per_type"]["SSN"]["recall"] == 1.0
    assert r["per_type"]["EMAIL_ADDRESS"]["recall"] == 1.0
    assert 0.0 <= r["residual_leak"]["rate"] <= 1.0


def test_negative_examples_have_no_pii_to_leak():
    # Analytics-safe fields carry no PII, so there is nothing to leak.
    negatives = [e for e in LABELED_CORPUS if not e["entities"]]
    r = evaluate(negatives, regex_detect)
    assert r["residual_leak"]["values"] == 0
    # The high-risk identifier types must never false-fire on analytics fields
    # (a false SSN/card/email would corrupt analytics). NOTE: the regex LOAN_ID
    # pattern does over-match "Loan-to-value" — a known regex weakness the NER
    # layer avoids; tracked in docs/eval/.
    fp_types = {fp["type"] for fp in r["false_positive_examples"]}
    assert not (fp_types & {"SSN", "CREDIT_CARD", "EMAIL_ADDRESS", "ROUTING_NUMBER"})
