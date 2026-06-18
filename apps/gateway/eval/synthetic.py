"""Synthetic, multi-domain labeled corpus generator (Item 1).

Why this exists
---------------
The seed corpus in ``corpus.py`` is a scaffold (tens of examples). A production SLO
needs thousands of labeled spans across multiple domains. This module generates them
**by construction** — every identifier is injected from a known pool, so the gold
labels are exact and require no human annotation, and **no real customer PII is ever
involved** (so the output is safe to commit).

What it is NOT
--------------
A substitute for real, design-partner data. Synthetic text under-represents the messy
distribution of production prompts. The honest path (see
``docs/production-readiness-roadmap.md`` item 1) is: prove the harness + SLO here on
synthetic data, then run the *same* harness on partner data that never leaves their
network — only the metrics come back. Real-PII corpora are gitignored
(``**/eval/corpora/private/``).

Schema (matches ``eval.corpus`` + adds ``domain``):
    {"text": str, "domain": str, "entities": [{"type": <canonical>, "value": <substring>}]}

Deterministic: same ``seed`` → same corpus, so CI numbers are reproducible.
"""

from __future__ import annotations

import random
from typing import Any, Callable

# --- value pools (synthetic; no real people) --------------------------------- #
_FIRST = ["Jane", "Michael", "Priya", "David", "Sarah", "Carlos", "Mei", "Ahmed",
          "Olivia", "Liam", "Fatima", "Noah", "Sofia", "Ethan", "Aisha", "Lucas",
          "Emma", "Diego", "Hana", "Omar", "Grace", "Yuki", "Isaac", "Nadia"]
_LAST = ["Smith", "Rodriguez", "Patel", "Lee", "Connor", "Nguyen", "Okafor", "Garcia",
         "Kim", "Johnson", "Hassan", "Müller", "Rossi", "Silva", "Cohen", "Wang",
         "Brown", "Khan", "Andersson", "Costa", "Mbeki", "Tanaka", "Reyes", "Novak"]
_EMAIL_DOMAINS = ["example.com", "bank-corp.co.uk", "mail.test", "acme-health.org",
                  "claims.example.net", "support.example.io"]
_CITIES = ["Chicago, Illinois", "Austin, Texas", "Denver, Colorado", "Miami, Florida",
           "Seattle, Washington", "Boston, Massachusetts"]
_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December"]

DOMAINS = ["lending", "healthcare", "insurance", "support"]


def _rng(seed: int) -> random.Random:
    return random.Random(seed)


# --- identifier builders: return the EXACT substring used as the gold value --- #
def _person(r: random.Random) -> str:
    return f"{r.choice(_FIRST)} {r.choice(_LAST)}"


def _ssn(r: random.Random) -> str:
    return f"{r.randint(100,899):03d}-{r.randint(10,99):02d}-{r.randint(1000,9999):04d}"


def _account_digits(r: random.Random) -> str:
    return f"{r.randint(10**9, 10**10 - 1)}"  # 10-digit


def _routing(r: random.Random) -> str:
    return f"{r.randint(0, 9):d}{r.randint(10000000, 99999999):08d}"[:9]


def _loan(r: random.Random) -> str:
    return f"LOAN-{r.randint(2018, 2026)}-{r.randint(0, 9999):04d}"


def _email(r: random.Random, person: str) -> str:
    first, last = person.lower().split(" ", 1)
    return f"{first}.{last}@{r.choice(_EMAIL_DOMAINS)}"


def _phone(r: random.Random) -> str:
    return f"({r.randint(200,989)}) 555-{r.randint(0,9999):04d}"


def _card(r: random.Random) -> str:
    # Test-style 16-digit number in grouped format (never a live PAN).
    grp = lambda: f"{r.randint(0,9999):04d}"
    return f"4111 {grp()} {grp()} {grp()}"


def _dob(r: random.Random) -> str:
    return f"{r.randint(1,12):02d}/{r.randint(1,28):02d}/{r.randint(1950,2005)}"


def _date_long(r: random.Random) -> str:
    return f"{r.choice(_MONTHS)} {r.randint(1,28)}, {r.randint(2015,2025)}"


# --- per-domain positive templates ------------------------------------------- #
# Each returns (text, entities). Entity "value" is an exact substring of text.
def _t_lending(r: random.Random) -> tuple[str, list[dict]]:
    p = _person(r); ssn = _ssn(r); loan = _loan(r); acct = _account_digits(r)
    text = (f"Borrower {p} (SSN {ssn}) on loan {loan} has account {acct} "
            f"with a balance of ${r.randint(1000,99000):,} and credit score "
            f"{r.randint(580,820)}.")
    return text, [
        {"type": "PERSON", "value": p},
        {"type": "SSN", "value": ssn},
        {"type": "LOAN_ID", "value": loan},
        {"type": "ACCOUNT_NUMBER", "value": acct},
    ]


