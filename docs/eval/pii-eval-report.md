# ClawWarden — PII detection evaluation

_Generated: 2026-06-16 17:16 UTC · corpus: 36 labeled examples (gateway/eval/corpus.py)._

Span-overlap matching, same entity type. **Residual-leak rate** is the headline product metric: the fraction of real PII values that survive tokenization and would reach the model. Lower is better; the target is zero.

### REGEX pipeline

| Entity type | Precision | Recall | F1 | TP | FP | FN |
|---|--:|--:|--:|--:|--:|--:|
| ACCOUNT_NUMBER | 71.4% | 100.0% | 83.3% | 5 | 2 | 0 |
| CREDIT_CARD | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| DATE_TIME | 100.0% | 0.0% | 0.0% | 0 | 0 | 2 |
| EMAIL_ADDRESS | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| LOAN_ID | 50.0% | 100.0% | 66.7% | 3 | 3 | 0 |
| PERSON | 100.0% | 0.0% | 0.0% | 0 | 0 | 6 |
| PHONE_NUMBER | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| ROUTING_NUMBER | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| SSN | 100.0% | 100.0% | 100.0% | 4 | 0 | 0 |

- **Micro** — precision 82.8%, recall 75.0%, F1 78.7%
- **Macro** — precision 91.3%, recall 77.8%
- **Residual-leak rate** — 8/32 values survived = **25.0%** (fraction of real PII that would still reach the model)
- **Latency** — mean 0.0 ms, p50 0.0 ms, p95 0.0 ms

### NER pipeline

| Entity type | Precision | Recall | F1 | TP | FP | FN |
|---|--:|--:|--:|--:|--:|--:|
| ACCOUNT_NUMBER | 100.0% | 100.0% | 100.0% | 5 | 0 | 0 |
| CREDIT_CARD | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| DATE_TIME | 25.0% | 100.0% | 40.0% | 2 | 6 | 0 |
| EMAIL_ADDRESS | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| LOAN_ID | 75.0% | 100.0% | 85.7% | 3 | 1 | 0 |
| PERSON | 100.0% | 100.0% | 100.0% | 6 | 0 | 0 |
| PHONE_NUMBER | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| ROUTING_NUMBER | 100.0% | 100.0% | 100.0% | 3 | 0 | 0 |
| SSN | 100.0% | 100.0% | 100.0% | 4 | 0 | 0 |

- **Micro** — precision 82.1%, recall 100.0%, F1 90.1%
- **Macro** — precision 88.9%, recall 100.0%
- **Residual-leak rate** — 0/32 values survived = **0.0%** (fraction of real PII that would still reach the model)
- **Latency** — mean 4.0 ms, p50 2.8 ms, p95 14.8 ms
