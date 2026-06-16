"""OWASP LLM06 (Sensitive Information Disclosure) — outbound-log scrubber.

Defence-in-depth on top of the PII tokenizer: even though prompts are tokenized
before they reach a model, *logs* can still capture secrets (an API key in a
provider config, a credential pasted into an error string, a JWT in a header).
This module scrubs credentials, keys, and obvious PII from every structlog event
before it is rendered, so secrets never land in stdout / log aggregation.

Two layers:
  1. Regex patterns for well-known secret formats (AWS/GCP keys, JWTs, provider
     API keys, private-key blocks, emails, SSNs).
  2. A Shannon-entropy fallback that redacts long, high-entropy tokens (the shape
     of an API key / token) that no signature matched.

Wire ``scrub_processor`` into the structlog processor chain (see gateway/main.py).
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

# (label, pattern) — order matters; most specific first.
_SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("PRIVATE_KEY", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----", re.DOTALL)),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
    ("AWS_ACCESS_KEY", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GCP_API_KEY", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("GITHUB_TOKEN", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("SLACK_TOKEN", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("PROVIDER_API_KEY", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b")),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("EMAIL", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    # key=value / "key": "value" assignments for secret-ish names
    ("SECRET_ASSIGNMENT", re.compile(
        r"(?i)\b(?:api[_-]?key|secret|token|password|passwd|authorization|bearer)\b\s*[:=]\s*['\"]?([^\s'\"]{6,})",
    )),
]

# Entropy fallback tuning.
_ENTROPY_MIN_LEN = 20
_ENTROPY_THRESHOLD = 3.5  # bits/char; random base64/hex sits ~4.0–6.0
_TOKENISH = re.compile(r"^[A-Za-z0-9+/_=\-]+$")
_TOKEN_SPLIT = re.compile(r"(\s+)")


def _shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def _redact_high_entropy(text: str) -> str:
    out: list[str] = []
    for tok in _TOKEN_SPLIT.split(text):
        if (
            len(tok) >= _ENTROPY_MIN_LEN
            and _TOKENISH.match(tok)
            and _shannon_entropy(tok) >= _ENTROPY_THRESHOLD
        ):
            out.append("[REDACTED:HIGH_ENTROPY]")
        else:
            out.append(tok)
    return "".join(out)


def scrub(text: str) -> str:
    """Redact secrets/PII from a string. Idempotent and safe on plain prose."""
    if not text:
        return text
    for label, pattern in _SECRET_PATTERNS:
        if label == "SECRET_ASSIGNMENT":
            text = pattern.sub(lambda m: m.group(0).replace(m.group(1), f"[REDACTED:{label}]"), text)
        else:
            text = pattern.sub(f"[REDACTED:{label}]", text)
    return _redact_high_entropy(text)


def _scrub_value(value: Any) -> Any:
    if isinstance(value, str):
        return scrub(value)
    if isinstance(value, dict):
        return {k: _scrub_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_scrub_value(v) for v in value)
    return value


def scrub_processor(logger, method_name, event_dict):  # noqa: ANN001 - structlog signature
    """structlog processor: scrub every value in the event before rendering."""
    return {k: _scrub_value(v) for k, v in event_dict.items()}
