"""Item 1: synthetic corpus generator + per-domain harness + SLO gate.

CI-safe — no spaCy/Presidio model needed. Proves the *engine* a production SLO
rides on: a deterministic multi-domain corpus, a per-domain breakdown, and a gate
that fails when residual-leak/recall miss the bar (the regression guard CI runs).
"""

from eval.harness import check_slo, evaluate, evaluate_by_domain
from eval.run_eval import regex_detect
from eval.synthetic import DOMAINS, generate_corpus


def _oracle(corpus):
    """A perfect detector for a known corpus: returns exactly the gold spans.
    Lets us test the SLO-pass path without loading the NER model."""
    index = {ex["text"]: ex["entities"] for ex in corpus}

    def detect(text):
        spans = []
        for ent in index.get(text, []):
            i = text.find(ent["value"])
            if i >= 0:
                spans.append((ent["type"], i, i + len(ent["value"])))
        return spans

    return detect


def test_generator_is_deterministic_and_multidomain():
    a = generate_corpus(20, seed=7)
    b = generate_corpus(20, seed=7)
    assert a == b  # same seed → identical corpus (reproducible CI)
    assert generate_corpus(20, seed=8) != a  # different seed → different corpus
    assert {e["domain"] for e in a} == set(DOMAINS)
    # 4 domains × (20 positives + 5 negatives) = 100
    assert len(a) == 4 * (20 + 5)


def test_generated_values_are_all_locatable():
    # The harness raises if a gold value isn't a substring; generating spans over
    # the whole corpus exercises that invariant for every example.
    corpus = generate_corpus(50, seed=123)
    r = evaluate(corpus, _oracle(corpus))
    assert r["micro"]["recall"] == 1.0
    assert r["residual_leak"]["rate"] == 0.0


def test_evaluate_by_domain_splits_results():
    corpus = generate_corpus(30, seed=99)
    graded = evaluate_by_domain(corpus, _oracle(corpus))
    assert set(graded["by_domain"]) == set(DOMAINS)
    assert graded["overall"]["examples"] == len(corpus)
    for d in DOMAINS:
        assert graded["by_domain"][d]["examples"] > 0


def test_slo_gate_passes_when_within_thresholds():
    corpus = generate_corpus(40, seed=1)
    graded = evaluate_by_domain(corpus, _oracle(corpus))
    ok, violations = check_slo(graded, max_leak_rate=0.0, min_recall=1.0)
    assert ok, violations
    assert violations == []


def test_slo_gate_fails_and_names_the_domain_on_leak():
    # Regex misses PERSON (no NER) → names leak in every domain → gate must fail
    # and the violation must name a specific domain, not just the average.
    corpus = generate_corpus(40, seed=2)
    graded = evaluate_by_domain(corpus, regex_detect)
    ok, violations = check_slo(graded, max_leak_rate=0.0, min_recall=1.0)
    assert ok is False
    assert any("domain[" in v for v in violations)
    assert any("residual-leak" in v for v in violations)


def test_slo_gate_fails_on_low_recall():
    corpus = generate_corpus(10, seed=3)
    graded = evaluate_by_domain(corpus, lambda _t: [])  # detects nothing
    ok, violations = check_slo(graded, max_leak_rate=1.0, min_recall=0.99)
    assert ok is False
    assert any("micro-recall" in v for v in violations)
