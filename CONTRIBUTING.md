# Contributing to ClawWarden

Thanks for helping build open AI trust infrastructure. 🙌

## Ground rules

- **Open source boundary.** This repo holds the open wedge: SDKs, contracts, integration adapters,
  and detector/classifier **interfaces + reference implementations**. Proprietary risk logic
  (tuned detectors, model-risk scoring, BFSI taxonomy, governance internals) is **not** accepted
  here — keep PRs to the open surface. If a change needs a proprietary provider, code against the
  interface and ship a reference/heuristic implementation.
- **Interfaces are contracts.** Changing a public interface (`Detector`, `Classifier`, the wire
  contracts in `contracts/`) is a breaking change — call it out explicitly and update all three:
  the interface, `contracts/`, and the dependent SDK.
- **Tests required.** Every reference implementation ships with unit tests. Pure logic should be
  pure and directly testable.

## Dev setup

```bash
# TypeScript packages
npm install
npm run build
npm test

# Python packages
cd packages/classifier && pip install -e ".[dev]" && pytest
```

## Workflow

1. Fork + branch (`feat/...`, `fix/...`).
2. Make the change with tests.
3. `npm test` and `pytest` green; `npm run lint` clean.
4. Open a PR describing **what** and **why**. Reference any related contract change.

## Commit style

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Keep PRs focused.

## Code of conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
