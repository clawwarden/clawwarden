# ClawWarden — Show HN Launch Plan

A launch is a *campaign*, not a day. ClawWarden is a technical, open-source security
tool, so the channel is **Hacker News → GitHub → adjacent dev/security communities** —
not Product Hunt, not paid ads. This plan goes deep on that one channel.

**Positioning (consistent everywhere):**
> For engineering and security teams at regulated companies who need to use LLMs on
> customer data but can't let raw PII leave their network, ClawWarden is a self-hosted
> LLM proxy that strips every identifier before the prompt reaches the model and writes
> a tamper-evident record to prove it. Unlike trusting a provider's "we don't train on
> you" contract, ClawWarden removes the PII technically — before it ever crosses your
> boundary.

**Stage goal:** this is open source with no paid tier, so the launch's job is
**adoption + design partners**, not signups-to-paid. The win metrics are GitHub stars,
clones, `docker compose up` / `pip install` events, and — most important — *teams who
deploy it and will talk to you.* Revenue strategy is a separate step (`/founder:sell`).

---

## Phase 1 — Pre-launch (2–3 weeks before)

1. **Waitlist + "notify me on launch" on clawwarden.space.** Even 150–300 emails makes
   launch day non-zero. Capture one field (email) + an optional "what regulated data do
   you handle?" so you can segment design-partner candidates.
2. **Line up 5–10 design partners** before HN day. These are engineers/security leads at
   fintech/health/insurance orgs who will run ClawWarden against a real (or realistic)
   workload in exchange for direct support and a future case study. Recruit them from
   your network, the communities below, and 1:1 DMs — *not* from the HN thread itself.
   (Having even 2–3 real deployers gives you credible answers in the thread.)
3. **Prep the assets** (all must be ready before you post):
   - The demo GIF (already in `demo/`) — make sure it loads fast on the README and site.
   - A 60–90s screen recording: paste a prompt with a name + SSN → show the model
     receiving `{{PERSON_1}}` → role-aware restore → the audit chain + `verify_chain()`.
   - The white paper (`docs/whitepaper.md`) published at clawwarden.space — your
     credibility anchor; HN will click it.
   - The eval report (`docs/eval/`) reachable in one click — the 100% recall / 0% leak
     claim **must** link to reproducible numbers, because HN will probe it.
4. **Repo hygiene** (HN judges the repo, not the pitch): README quickstart that works
   copy-paste, a clear LICENSE (Apache-2.0 ✓), good-first-issues open, CI badge green,
   and a one-command `docker compose up` that actually boots.
5. **Warm up adjacent communities** (give-before-you-take): for 1–2 weeks, be a real
   participant in r/netsec, r/LocalLLaMA, r/devsecops, and relevant Slacks — answer
   PII/LLM-governance questions as a person, so a post later reads as a member sharing,
   not an ad.

---

## Phase 2 — Launch day (Hacker News)

**When:** Tuesday–Thursday, ~8:00–9:30am US Eastern (≈5:00–6:30am Pacific). This catches
the US morning ramp and gives the post the full day to climb. Avoid Fri/weekend/holidays.

**Title** (plain, no hype — HN punishes marketing speak; ≤80 chars). Recommended:

> **Show HN: ClawWarden – self-hosted proxy that hides PII from LLMs, and proves it**

Alternates if you want to test the framing:
- `Show HN: Run LLMs on sensitive data without the model seeing real PII`
- `Show HN: Tokenize PII before prompts leave your network (open source)`

**URL to submit:** the GitHub repo (Show HN rewards something people can immediately try).

**First comment — post it yourself within 60 seconds of submitting.** This is the
highest-leverage asset in the whole launch. Tell the story, be humble, link the proof,
and name your own limitations *before* the crowd does:

---

