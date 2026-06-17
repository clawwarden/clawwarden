#!/usr/bin/env python3
"""ClawWarden — 60-second terminal demo.

Shows the core loop on a single record: classify PII -> deterministically
tokenize -> "send to the model" -> role-based detokenize -> tamper-evident audit.

Runs with just the published package + the standard library:

    pip install clawwarden
    python demo/demo.py

This is a minimal, dependency-light illustration of the *concepts*. The full
gateway uses Microsoft Presidio NER (not the regex reference pipeline used here),
Redis for the encrypted vault, and an append-only Postgres mirror for the
WORM audit anchor. See the white paper in docs/whitepaper.md.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import sys
import time
from types import SimpleNamespace

# Render UTF-8 on every platform (Windows consoles default to cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    from clawwarden import Classifier, RegexNerPipeline
except ModuleNotFoundError:
    sys.exit("\nClawWarden isn't installed in this interpreter.\n"
             "  Run:  python -m pip install clawwarden\n"
             "  Then: python demo/demo.py\n")

# --- tiny ANSI helpers (no extra deps) -------------------------------------
def c(s, code):  # color
    return f"\033[{code}m{s}\033[0m"

DIM, B, GREEN, RED, CYAN, YEL = "2", "1", "32", "31", "36", "33"
def hr():
    print(c("─" * 64, DIM))
def pause(t=0.7):
    time.sleep(t)

# --- a minimal deterministic tokenizer (mirrors the gateway concept) -------
SHORT = {"SSN": "SSN", "PERSON": "PERSON", "ACCOUNT": "ACCT", "EMAIL": "EMAIL",
         "PHONE": "PHONE", "LOAN_ID": "LOAN", "CREDIT_CARD": "CARD"}

# The shipped `clawwarden` package is the dependency-free *regex* pipeline, which
# does not detect names. The full gateway tokenizes PERSON via Microsoft Presidio
# NER. For this offline demo we add a minimal name matcher so the headline
# (the model never sees a real name) is shown end-to-end.
_NAME_RE = re.compile(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b")

def detect(text):
    ents = list(Classifier(pipeline=RegexNerPipeline()).classify(text).entities)
    for m in _NAME_RE.finditer(text):
        ents.append(SimpleNamespace(type="PERSON", start=m.start(), end=m.end()))
    ents.sort(key=lambda e: e.start)
    kept, covered = [], set()
    for e in ents:  # drop overlaps, keep first
        span = set(range(e.start, e.end))
        if not span & covered:
            kept.append(e)
            covered |= span
    return kept

def tokenize(text, entities):
    """Replace each detected identifier with a stable {{TYPE_n}} token.
    Same value -> same token (deterministic). Analytics values are left intact."""
    vault, counters, out = {}, {}, text
    # right-to-left so offsets stay valid
    for e in sorted(entities, key=lambda x: x.start, reverse=True):
        value = text[e.start:e.end]
        if value in vault:
            token = vault[value]
        else:
            n = counters.get(e.type, 0) + 1
            counters[e.type] = n
            token = "{{" + f"{SHORT.get(e.type, e.type)}_{n}" + "}}"
            vault[value] = token
        out = out[:e.start] + token + out[e.end:]
    return out, {v: k for k, v in vault.items()}  # tokenized, token->value

def detokenize(text, token_to_value, allowed):
    out = text
    for token, value in token_to_value.items():
        etype = token.strip("{}").rsplit("_", 1)[0]
        if etype in allowed:
            out = out.replace(token, value)
    return out

# --- a minimal hash-chained audit log (mirrors gateway/audit.py) -----------
KEY = b"demo-audit-key"
def sign(entry):
    return hmac.new(KEY, json.dumps(entry, sort_keys=True).encode(), hashlib.sha256).hexdigest()[:16]

def append(chain, event, details):
    prev = chain[-1]["entry_hash"] if chain else "genesis"
    body = {"seq": len(chain) + 1, "event": event, "details": details, "prev_hash": prev}
    chain.append({**body, "entry_hash": sign(body)})

def verify(chain):
    prev = "genesis"
    for i, e in enumerate(chain):
        body = {k: v for k, v in e.items() if k != "entry_hash"}
        if e["prev_hash"] != prev or sign(body) != e["entry_hash"]:
            return False, i
        prev = e["entry_hash"]
    return True, -1

# ---------------------------------------------------------------------------
def main():
    print()
    print(c("  ClawWarden", B) + c("  ·  run any LLM on sensitive data, prove the model never saw PII", DIM))
    hr()

    prompt = ("Approve a $42,500 loan for Jane Smith, SSN 123-45-6789, "
              "account ACC-00198234. Credit score 742, 0 days past due.")
    print(c("  PROMPT (raw, with PII)", YEL))
    print("  " + prompt)
    pause()

    # 1) classify
    sensitivity = Classifier(pipeline=RegexNerPipeline()).classify(prompt).sensitivity.value
    entities = detect(prompt)
    print()
    print(c("  DETECTED", CYAN) + c(f"   sensitivity = {sensitivity}", DIM))
    for e in sorted(entities, key=lambda x: x.start):
        print(f"    • {c(e.type, B):<24} {prompt[e.start:e.end]!r}")
    pause()

    # 2) tokenize — the model only ever sees tokens
    tokenized, tok2val = tokenize(prompt, entities)
    print()
    print(c("  TOKENIZED (this is all the model sees)", GREEN))
    print("  " + tokenized)
    print(c("  ↑ identifiers replaced; $42,500 and score 742 preserved for analytics", DIM))
    pause()

    # 3) "model" responds, referencing the stable tokens
    model_out = "{{PERSON_1}} qualifies: score 742, 0 days past due, DTI within policy. Recommend approve."
    print()
    print(c("  MODEL RESPONSE (over tokens)", CYAN))
    print("  " + model_out)
    pause()

    # 4) role-based detokenization on the way back
    print()
    print(c("  DETOKENIZE — role-aware", YEL))
    for role, allowed in [("junior_analyst", set()),
                          ("senior_analyst", {"PERSON"}),
                          ("vp_risk", {"PERSON", "SSN", "ACCOUNT"})]:
        print(f"    {c(role, B):<22} " + detokenize(model_out, tok2val, allowed))
    pause()

    # 5) tamper-evident audit
    chain = []
    append(chain, "pii_detected", {"types": sorted({e.type for e in entities})})
    append(chain, "chat_request", {"entities_masked": len(entities)})
    ok, _ = verify(chain)
    print()
    print(c("  AUDIT — hash-chained, tamper-evident", YEL))
    print(f"    {len(chain)} entries · verify_chain() -> " + c("OK ✓", GREEN) if ok else "FAIL")
    chain[0]["details"]["types"] = ["TAMPERED"]          # attacker edits a record
    ok, bad = verify(chain)
    print(f"    after editing entry 0 -> verify_chain() -> " + c(f"BROKEN at #{bad} ✗", RED))
    hr()
    print(c("  Apache-2.0 · self-hosted · pip install clawwarden · https://clawwarden.space", DIM))
    print()

if __name__ == "__main__":
    main()
