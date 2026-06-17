# ClawWarden demo

A 60-second terminal demo of the core loop: classify PII → deterministically
tokenize → "send to the model" → role-based detokenize → tamper-evident audit.

## Run it

```bash
pip install clawwarden
python demo/demo.py
```

Runs anywhere with Python 3.9+ and the standard library — no Redis, no model, no keys.

## What it shows

- **Tokenization** — identifiers (`Jane Smith`, SSN, account) become stable
  `{{PERSON_1}}`-style tokens; analytics values (`$42,500`, score `742`) are kept.
- **Role-aware detokenization** — a junior analyst gets tokens, senior+ get names.
- **Tamper-evident audit** — `verify_chain()` passes on a clean log and breaks the
  moment a record is edited.

> Note: the demo uses the dependency-free regex pipeline from the `clawwarden`
> package plus a minimal name matcher. The full gateway detects names with
> Microsoft Presidio NER and stores the chain in Redis + an append-only Postgres
> (WORM) mirror. See [docs/whitepaper.md](../docs/whitepaper.md).

## Regenerate the GIF

The README embeds `demo/demo.gif`. Two ways to rebuild it:

```bash
# Easiest — pure Pillow, no extra tools:
python -m pip install pillow
python demo/make_gif.py

# Or a real terminal recording with VHS (https://github.com/charmbracelet/vhs):
vhs demo/demo.tape
```
