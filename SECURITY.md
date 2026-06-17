# Security Policy

ClawWarden is security infrastructure for regulated enterprises. We take vulnerabilities seriously.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Email **security@clawwarden.space** with:

- A description of the issue and its impact
- Steps to reproduce (PoC if possible)
- Affected package(s) and version(s)

We aim to acknowledge within **2 business days** and provide a remediation timeline after triage.
Please give us a reasonable disclosure window before going public.

## Scope

In scope: the open-source packages in this repository (`packages/*`, `sdk/*`, `contracts/`).
For a custom Cloud / Enterprise core, email the same address — it is routed to the
same team.

## Hardening notes

- The reference detectors and classifier in this repo are **heuristic baselines**, not a complete
  defense. Production deployments should layer the proprietary providers and their own controls.
- Never commit secrets. Adapters read credentials from the environment / your secret manager only.
