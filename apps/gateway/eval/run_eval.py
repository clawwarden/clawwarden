"""Run the PII-detection evaluation and emit a report.

Usage (from apps/gateway):
    python -m eval.run_eval --mode ner      # full Presidio + spaCy pipeline
    python -m eval.run_eval --mode regex    # regex-only layer (no model)
    python -m eval.run_eval --mode both     # default

Writes JSON + a markdown report under ../../docs/eval/.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from eval.corpus import LABELED_CORPUS
from eval.harness import evaluate

# Repo-root docs/eval (apps/gateway/eval/run_eval.py -> ../../../docs/eval)
DOCS_EVAL = Path(__file__).resolve().parents[3] / "docs" / "eval"

# --- regex-only detector (mirrors gateway/tokenizer.py pattern set) ----------
_REGEX: dict[str, list[re.Pattern]] = {
    "SSN": [re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), re.compile(r"\b\d{3} \d{2} \d{4}\b")],
    "ACCOUNT_NUMBER": [re.compile(r"(?i)\b(?:account|acct|acc)[\s#:\-]*\d{6,17}\b"), re.compile(r"\bACC-\d{7,12}\b")],
    "ROUTING_NUMBER": [re.compile(r"(?i)\b(?:routing|aba|rtn)[\s#:]*\d{9}\b")],
    "LOAN_ID": [re.compile(r"(?i)\b(?:loan|loan_id|loan-id)[\s#:\-]*[A-Z0-9][A-Z0-9\-]{4,19}\b"), re.compile(r"\bLOAN-\d{4}-\d{3,6}\b")],
    "EMAIL_ADDRESS": [re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")],
    "PHONE_NUMBER": [re.compile(r"\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}")],
    "CREDIT_CARD": [re.compile(r"\b(?:\d[ -]?){13,16}\b")],
}


def regex_detect(text: str) -> list[tuple[str, int, int]]:
    spans: list[tuple[str, int, int]] = []
    for etype, patterns in _REGEX.items():
        for pat in patterns:
            for m in pat.finditer(text):
                spans.append((etype, m.start(), m.end()))
    return spans


def ner_detect(text: str) -> list[tuple[str, int, int]]:
    from gateway.tokenizer import analyze_spans  # lazy: loads the model
    return [(s.entity_type, s.start, s.end) for s in analyze_spans(text)]


def _fmt_pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def _markdown(mode: str, r: dict) -> str:
    lines = [f"### {mode.upper()} pipeline", ""]
    lines.append("| Entity type | Precision | Recall | F1 | TP | FP | FN |")
    lines.append("|---|--:|--:|--:|--:|--:|--:|")
    for t, m in sorted(r["per_type"].items()):
        lines.append(f"| {t} | {_fmt_pct(m['precision'])} | {_fmt_pct(m['recall'])} | "
                     f"{_fmt_pct(m['f1'])} | {m['tp']} | {m['fp']} | {m['fn']} |")
    lines += [
        "",
        f"- **Micro** — precision {_fmt_pct(r['micro']['precision'])}, "
        f"recall {_fmt_pct(r['micro']['recall'])}, F1 {_fmt_pct(r['micro']['f1'])}",
        f"- **Macro** — precision {_fmt_pct(r['macro']['precision'])}, "
        f"recall {_fmt_pct(r['macro']['recall'])}",
        f"- **Residual-leak rate** — {r['residual_leak']['leaked']}/{r['residual_leak']['values']} "
        f"values survived = **{_fmt_pct(r['residual_leak']['rate'])}** "
        "(fraction of real PII that would still reach the model)",
        f"- **Latency** — mean {r['latency_ms']['mean']:.1f} ms, "
        f"p50 {r['latency_ms']['p50']:.1f} ms, p95 {r['latency_ms']['p95']:.1f} ms",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["ner", "regex", "both"], default="both")
    args = ap.parse_args()
    modes = ["regex", "ner"] if args.mode == "both" else [args.mode]

    DOCS_EVAL.mkdir(parents=True, exist_ok=True)
    detectors = {"regex": regex_detect, "ner": ner_detect}
    results = {}
    report = [
        "# ClawWarden — PII detection evaluation",
        "",
        f"_Generated: {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · "
        f"corpus: {len(LABELED_CORPUS)} labeled examples (gateway/eval/corpus.py)._",
        "",
        "Span-overlap matching, same entity type. **Residual-leak rate** is the headline "
        "product metric: the fraction of real PII values that survive tokenization and would "
        "reach the model. Lower is better; the target is zero.",
        "",
    ]

    for mode in modes:
        print(f"\n=== {mode.upper()} ===")
        if mode == "ner":
            detectors["ner"]("warm up the model so latency excludes cold load")
        r = evaluate(LABELED_CORPUS, detectors[mode])
        results[mode] = r
        for t, m in sorted(r["per_type"].items()):
            print(f"  {t:<16} P={_fmt_pct(m['precision']):>6} R={_fmt_pct(m['recall']):>6} "
                  f"F1={_fmt_pct(m['f1']):>6}  tp={m['tp']} fp={m['fp']} fn={m['fn']}")
        print(f"  micro R={_fmt_pct(r['micro']['recall'])}  "
              f"residual-leak={_fmt_pct(r['residual_leak']['rate'])}  "
              f"latency p95={r['latency_ms']['p95']:.1f}ms")
        (DOCS_EVAL / f"pii-eval-{mode}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")
        report.append(_markdown(mode, r))

    (DOCS_EVAL / "pii-eval-report.md").write_text("\n".join(report), encoding="utf-8")
    print(f"\nWrote report + JSON to {DOCS_EVAL}")


if __name__ == "__main__":
    main()
