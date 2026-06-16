"""OWASP LLM01 (Prompt Injection) — runtime input guardrail.

Inspects incoming user content for prompt-injection / instruction-override
markers before the (tokenized) prompt is forwarded to a model. Heuristic
baseline — an open reference set, not a complete defence; the proprietary
detector implements the same interface with tuned/ML detection.

Policy: the caller decides what to do with the result. The gateway blocks the
request when the worst finding is at or above ``settings.injection_block_severity``
(default "high") and logs an INJECTION_DETECTED audit event otherwise.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}

# (regex, severity, label) — OWASP LLM01 reference heuristics.
_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"ignore\s+(?:all\s+|the\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?)", re.I), "high", "override-instructions"),
    (re.compile(r"disregard\s+(?:the\s+)?(?:system|above|previous|earlier)", re.I), "high", "disregard"),
    (re.compile(r"reveal\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?)", re.I), "high", "prompt-extraction"),
    (re.compile(r"(?:ignore|bypass|turn\s+off)\s+(?:your\s+)?(?:safety|content|moderation)\s+(?:guidelines?|policy|policies|filters?|rules?)", re.I), "high", "safety-bypass"),
    (re.compile(r"\bdo\s+anything\s+now\b|\bD\.?A\.?N\.?\b", re.I), "high", "DAN"),
    (re.compile(r"\bnew\s+instructions?\s*:", re.I), "medium", "injected-instructions"),
    (re.compile(r"\byou\s+are\s+now\b", re.I), "medium", "role-reassignment"),
    (re.compile(r"\bsystem\s+prompt\b", re.I), "medium", "system-prompt-probe"),
    (re.compile(r"\bdeveloper\s+mode\b", re.I), "medium", "developer-mode"),
]

# Cap inspected length — input is attacker-controlled and patterns use no
# catastrophic backtracking, but bound the work regardless.
_MAX_SCAN_LEN = 100_000


@dataclass
class InjectionFinding:
    severity: str
    label: str
    evidence: str


@dataclass
class InjectionResult:
    findings: list[InjectionFinding]

    @property
    def worst_severity(self) -> str | None:
        if not self.findings:
            return None
        return max(self.findings, key=lambda f: SEVERITY_RANK[f.severity]).severity

    @property
    def labels(self) -> list[str]:
        return sorted({f.label for f in self.findings})

    def blocks_at(self, threshold: str) -> bool:
        worst = self.worst_severity
        if worst is None:
            return False
        return SEVERITY_RANK[worst] >= SEVERITY_RANK.get(threshold, 3)


def scan_for_injection(text: str) -> InjectionResult:
    """Return all injection findings in ``text`` (one per matched pattern)."""
    sample = text[:_MAX_SCAN_LEN]
    findings: list[InjectionFinding] = []
    for pattern, severity, label in _PATTERNS:
        m = pattern.search(sample)
        if m:
            findings.append(InjectionFinding(severity, label, m.group(0)[:80]))
    return InjectionResult(findings)