def _t_healthcare(r: random.Random) -> tuple[str, list[dict]]:
    p = _person(r); dob = _dob(r); email = _email(r, p); phone = _phone(r)
    text = (f"Patient {p}, date of birth {dob}, reachable at {phone} or {email}, "
            f"reported a blood pressure of {r.randint(110,160)}/{r.randint(70,99)}.")
    return text, [
        {"type": "PERSON", "value": p},
        {"type": "DATE_TIME", "value": dob},
        {"type": "PHONE_NUMBER", "value": phone},
        {"type": "EMAIL_ADDRESS", "value": email},
    ]


def _t_insurance(r: random.Random) -> tuple[str, list[dict]]:
    p = _person(r); card = _card(r); date = _date_long(r); acct = _account_digits(r)
    text = (f"Claimant {p} filed on {date}; card on file {card}; "
            f"policy account {acct}; assessed loss ${r.randint(500,40000):,}.")
    return text, [
        {"type": "PERSON", "value": p},
        {"type": "DATE_TIME", "value": date},
        {"type": "CREDIT_CARD", "value": card},
        {"type": "ACCOUNT_NUMBER", "value": acct},
    ]


def _t_support(r: random.Random) -> tuple[str, list[dict]]:
    p = _person(r); email = _email(r, p); phone = _phone(r); routing = _routing(r)
    text = (f"Customer {p} emailed {email} from {phone} about a wire; "
            f"routing {routing}; ticket priority tier {r.choice('ABC')}.")
    return text, [
        {"type": "PERSON", "value": p},
        {"type": "EMAIL_ADDRESS", "value": email},
        {"type": "PHONE_NUMBER", "value": phone},
        {"type": "ROUTING_NUMBER", "value": routing},
    ]


_TEMPLATES: dict[str, Callable[[random.Random], tuple[str, list[dict]]]] = {
    "lending": _t_lending,
    "healthcare": _t_healthcare,
    "insurance": _t_insurance,
    "support": _t_support,
}

# --- negatives: analytics-safe text that MUST NOT be flagged ----------------- #
def _negative(r: random.Random) -> tuple[str, list[dict]]:
    choices = [
        f"The outstanding balance is ${r.randint(1000,99000):,}.{r.randint(0,99):02d}.",
        f"Interest rate is {r.randint(2,9)}.{r.randint(0,99):02d}% APR.",
        f"Branch located in {r.choice(_CITIES)}.",
        f"Days past due: {r.choice([0,30,60,90])}.",
        f"Credit score improved to {r.randint(600,820)} this quarter.",
        f"Loan-to-value ratio is 0.{r.randint(50,95)}.",
        f"Term length is {r.choice([180,240,360])} months.",
        f"Portfolio grew {r.randint(1,12)} percent year over year.",
    ]
    return r.choice(choices), []


def generate_corpus(
    n_per_domain: int = 250,
    *,
    seed: int = 1337,
    negative_ratio: float = 0.25,
) -> list[dict[str, Any]]:
    """Generate a deterministic, multi-domain labeled corpus.

    Args:
        n_per_domain: positive examples per domain (4 domains → 4×N positives).
        seed:         RNG seed; same seed → identical corpus (reproducible CI).
        negative_ratio: fraction of additional analytics-safe negatives per domain.

    Returns a list of ``{"text", "domain", "entities"}`` dicts. Every entity
    ``value`` is guaranteed to be an exact substring of ``text``.
    """
    r = _rng(seed)
    corpus: list[dict[str, Any]] = []
    for domain in DOMAINS:
        builder = _TEMPLATES[domain]
        for _ in range(n_per_domain):
            text, entities = builder(r)
            # Invariant: every gold value must be locatable (harness requires it).
            for e in entities:
                assert e["value"] in text, (domain, e, text)
            corpus.append({"text": text, "domain": domain, "entities": entities})
        for _ in range(int(n_per_domain * negative_ratio)):
            text, entities = _negative(r)
            corpus.append({"text": text, "domain": domain, "entities": entities})
    r.shuffle(corpus)
    return corpus


if __name__ == "__main__":  # pragma: no cover
    import json
    import sys

    n = int(sys.argv[1]) if len(sys.argv) > 1 else 250
    print(json.dumps(generate_corpus(n), indent=2))
