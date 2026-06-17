<p align="center">
  <img src="https://img.shields.io/badge/live-clawwarden.space-00d4ff?style=flat-square" alt="Live site" />
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vercel-deployed-000?style=flat-square&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
</p>

<h1 align="center">ClawWarden — UI</h1>

<p align="center">
  Marketing site and web interface for <a href="https://clawwarden.space">ClawWarden</a> — the AI privacy gateway for financial services.<br/>
  Built with Next.js 15 App Router, TypeScript, and Tailwind CSS.
</p>

<p align="center">
  <a href="https://clawwarden.space">Live Site</a> ·
  <a href="https://github.com/clawwarden/clawwarden-core">Gateway (clawwarden-core)</a> ·
  <a href="https://clawwarden.space/pricing">Pricing</a> ·
  <a href="https://clawwarden.space/security">Security</a> ·
  <a href="https://clawwarden.space/#waitlist">Waitlist</a>
</p>

---

## What's in this repo

| Route | Description |
|---|---|
| `/` | Full landing page — hero, demo, features, comparison, pricing, FAQ, waitlist |
| `/setup` | 3-step gateway setup wizard (provider → configure → test) |
| `/chat` | Browser chat UI — requires local gateway at `localhost:8000` |
| `/admin` | Audit log console — requires `admin` JWT + local gateway |
| `/login` · `/register` | Auth pages — functional when gateway is running |
| `/pricing` | Plan comparison — Starter (free), Professional ($299/mo), Enterprise |
| `/security` | 6-step security architecture walkthrough |
| `/compliance` | GLBA / GDPR / CCPA documentation |
| `/about` | Team and mission |
| `/terms` · `/privacy` | Legal pages |

---

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

> **Note:** `/chat` and `/admin` require the Python gateway running at `http://localhost:8000`.
> See [clawwarden-core](https://github.com/clawwarden/clawwarden-core) for gateway setup instructions.

---

## Deploy

The UI is deployed to [Vercel](https://vercel.com) from the project root.

```bash
npx vercel --prod
```

The Python gateway is **not** on Vercel — it runs locally or on your own infrastructure via Docker.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + inline styles (design system) |
| Fonts | Space Grotesk (UI) · JetBrains Mono (code) |
| Icons | Lucide React |
| Email | ``mailto:`` (waitlist form) |
| Hosting | Vercel |

---

## Related

- **[clawwarden-core](https://github.com/clawwarden/clawwarden-core)** — Python FastAPI gateway with Presidio NER, RBAC, Redis vault, audit trail
- **[clawwarden.space](https://clawwarden.space)** — Live hosted version
- **[clawwarden.space/#waitlist](https://clawwarden.space/#waitlist)** — Early access waitlist

---

## License

MIT
