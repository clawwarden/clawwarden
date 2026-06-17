<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/python-3.11%2B-blue.svg" alt="Python 3.11+" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Presidio-NER-orange" alt="Microsoft Presidio" />
  <img src="https://img.shields.io/badge/spaCy-en__core__web__lg-09a3d5?logo=spacy" alt="spaCy" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai" alt="OpenAI" />
  <img src="https://img.shields.io/badge/Anthropic-Claude-d4a017" alt="Anthropic" />
  <img src="https://img.shields.io/badge/Ollama-local-black" alt="Ollama" />
</p>

<h1 align="center">
  🔒 ClawWarden Core
</h1>

<p align="center">
  <strong>A PII-safe LLM proxy gateway.</strong><br/>
  Intercept prompts → tokenize every personal identifier → forward to any LLM → detokenize the response.<br/>
  The model never sees real names, SSNs, emails, account numbers, or phone numbers. Ever.
</p>

<p align="center">
  <a href="https://clawwarden.space">Hosted version</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How it Works</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#entity-types">Entity Types</a> ·
  <a href="#rbac">RBAC</a>
</p>

---

## The problem in one paragraph

Your analysts are pasting customer data into ChatGPT. You know it. They know it. Banning it doesn't work — they'll use their phones. What you actually need is a proxy that strips PII before the prompt leaves your machine and puts it back after the response arrives, transparently, with a full audit trail.

That's ClawWarden Core.

---

## What it does

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CLAWWARDEN CORE — request flow                         │
└──────────────────────────────────────────────────────────────────────────────┘

  Client                 ClawWarden Gateway              LLM Provider
    │                         │                            │
    │  POST /v1/chat          │                            │
    │  ─────────────────────► │                            │
    │                         │  ① Presidio NER scan       │
    │                         │     Jane Smith  → {{PERSON_1}}
    │                         │     123-45-6789 → {{SSN_1}}
    │                         │     ACC-00198234→ {{ACCT_1}}
    │                         │     jane@co.com → {{EMAIL_1}}
    │                         │                            │
    │                         │  ② Forward tokenized msg  │
    │                         │  ──────────────────────── ►│
    │                         │                            │
    │                         │        ③ LLM response      │
    │                         │  ◄──────────────────────── │
    │                         │  (may contain {{PERSON_1}} │
    │                         │   references in analysis)  │
    │                         │                            │
    │                         │  ④ Detokenize per RBAC     │
    │                         │     VP    → real names     │
    │                         │     Analyst → names only   │
    │                         │     Junior → all tokens    │
    │                         │                            │
    │  ◄──────────────────────│                            │
    │   detokenized response   │                            │
```

---

## Quick Start

### Option A — Docker (recommended, no Python setup required)

```bash
git clone https://github.com/clawwarden/clawwarden-core.git
cd clawwarden-core
docker compose up
```

Gateway is live at `http://localhost:8000`.  
The first startup downloads spaCy `en_core_web_lg` (~800 MB) — subsequent starts are instant.

### Option B — Local Python

```bash
git clone https://github.com/clawwarden/clawwarden-core.git
cd clawwarden-core

python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_lg

uvicorn gateway.main:app --reload
```

---

## Your first request

### 1 — Test tokenization only (no LLM key needed)

```bash
curl -s -X POST http://localhost:8000/v1/tokenize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Analyze risk for Jane Smith (SSN: 123-45-6789, email: jane@acme.com). Account ACC-00198234 has balance $42,500, credit score 742."
  }' | python -m json.tool
```

**Response:**

```json
{
  "session_id": "a3f1b2c4-...",
  "original": "Analyze risk for Jane Smith (SSN: 123-45-6789, email: jane@acme.com). Account ACC-00198234 has balance $42,500, credit score 742.",
  "tokenized": "Analyze risk for {{PERSON_1}} (SSN: {{SSN_1}}, email: {{EMAIL_1}}). Account {{ACCT_1}} has balance $42,500, credit score 742.",
  "entities": [
    { "entity_type": "PERSON",         "token": "{{PERSON_1}}",  "original": "Jane Smith"    },
    { "entity_type": "SSN",            "token": "{{SSN_1}}",     "original": "123-45-6789"   },
    { "entity_type": "EMAIL_ADDRESS",  "token": "{{EMAIL_1}}",   "original": "jane@acme.com" },
    { "entity_type": "ACCOUNT_NUMBER", "token": "{{ACCT_1}}",    "original": "ACC-00198234"  }
  ],
  "vault": {
    "{{PERSON_1}}":  "Jane Smith",
    "{{SSN_1}}":     "123-45-6789",
    "{{EMAIL_1}}":   "jane@acme.com",
    "{{ACCT_1}}":    "ACC-00198234"
  }
}
```

