# Changelog

All notable changes to ClawWarden are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project uses [SemVer](https://semver.org/).

## [Unreleased]
### Changed
- Project renamed to **ClawWarden** and relicensed-clean as **fully open source**
  (Apache-2.0) — no paid tier, custom extensions, or telemetry.

### Added
- **Tamper-evidence**: cross-day hash chaining + a durable append-only audit
  mirror (WORM on Postgres) with continuous verification.
- **OWASP LLM Top 10** runtime guardrails: prompt-injection input guard (LLM01),
  output sanitization (LLM02), entropy/regex log scrubber (LLM06).
- **PII detection eval harness** (precision/recall/F1 + residual-leak rate).
- Sentry error tracking (PII-safe), security headers, rate limiting.

### Security
- Fixed registration privilege escalation, unauthenticated + DNS-rebinding SSRF,
  audit tail-truncation, and the token-mint race.

## [0.1.0]
- Initial release: PII-tokenizing LLM proxy + hash-chained audit + open SDKs.
