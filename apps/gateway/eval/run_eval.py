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
from eval.harness import check_slo, evaluate, evaluate_by_domain
from eval.synthetic import generate_corpus

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


def _domain_markdown(by_domain: dict) -> str:
    lines = ["", "#### Per-domain residual-leak / recall", "",
             "| Domain | Examples | Micro recall | Residual-leak |",
             "|---|--:|--:|--:|"]
    for d, r in sorted(by_domain.items()):
        lines.append(f"| {d} | {r['examples']} | {_fmt_pct(r['micro']['recall'])} | "
                     f"{_fmt_pct(r['residual_leak']['rate'])} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["ner", "regex", "both"], default="both")
    ap.add_argument("--corpus", choices=["seed", "synthetic"], default="seed",
                    help="seed = curated scaffold; synthetic = generated multi-domain corpus")
    ap.add_argument("--n-per-domain", type=int, default=250,
                    help="synthetic positives per domain (4 domains)")
    ap.add_argument("--seed", type=int, default=1337, help="synthetic RNG seed")
    # CI SLO gate: when set, exit non-zero if the overall OR any domain violates.
    ap.add_argument("--max-leak-rate", type=float, default=None,
                    help="fail (exit 1) if residual-leak rate exceeds this (e.g. 0.001)")
    ap.add_argument("--min-recall", type=float, default=None,
                    help="fail (exit 1) if micro-recall falls below this (e.g. 0.99)")
    args = ap.parse_args()
    modes = ["regex", "ner"] if args.mode == "both" else [args.mode]

    if args.corpus == "synthetic":
        corpus = generate_corpus(args.n_per_domain, seed=args.seed)
        corpus_desc = (f"{len(corpus)} synthetic examples across "
                       f"{len({e['domain'] for e in corpus})} domains "
                       f"(seed={args.seed}, gateway/eval/synthetic.py)")
    else:
        corpus = LABELED_CORPUS
        corpus_desc = f"{len(LABELED_CORPUS)} seed examples (gateway/eval/corpus.py)"

    DOCS_EVAL.mkdir(parents=True, exist_ok=True)
    detectors = {"regex": regex_detect, "ner": ner_detect}
    results = {}
    report = [
        "# ClawWarden — PII detection evaluation",
        "",
        f"_Generated: {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · "
        f"corpus: {corpus_desc}._",
        "",
        "Span-overlap matching, same entity type. **Residual-leak rate** is the headline "
        "product metric: the fraction of real PII values that survive tokenization and would "
        "reach the model. Lower is better; the target is zero.",
        "",
    ]

    gate_failed = False
    for mode in modes:
        print(f"\n=== {mode.upper()} ===")
        if mode == "ner":
            detectors["ner"]("warm up the model so latency excludes cold load")
        graded = evaluate_by_domain(corpus, detectors[mode])
        r = graded["overall"]
        results[mode] = graded
        for t, m in sorted(r["per_type"].items()):
            print(f"  {t:<16} P={_fmt_pct(m['precision']):>6} R={_fmt_pct(m['recall']):>6} "
                  f"F1={_fmt_pct(m['f1']):>6}  tp={m['tp']} fp={m['fp']} fn={m['fn']}")
        print(f"  micro R={_fmt_pct(r['micro']['recall'])}  "
              f"residual-leak={_fmt_pct(r['residual_leak']['rate'])}  "
              f"latency p95={r['latency_ms']['p95']:.1f}ms")
        (DOCS_EVAL / f"pii-eval-{mode}.json").write_text(json.dumps(graded, indent=2), encoding="utf-8")
        report.append(_markdown(mode, r))
        if len(graded["by_domain"]) > 1:
            report.append(_domain_markdown(graded["by_domain"]))

        # SLO gate
        if args.max_leak_rate is not None or args.min_recall is not None:
            ok, violations = check_slo(
                graded,
                max_leak_rate=args.max_leak_rate if args.max_leak_rate is not None else 1.0,
                min_recall=args.min_recall if args.min_recall is not None else 0.0,
            )
            if ok:
                print(f"  SLO gate [{mode}]: PASS")
            else:
                gate_failed = True
                print(f"  SLO gate [{mode}]: FAIL")
                for v in violations:
                    print(f"    - {v}")

    (DOCS_EVAL / "pii-eval-report.md").write_text("\n".join(report), encoding="utf-8")
    print(f"\nWrote report + JSON to {DOCS_EVAL}")

    if gate_failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