**Notice:** `$42,500` and `742` (credit score) are **untouched**. Analytics fields are intentionally preserved so downstream aggregation still works.

---

### 2 — Full chat with OpenAI (PII never reaches the API)

```bash
curl -s -X POST http://localhost:8000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "sk-...",
    "role": "analyst",
    "messages": [
      {
        "role": "user",
        "content": "Analyze risk for Jane Smith (SSN: 123-45-6789). Account ACC-00198234, credit score 742, 30 days past due. Loan LOAN-2024-0041, $85,000 mortgage at 6.25%."
      }
    ]
  }' | python -m json.tool
```

What OpenAI's API actually receives:

```
Analyze risk for {{PERSON_1}} (SSN: {{SSN_1}}). Account {{ACCT_1}}, credit score 742,
30 days past due. Loan {{LOAN_1}}, $85,000 mortgage at 6.25%.
```

Raw PII never leaves your machine.

---

### 3 — Fully local with Ollama (zero network egress)

```bash
# Start Ollama separately
ollama pull llama3.2

curl -s -X POST http://localhost:8000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "model": "llama3.2",
    "ollama_url": "http://localhost:11434",
    "role": "vp",
    "messages": [{ "role": "user", "content": "Jane Smith, SSN 123-45-6789, credit score 742 — what is her risk profile?" }]
  }'
```

---

## How it works

### 1. Presidio NER + custom finance recognizers

