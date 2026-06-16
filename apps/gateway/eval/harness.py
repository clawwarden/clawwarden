"""Metric computation for PII detection.

Given a detector — a callable ``text -> list[(entity_type, start, end)]`` — and
the labeled corpus, compute:

* Per-entity-type precision / recall / F1 (span-overlap matching, same type).
* Micro and macro aggregates.
* Residual-leak rate: of all labeled PII *values*, the fraction that still appear
  verbatim in the tokenized output. This is the product SLO — "PII never reaches
  the model" — measured directly.
* Latency per example (mean / p50 / p95).

The detector is the only moving part, so the same harness scores the regex layer
and the full NER pipeline identically.
"""

from __future__ import annotations

import statistics
import time
from typing import Callable

Detector = Callable[[str], list[tuple[str, int, int]]]


def _gold_spans(example: dict) -> list[tuple[str, int, int, str]]:
    """Resolve each labeled value to (type, start, end, value) by locating it."""
    spans = []
    for ent in example["entities"]:
        value = ent["value"]
        start = example["text"].find(value)
        if start < 0:
            raise ValueError(f"corpus value {value!r} not found in {example['text']!r}")
        spans.append((ent["type"], start, start + len(value), value))
    return spans


def _overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


def _tokenize(text: str, detections: list[tuple[str, int, int]]) -> str:
    """Replace detected spans with placeholders, right-to-left (offset-safe)."""
    out = text
    for etype, start, end in sorted(detections, key=lambda d: d[1], reverse=True):
        out = out[:start] + f"{{{{{etype}}}}}" + out[end:]
    return out


def evaluate(corpus: list[dict], detect: Detector) -> dict:
    tp: dict[str, int] = {}
    fp: dict[str, int] = {}
    fn: dict[str, int] = {}
    latencies_ms: list[float] = []
    leak_total = 0
    leak_count = 0
    false_positive_examples: list[dict] = []

    for example in corpus:
        text = example["text"]
        gold = _gold_spans(example)

        t0 = time.perf_counter()
        detections = detect(text)
        latencies_ms.append((time.perf_counter() - t0) * 1000)

        matched_gold: set[int] = set()
        matched_det: set[int] = set()
        # Match each detection to an unused gold span of the same type that overlaps.
        for di, (dtype, ds, de) in enumerate(detections):
            for gi, (gtype, gs, ge, _val) in enumerate(gold):
                if gi in matched_gold:
                    continue
                if dtype == gtype and _overlaps(ds, de, gs, ge):
                    tp[dtype] = tp.get(dtype, 0) + 1
                    matched_gold.add(gi)
                    matched_det.add(di)
                    break
        # Unmatched detections = false positives.
        for di, (dtype, ds, de) in enumerate(detections):
            if di not in matched_det:
                fp[dtype] = fp.get(dtype, 0) + 1
                if not example["entities"]:
                    false_positive_examples.append({"text": text, "type": dtype})
        # Unmatched gold = false negatives.
        for gi, (gtype, gs, ge, _val) in enumerate(gold):
            if gi not in matched_gold:
                fn[gtype] = fn.get(gtype, 0) + 1

        # Residual-leak: does any labeled value survive into the tokenized text?
        tokenized = _tokenize(text, detections)
        for _gtype, _gs, _ge, value in gold:
            leak_total += 1
            if value in tokenized:
                leak_count += 1

    types = sorted(set(tp) | set(fp) | set(fn))
    per_type = {}
    for t in types:
        t_tp, t_fp, t_fn = tp.get(t, 0), fp.get(t, 0), fn.get(t, 0)
        prec = t_tp / (t_tp + t_fp) if (t_tp + t_fp) else 1.0
        rec = t_tp / (t_tp + t_fn) if (t_tp + t_fn) else 1.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        per_type[t] = {"precision": prec, "recall": rec, "f1": f1,
                       "tp": t_tp, "fp": t_fp, "fn": t_fn}

    sum_tp = sum(tp.values())
    sum_fp = sum(fp.values())
    sum_fn = sum(fn.values())
    micro_prec = sum_tp / (sum_tp + sum_fp) if (sum_tp + sum_fp) else 1.0
    micro_rec = sum_tp / (sum_tp + sum_fn) if (sum_tp + sum_fn) else 1.0
    micro_f1 = 2 * micro_prec * micro_rec / (micro_prec + micro_rec) if (micro_prec + micro_rec) else 0.0
    macro_prec = statistics.mean([m["precision"] for m in per_type.values()]) if per_type else 1.0
    macro_rec = statistics.mean([m["recall"] for m in per_type.values()]) if per_type else 1.0

    latencies_ms.sort()
    return {
        "examples": len(corpus),
        "per_type": per_type,
        "micro": {"precision": micro_prec, "recall": micro_rec, "f1": micro_f1},
        "macro": {"precision": macro_prec, "recall": macro_rec},
        "residual_leak": {
            "values": leak_total,
            "leaked": leak_count,
            "rate": (leak_count / leak_total) if leak_total else 0.0,
        },
        "latency_ms": {
            "mean": statistics.mean(latencies_ms) if latencies_ms else 0.0,
            "p50": statistics.median(latencies_ms) if latencies_ms else 0.0,
            "p95": latencies_ms[int(len(latencies_ms) * 0.95)] if latencies_ms else 0.0,
        },
        "false_positive_examples": false_positive_examples,
    }
