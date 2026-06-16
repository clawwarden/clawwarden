"""Error tracking (Sentry) — opt-in, PII-safe.

No-ops unless ``SENTRY_DSN`` is set, so local/dev/CI stay clean. Because this is
a PII-handling gateway, two safeguards are mandatory:

* ``send_default_pii=False`` — never attach request bodies/headers/cookies.
* a ``before_send`` hook that runs the same regex+entropy scrubber used for logs
  over the event's message and exception text, so a stray identifier inside an
  error string is redacted before it leaves the process.

Sentry is an optional dependency; if it isn't installed, this module no-ops.
"""

from __future__ import annotations

from gateway.config import settings
from gateway.log_scrubber import scrub

try:
    import sentry_sdk
except ImportError:  # pragma: no cover - optional dependency
    sentry_sdk = None


def _scrub_event(event, _hint):
    # Scrub the rendered message.
    msg = event.get("logentry", {}).get("message")
    if isinstance(msg, str):
        event["logentry"]["message"] = scrub(msg)
    # Scrub exception values.
    for exc in event.get("exception", {}).get("values", []) or []:
        if isinstance(exc.get("value"), str):
            exc["value"] = scrub(exc["value"])
    return event


def init_sentry() -> bool:
    """Initialise Sentry if configured. Returns True if active."""
    if sentry_sdk is None or not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,  # never send PII from a PII gateway
        before_send=_scrub_event,
    )
    return True