> Hi HN — I built ClawWarden because I kept seeing the same thing at regulated companies:
> analysts paste customer data into ChatGPT to get work done, security bans it, and the
> ban just pushes usage onto personal accounts and phones. Nobody can prove what was sent.
>
> ClawWarden is a self-hosted proxy that sits between your people and any LLM (local
> Ollama or your own OpenAI/Anthropic key). Before a prompt leaves your network it detects
> and reversibly tokenizes personal identifiers — the model sees `{{PERSON_1}}`, never
> `Jane Smith`. Tokenization is deterministic, so the same identifier maps to the same
> token across rows and a model can still run analytics over the data ("which borrowers
> are delinquent?") using tokens as keys. On the way back, identifiers are restored only
> for what the caller's role permits. Financial values (balances, scores, rates) are
> deliberately *not* tokenized, because privacy that destroys the numbers is useless.
>
> The second half is a tamper-evident audit log: every request is in a hash chain with a
> per-tenant continuous tip + a signed high-water mark + an append-only Postgres mirror,
> so an insider with DB access can't quietly edit, reorder, or delete records without
> `verify_chain()` catching it. The point is a record you can *prove* wasn't altered,
> not one you ask a regulator to trust.
>
> Honest limits: the published eval corpus is a scaffold (tens of examples) — the 100%
> recall / 0% residual-leak numbers hold *on that set*, and a production SLO needs a far
> bigger multi-domain corpus (the harness is built to consume one). The NER layer
> over-tags some temporal words as dates (over-redaction, not a leak). And a privileged
> operator who can drop the whole table or the signing key is outside the WORM boundary —
> the highest-assurance posture adds an external anchor like S3 Object Lock behind the
> same interface.
>
> It's Apache-2.0, no paid tier, no telemetry — bring your own key or run fully local.
> Quickstart, white paper (threat model + audit construction), and the eval harness are
> in the repo. I'd genuinely like to hear where the detection breaks and what the audit
> model misses — happy to go deep on either.

---

**Then: be in the thread all day.** Reply to every comment within minutes, technically and
humbly. A founder who answers hard questions well *is* the conversion event on HN.

### Tough questions to pre-write answers for
HN will ask these — have honest, specific answers ready (don't wing them):

| They'll ask | Your honest answer (prep the specifics) |
|---|---|
| "Why not just run Presidio yourself?" | ClawWarden *is* Presidio + spaCy under the hood — the value is the proxy boundary, deterministic reversible tokens that preserve analytics, role-aware detokenize, fail-closed default, and the tamper-evident audit. Detection is one of five parts. |
| "100% recall is a red flag." | Agreed — and it's on a tiny labeled scaffold, stated in §8 of the paper. Here's the harness and corpus; here's the regex-only contrast (75% / 25% leak). Bring a harder corpus and I'll run it live. |
| "Latency?" | ~4ms median / ~15ms p95 detection overhead on the eval set (warm model); link the number, note your test conditions. |
| "Insider can drop the table." | True and documented (§8). The WORM trigger makes it write-once *within* the DB; full assurance adds an external anchor (S3 Object Lock) behind the same interface — on the roadmap. |
| "How is this not just DLP/blocking?" | Blocking destroys utility and drives shadow usage; ClawWarden keeps the work usable (analytics preserved, reversible) instead of refusing the prompt. |
| "What's the business model / catch?" | None today — Apache-2.0, no telemetry, BYO key. If a managed/compliance-support offering comes later, the core stays open. (Say only what's true.) |

---

## Phase 3 — Ride the wave (same day → +72h)

Once the HN post has traction, fan out to the warmed communities **as a member**, each
post tailored (never copy-paste the same blurb):

- **lobste.rs** — submit under `security` / `privacy` tags (needs an invite; line one up
  in advance).
- **r/netsec**, **r/devsecops** — lead with the threat model and audit construction, not
  the product.
- **r/LocalLLaMA** — angle: "run local models on sensitive data, here's the PII boundary."
- **r/MachineLearning / r/LLMDevs** — angle: the deterministic-tokenization-preserves-
  analytics trick.
- **X / LinkedIn** — a founder narrative post: the pain (analysts pasting PII) → the
  insight (tokenize before transmission, keep it reversible) → the build → link. Tag the
  HN thread.
- **Relevant Slacks/Discords** (MLOps, AppSec, fintech-eng) — share where you've already
  been participating, read each one's self-promo rule first.

Read every community's self-promo rules. One genuine, tailored post per community beats
five copy-pasted ones that get you banned.

---

## Instrumentation — track the *real* funnel, not vanity clicks

Because there's no paid checkout yet, define activation as **a team that deploys it**, and
the conversion as **a design-partner conversation**. Wire these before launch day:

```
HN/Reddit visitor ─▶ GitHub repo ─▶ star / clone ─▶ docker up or pip install (ACTIVATION)
                                                          │
                                                          ▼
                                              design-partner reply / call (CONVERSION)
```

Concretely:
- **Site:** Plausible or PostHog on clawwarden.space; UTM-tag every link you post
  (`?utm_source=hn`, `=reddit_netsec`, `=lobsters`, etc.) so you know which community sent
  the *deployers*, not just the clicks.
- **GitHub:** record stars before/after, and pull the Traffic API (unique visitors, clones,
  referring sites) daily for the launch week.
- **Installs:** `pypistats` for `clawwarden` pip installs; Docker Hub pull count if you
  publish an image.
- **Demand signal:** waitlist signups and design-partner replies, tagged by source.
- **The one number that matters:** how many teams went from "saw it" → "running it" →
  "willing to talk." Double down on whichever community produced *those*, not the one with
  the most upvotes.

---

## Launch-day checklist

- [ ] Positioning sentence identical on site, README, HN comment, social posts.
- [ ] `docker compose up` and `pip install clawwarden` both verified working from a clean machine.
- [ ] Demo GIF + 60–90s video live and fast-loading.
- [ ] White paper + eval report published and one click from the repo.
- [ ] Plausible/PostHog live; UTM links generated for every channel.
- [ ] GitHub Traffic baseline screenshotted (so you can measure the delta).
- [ ] Tough-question answers written out (table above).
- [ ] lobste.rs invite + adjacent-community accounts warmed and ready.
- [ ] You are free the entire day to answer every comment within minutes.

---

## The single next marketing move

**Stand up the waitlist + "notify on launch" capture on clawwarden.space today, and start
recruiting 5 design partners by DM this week.** Everything else in this plan depends on
having a primed audience and 2–3 real deployers before you post to HN — a Show HN with
nobody behind it dies on page 2.

After the launch produces deployers, turn that demand into a revenue motion with
`/founder:sell` (pricing & packaging for a managed/compliance tier while the core stays
open).
