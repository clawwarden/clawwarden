# Eval Corpus Card

Honest provenance for the numbers in `pii-eval-report.md`. A security control whose
eval set is undocumented is not one a serious buyer should trust.

## Corpora

| Corpus | Source | Size | Committed? | Use |
|---|---|---|---|---|
| **seed** | Hand-curated (`gateway/eval/corpus.py`) | ~35 examples | yes | Scaffold; harness sanity; regex-vs-NER contrast |
| **synthetic** | Generated (`gateway/eval/synthetic.py`) | configurable; **20,000 labeled spans** at the published config | no — reproducible from seed | Scale + multi-domain + CI SLO gate |
| **partner (real)** | Design-partner data | varies | **never** — gitignored (`**/eval/corpora/private/`) | The production SLO; runs on partner infra, only metrics returned |

## Synthetic corpus — details

- **Generator:** `gateway/eval/synthetic.py`, deterministic (`seed` → identical corpus).
- **Published config:** `--corpus synthetic --n-per-domain 1250 --seed 1337`
  → 4 domains × 1250 positives = **5,000 positive examples**, 4 entities each =
  **20,000 labeled spans**, plus ~1,250 analytics-safe negatives.
- **Domains:** lending, healthcare, insurance, support.
- **Entity coverage:** PERSON, SSN, ACCOUNT_NUMBER, ROUTING_NUMBER, LOAN_ID,
  EMAIL_ADDRESS, PHONE_NUMBER, DATE_TIME, CREDIT_CARD.
- **Labels:** exact by construction — every identifier is injected from a known pool, so
  gold spans need no human annotation and are guaranteed locatable in the text.
- **Negatives:** analytics-safe fields (balances, rates, scores, geography, terms) that
  **must not** be flagged — a false positive there corrupts analytics utility.
- **License/PII:** fully synthetic, no real people; credit-card numbers are test-style
  (`4111 …`), never live PANs. Safe to regenerate and publish.

### Honest limitations

- Synthetic text is **templated** — it under-represents the messy, adversarial
  distribution of real prompts (typos, OCR noise, unusual formats, code-switching).
  High synthetic recall is necessary, not sufficient.
- The real SLO must be measured on **design-partner data** with the same harness, run on
  partner infrastructure (data never leaves their network; only metrics return). See
  `docs/production-readiness-roadmap.md` item 1.
- `DATE_TIME` over-tagging (NER flags temporal words like "today") is over-redaction, not
  a leak; tracked in `pii-eval-report.md`.

## SLO + CI gate

The product SLO is the **residual-leak rate** (fraction of real PII values that survive
tokenization and would reach the model) plus **micro-recall**, checked overall *and per
domain* (a single bad domain fails the gate even if the average looks fine).

```bash
# Full NER pipeline against the synthetic corpus, gated (CI / release job):
python -m eval.run_eval --mode ner --corpus synthetic --n-per-domain 1250 \
    --max-leak-rate 0.001 --min-recall 0.99
# exits non-zero (fails the build) if overall OR any domain misses the bar.
```

The gate **mechanism** is regression-tested CI-safe (no model needed) in
`tests/test_synthetic_eval.py`. The NER run above needs Presidio + spaCy, so it runs in
the release/eval job (which installs the model), not the fast unit-test job.

⛔ Halt-point: `max-leak-rate` / `min-recall` are pre-filled SOTA targets (0.1% leak,
99% recall). The committed production SLO is the founder's call (Item 4 SLA).
