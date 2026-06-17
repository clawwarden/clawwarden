# ClawWarden — OWASP Top 10 for LLM Applications mapping

How ClawWarden's runtime controls map to the [OWASP Top 10 for Large Language Model
Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/).
Each control names the file that implements it and the test that proves it. Only
implemented controls are claimed; partial/out-of-scope items say so plainly.

| OWASP risk | ClawWarden control | Implementation | Tests |
|---|---|---|---|
| **LLM01 — Prompt Injection** | Runtime input guardrail: every user message is inspected for instruction-override / jailbreak / prompt-extraction markers **before** it is tokenized or forwarded. Blocks at/above a configurable severity (`INJECTION_BLOCK_SEVERITY`, default `high`) and records an `injection_detected` audit event. | [`apps/gateway/gateway/injection_guard.py`](../apps/gateway/gateway/injection_guard.py) · wired in `chat_completions` ([main.py](../apps/gateway/gateway/main.py)) · reference detectors also in [`packages/finsafe-core`](../packages/finsafe-core) | `test_owasp_guards.py::test_injection_*`, `test_chat_blocks_injection_before_forwarding` |
| **LLM02 — Insecure Output Handling** | Output sanitizer: model output is defanged before it is returned or handed downstream — strips `<script>`/iframe/embed, removes inline event handlers, blocks `javascript:`/`vbscript:`/executable `data:` URIs, and removes markdown image beacons used for exfiltration. Fires an `output_flagged` audit event and exposes `_meta.output_flags`. | [`apps/gateway/gateway/output_guard.py`](../apps/gateway/gateway/output_guard.py) · wired in `chat_completions` | `test_owasp_guards.py::test_output_*` |
| **LLM06 — Sensitive Information Disclosure** | **Primary control.** (1) Reversible PII tokenization at the proxy — the model only ever sees `{{PERSON_1}}`-style tokens, never raw PII ([tokenizer.py](../apps/gateway/gateway/tokenizer.py), Presidio + spaCy). (2) Role-aware detokenization on return ([rbac.py](../apps/gateway/gateway/rbac.py)). (3) Entropy + regex **log scrubber** that redacts credentials/keys/PII from every log event before it is emitted (defence-in-depth so secrets never reach stdout / log aggregation). | [`apps/gateway/gateway/log_scrubber.py`](../apps/gateway/gateway/log_scrubber.py) · [`tokenizer.py`](../apps/gateway/gateway/tokenizer.py) · [`packages/finsafe-core`](../packages/finsafe-core) PII-leak detector | `test_owasp_guards.py::test_scrub_*`, `test_tokenizer.py`, `test_pii_recall.py`, `test_rbac.py` |

## Partial / supporting controls

| OWASP risk | Status in ClawWarden |
|---|---|
| **LLM04 — Model Denial of Service** | Partial — per-route rate limiting (`slowapi`) on chat/auth endpoints ([main.py](../apps/gateway/gateway/main.py)) + input-length caps in the guards. Cost/quota controls are out of scope. |
| **LLM07 — Insecure Plugin Design** / **LLM08 — Excessive Agency** | N/A — ClawWarden is a proxy, not an agent; it grants the model no tools or autonomous actions. |
| **LLM09 — Overreliance** | Supporting — the tamper-evident audit chain ([audit.py](../apps/gateway/gateway/audit.py)) gives a verifiable record of every request/decision for human review. |
| **LLM03, LLM05, LLM10** (training-data poisoning, supply chain, model theft) | Out of scope — these concern model training/hosting, not the inference-time trust layer ClawWarden provides. |

## Measured detection quality (LLM06)

The PII detector is evaluated against a labeled corpus — see the harness
([apps/gateway/eval/](../apps/gateway/eval/)) and the latest report
([docs/eval/pii-eval-report.md](./eval/pii-eval-report.md)). Headline result on
the current corpus (full Presidio + spaCy NER pipeline):

- **Residual-leak rate: 0%** — no labeled PII value survived tokenization (the
  product SLO: "PII never reaches the model").
- **Micro recall: 100%**, with PERSON / SSN / EMAIL / PHONE / CARD / ACCOUNT /
  ROUTING all at 100%.
- The regex-only layer leaks **25%** by comparison (misses PERSON + DATE),
  which is why the NER pipeline is the default.
- Known weak spot: **DATE_TIME precision** (NER over-tags temporal words) — an
  over-redaction, not a leak; tracked for tuning.

Regenerate with `python -m eval.run_eval --mode both` (from `apps/gateway`); the
weekly **PII detection eval** workflow reruns it and uploads the report.

## Design notes

- **Fail-safe:** if PII detection errors, the request is **blocked** (HTTP 422), never sent in the clear.
- **Auditable:** LLM01/LLM02 events (`injection_detected`, `output_flagged`) are appended to the hash-chained, tamper-evident audit log alongside PII/auth events.
- **Reference vs tuned:** the heuristics here are an open reference baseline, not a complete defence. The proprietary detectors implement the same interfaces with tuned/ML detection.
- **Configuration:** `INJECTION_BLOCK_SEVERITY` (default `high`) controls the LLM01 block threshold; set `critical` to only block the most severe or `low` to block on any signal.
