"""OWASP LLM02 (Insecure Output Handling) — model-output sanitizer.

Model output is untrusted. If a downstream consumer renders it as HTML, follows
its links, or executes it, an attacker who influenced the prompt can pivot
through the response (XSS, data exfiltration via markdown image beacons,
javascript:/data: URIs, fenced "run this" payloads).

``sanitize_output`` neutralizes the well-known dangerous constructs and reports
what it found, so the gateway can (a) return a safe string and (b) audit the
event. It is deliberately conservative — it strips clearly-dangerous markup and
defangs risky URIs, but leaves ordinary prose, numbers, and tokens intact.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_RULES: list[tuple[str, re.Pattern[str], str]] = [
    # <script>...</script> blocks
    ("script_tag", re.compile(r"<\s*script\b[^>]*>.*?<\s*/\s*script\s*>", re.I | re.S), "[removed:script]"),
    # event handlers: onclick=, onerror=, ...
    ("event_handler", re.compile(r"\son\w+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I), ""),
    # javascript:/vbscript: URIs
    ("script_uri", re.compile(r"(?i)\b(?:java|vb)script:"), "blocked:"),
    # data: URIs that carry executable/HTML payloads
    ("data_uri", re.compile(r"(?i)data:(?:text/html|application/(?:javascript|x-javascript))[^\s\")]*"), "blocked:data"),
    # markdown image beacons that exfiltrate to an external URL: ![...](http...)
    ("markdown_image_beacon", re.compile(r"!\[[^\]]*\]\(\s*https?://[^)]+\)", re.I), "[removed:image]"),
    # iframe/object/embed
    ("embed_tag", re.compile(r"<\s*(?:iframe|object|embed)\b[^>]*>", re.I), "[removed:embed]"),
]


@dataclass
class OutputScanResult:
    text: str
    flags: list[str] = field(default_factory=list)

    @property
    def modified(self) -> bool:
        return bool(self.flags)


def sanitize_output(text: str) -> OutputScanResult:
    """Return sanitized text plus the list of rule labels that fired."""
    if not text:
        return OutputScanResult(text=text)
    flags: list[str] = []
    out = text
    for label, pattern, replacement in _RULES:
        new = pattern.sub(replacement, out)
        if new != out:
            flags.append(label)
            out = new
    return OutputScanResult(text=out, flags=sorted(set(flags)))