The gateway uses [Microsoft Presidio](https://microsoft.github.io/presidio/) with spaCy `en_core_web_lg` for named-entity recognition (PERSON detection) plus custom regex recognizers for finance-specific identifiers:

| Recognizer | Pattern example | Entity type |
|---|---|---|
| spaCy NER | "Jane Smith", "Robert Chen" | `PERSON` |
| SSN regex | `123-45-6789` | `SSN` |
| Account prefix | `ACC-00198234` | `ACCOUNT_NUMBER` |
| Loan ID | `LOAN-2024-0041` | `LOAN_ID` |
| Email | `jane@acme.com` | `EMAIL_ADDRESS` |
| Phone | `415-555-0192` | `PHONE_NUMBER` |
| Credit card | `4111-1111-1111-1111` | `CREDIT_CARD` |
| Date of birth | `01/15/1985` | `DATE_TIME` |

### 2. Deterministic tokens

The same real value always maps to the same token **within a session**:

```
Jane Smith  → {{PERSON_1}}   (turn 1)
Jane Smith  → {{PERSON_1}}   (turn 7)   ← same token, referential integrity preserved
```

This is critical for multi-turn conversations — the LLM builds a coherent picture of `{{PERSON_1}}` across the entire session without ever knowing the real name.

### 3. Analytics-safe masking

Financial values are intentionally **not** tokenized:

| Tokenized (PII) | Preserved (analytics) |
|---|---|
| Names, SSNs, emails | Balances, credit scores |
| Phone numbers | Interest rates, APRs |
| Account numbers | Monthly payments |
| Loan IDs | Days past due |
| Dates of birth | Risk flags (LOW/MED/HIGH) |
| Credit card numbers | Loan type, employment status |

Your LLM can still compute averages, flag high-risk accounts, and run statistical distributions — it just doesn't know who the customers are.

### 4. Role-based detokenization (RBAC)

The vault is decrypted selectively on the return path:

```python
ROLE_PERMISSIONS = {
    "junior_analyst":  set(),                            # all tokens visible
    "analyst":         {"PERSON"},                       # sees names only
    "senior_analyst":  {"PERSON", "EMAIL_ADDRESS", ...}, # PII except SSN/card
    "vp":              ALL_ENTITY_TYPES,                 # full detokenization
    "admin":           ALL_ENTITY_TYPES,
}
```

The same gateway response can be served at different clearance levels without re-querying the LLM.

---

## Entity types

| Short code | Entity type | Example |
|---|---|---|
| `PERSON` | Full names | Jane Smith |
| `SSN` | US Social Security Numbers | 123-45-6789 |
| `ACCT` | Bank account numbers | ACC-00198234 |
| `ROUTING` | ABA routing numbers | routing: 021000021 |
| `LOAN` | Loan IDs | LOAN-2024-0041 |
| `EMAIL` | Email addresses | jane@acme.com |
| `PHONE` | Phone numbers | 415-555-0192 |
| `DATE` | Dates (incl. DOB) | 01/15/1985 |
| `CARD` | Credit/debit card numbers | 4111-1111-1111-1111 |

---

## API reference

### `POST /v1/tokenize`

Tokenize a text string. Returns the tokenized text, entity metadata, and vault mapping. No LLM call is made.

```json
{
  "text": "Jane Smith, SSN 123-45-6789",
  "session_id": "optional-uuid"
}
```

### `POST /v1/chat`

Full proxy request. Tokenizes user messages, calls the LLM, detokenizes the response.

```json
{
  "provider": "openai",          // "openai" | "anthropic" | "ollama"
  "model": "gpt-4o",
  "api_key": "sk-...",           // omit for Ollama
  "ollama_url": "http://...",    // Ollama only
  "role": "analyst",             // RBAC role for detokenization
  "session_id": "optional-uuid", // reuse across turns
  "messages": [
    { "role": "user", "content": "..." }
  ]
}
```

### `GET /health`

Returns `{"status": "ok"}`.

### `GET /docs`

Auto-generated Swagger UI at `http://localhost:8000/docs`.

---

## Run tests

```bash
pytest tests/ -v
```

All tests are offline — no LLM calls, no API keys needed.

---

## Architecture decisions

**Why Presidio + spaCy instead of a simple regex?**  
Regex catches structured PII (SSN, email, phone) reliably but misses free-text names. spaCy's `en_core_web_lg` NER catches "Jane Smith", "Robert Chen", and "Priya Patel" in natural-language prompts. Presidio combines both into a single pipeline.

**Why deterministic tokens instead of random UUIDs?**  
Random UUIDs break multi-turn conversations — the LLM sees `{{a3f1b2}}` in turn 1 and `{{9e2c44}}` in turn 3 and doesn't know they're the same person. Deterministic tokens give the model stable "primary keys" for individuals across the whole session.

**Why not just redact (blank out) PII?**  
Redaction destroys the linguistic context. The LLM needs to know "this is a person's name" to reason about it coherently. `{{PERSON_1}}` tells the model it's a person; `[REDACTED]` tells it nothing.

**Why preserve financial amounts?**  
This is a banking use-case. If you mask `$42,500`, the LLM can't compute averages, risk scores, or portfolio distributions. Privacy regulations (GLBA, GDPR) protect personal *identifiers*, not financial analytics data.

---

## What's in the enterprise version?

The core tokenization engine is MIT open-source and always will be.  
[ClawWarden hosted](https://clawwarden.space) adds:

| Feature | Core (this repo) | Professional | Enterprise |
|---|---|---|---|
| LLM providers | All (bring your own key) | All | All + private endpoints |
| Session store | In-memory | Redis (encrypted) | Redis + custom retention |
| Audit log | Console | 90-day append-only | Custom + data residency |
| RBAC | 5 preset roles | Custom roles | Custom + export controls |
| Users | Unlimited | 25 | Unlimited |
| SSO | — | SAML 2.0 | SAML + OIDC |
| SOC 2 Type II | — | — | ✓ |
| GLBA evidence pack | — | — | ✓ |
| Support | GitHub Issues | Priority email | Dedicated Slack + SLA |

→ [Join the waitlist](https://clawwarden.space/#waitlist)

---

## Contributing

Issues and PRs welcome. Please run `pytest tests/ -v` before opening a PR.

---

## License

MIT — see [LICENSE](LICENSE).
