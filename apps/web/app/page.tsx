"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Plus, Minus } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

// ── reveal-on-scroll helper ───────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-reveal style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

// ── eyebrow with section number ───────────────────────────────────────────
function Marker({ no, label, tone }: { no: string; label: string; tone?: "vault" | "signal" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
      <span className="section-no">{no}</span>
      <span className="rule" style={{ flex: "0 0 28px" }} />
      <span className={`eyebrow ${tone === "vault" ? "eyebrow-vault" : tone === "signal" ? "eyebrow-signal" : ""}`}>
        {label}
      </span>
    </div>
  );
}

// ── interactive redaction → token demo ────────────────────────────────────
function RedactionDemo() {
  const [tokenized, setTokenized] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTokenized(true), 1100);
    return () => clearTimeout(t);
  }, []);

  const Piece = ({ raw, token }: { raw: string; token: string }) =>
    tokenized ? (
      <span className="tok">{token}</span>
    ) : (
      <span className="redact">{raw}</span>
    );

  return (
    <div className="panel" style={{ overflow: "hidden", boxShadow: "0 24px 60px rgba(23,21,15,0.10)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid var(--rule)",
          background: "var(--paper-deep)",
        }}
      >
        <span className="mono" style={{ fontSize: "0.7rem", color: "var(--ink-faint)", letterSpacing: "0.08em" }}>
          clawwarden · gateway · outbound
        </span>
        <span
          className="mono"
          style={{ fontSize: "0.66rem", color: tokenized ? "var(--vault)" : "var(--signal)", letterSpacing: "0.08em" }}
        >
          {tokenized ? "● TOKENIZED — SAFE TO SEND" : "● RAW — CONTAINS PII"}
        </span>
      </div>

      <div style={{ padding: "26px 24px" }}>
        <p
          className="display"
          style={{ fontSize: "1.18rem", fontWeight: 400, lineHeight: 1.7, letterSpacing: "-0.005em", color: "var(--ink)" }}
        >
          Approve a <strong style={{ fontWeight: 600 }}>$42,500</strong> loan for{" "}
          <Piece raw="Jane Smith" token="{{PERSON_1}}" /> — SSN{" "}
          <Piece raw="123-45-6789" token="{{SSN_1}}" />, account{" "}
          <Piece raw="ACC-00198234" token="{{ACCT_1}}" />. Credit score{" "}
          <strong style={{ fontWeight: 600 }}>742</strong>, <strong style={{ fontWeight: 600 }}>0</strong> days past due.
        </p>

        <div
          style={{
            marginTop: "22px",
            paddingTop: "18px",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>
            Identifiers redacted · financial values{" "}
            <span style={{ color: "var(--vault)", fontWeight: 600 }}>preserved for analytics</span>.
          </span>
          <button
            onClick={() => setTokenized((v) => !v)}
            className="btn btn-line"
            style={{ padding: "8px 14px", fontSize: "0.8rem" }}
          >
            {tokenized ? "View raw" : "View tokenized"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── data ───────────────────────────────────────────────────────────────────
const STATS = [
  ["< 8ms", "added latency / request"],
  ["14+", "PII entity types"],
  ["100%", "prompts tokenized first"],
  ["0", "raw PII stored"],
];

const PLANES = [
  {
    no: "01",
    name: "Input governance",
    sub: "ClawWarden",
    body: "Classify and tokenize PII and MNPI before any prompt leaves your network. Role-aware detokenization on the way back — and financial variables stay intact so analytics never break.",
    points: ["Semantic + NER classification", "Reversible tokenization", "Role-based disclosure"],
  },
  {
    no: "02",
    name: "Runtime & safety",
    sub: "AgentGuard · FIN-SAFE",
    body: "Watch what models actually do. Detect prompt injection, PII leakage, and jailbreaks on input and output, score model risk, and track cost-per-success verdicts per agent.",
    points: ["Injection & jailbreak detection", "PII-leakage screening", "Model-risk scoring"],
  },
  {
    no: "03",
    name: "Governance engine",
    sub: "The trust fabric",
    body: "Versioned policies, dual-approval with separation of duties, and a hash-chained, append-only audit log. Export evidence packs a risk committee — and a regulator — will accept.",
    points: ["Policy versioning + approvals", "Immutable audit chain", "Evidence packs"],
  },
];

const FLOW = [
  ["Classify", "Sensitivity and entities are scored at the edge."],
  ["Tokenize", "Restricted data becomes reversible tokens. The model never sees raw PII."],
  ["Screen", "FIN-SAFE checks input and output for injection, leakage, and jailbreaks."],
  ["Detokenize", "Values are restored — only for roles authorized to see them."],
  ["Prove", "Every decision lands in the immutable audit chain with evidence."],
];

const AUDIT_ROWS = [
  ["014", "policy.enforced", "high", "9f3c…a1"],
  ["015", "pii.detokenized", "info", "b72e…4d"],
  ["016", "approval.decision", "info", "1c08…e9"],
  ["017", "evidence.pack_built", "info", "44af…02"],
];

const FRAMEWORKS = ["NIST AI RMF", "SOC 2 Type II", "Fed SR 11-7", "GLBA", "GDPR", "EU AI Act", "OWASP LLM Top 10", "MITRE ATLAS"];


const FAQ = [
  ["Does the LLM ever see raw PII?", "No. The gateway classifies and tokenizes detected identifiers before the prompt is forwarded. For cloud providers the tokenized prompt travels to their API with no raw PII; for local models nothing leaves your machine. The token vault is encrypted and never transmitted."],
  ["Does tokenization break analytics?", "No — that's the core design choice. Balances, credit scores, rates, risk flags and other financial variables are preserved in full. Only direct identifiers are tokenized, so the model can still compute real numbers."],
  ["What makes the audit trail credible to regulators?", "It's append-only and hash-chained: each entry links to the previous one, so any edit or deletion breaks the chain and is detectable. Evidence packs bundle the verified chain, control coverage, and linked artifacts for a date range."],
  ["What's open-source vs paid?", "The interfaces, reference detectors, classifier, integrations, and SDKs are Apache-2.0 and run standalone forever. The tuned detectors, semantic sensitivity model, BFSI risk taxonomy, and managed governance are the commercial core — they plug in behind the same interfaces."],
];

// ── faq item ────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--rule)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          padding: "22px 0",
          textAlign: "left",
        }}
      >
        <span className="display" style={{ fontSize: "1.12rem", fontWeight: 500, color: "var(--ink)" }}>
          {q}
        </span>
        {open ? <Minus size={18} color="var(--vault)" /> : <Plus size={18} color="var(--ink-faint)" />}
      </button>
      {open && (
        <p style={{ padding: "0 0 24px", fontSize: "0.96rem", lineHeight: 1.7, color: "var(--ink-soft)", maxWidth: "70ch" }}>
          {a}
        </p>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ background: "var(--paper)", minHeight: "100vh", overflowX: "hidden" }}>
      <SiteNav />

      {/* ── HERO ── */}
      <header style={{ paddingTop: "120px" }}>
        <div className="wrap">
          {/* masthead rule */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "14px",
              borderBottom: "1px solid var(--rule-strong)",
              marginBottom: "clamp(36px,6vw,64px)",
            }}
          >
            <span className="eyebrow">Est. for regulated AI</span>
            <span className="eyebrow">No. 01 — The Trust Layer</span>
          </div>

          <div className="split-2" style={{ alignItems: "center", gap: "clamp(36px,5vw,80px)" }}>
            <div>
              <h1 className="display display-xl">
                The trust layer
                <br />
                between your
                <br />
                enterprise and{" "}
                <span className="serif-italic" style={{ color: "var(--vault)" }}>
                  its LLMs.
                </span>
              </h1>
              <p className="lede" style={{ marginTop: "28px", maxWidth: "44ch" }}>
                Keep regulated data out of prompts. Catch runtime AI risk as it happens. Produce the
                audit evidence regulators ask for — on one open source platform.
              </p>
              <div style={{ display: "flex", gap: "12px", marginTop: "36px", flexWrap: "wrap" }}>
                <Link href="/tokenize" className="btn btn-ink" style={{ padding: "14px 26px", fontSize: "0.98rem" }}>
                  Try the demo <ArrowRight size={17} />
                </Link>
                <a
                  href="https://github.com/clawwarden/clawwarden"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-line"
                  style={{ padding: "14px 24px", fontSize: "0.98rem" }}
                >
                  Read the source <ArrowUpRight size={16} />
                </a>
              </div>
            </div>

            <Reveal delay={120}>
              <RedactionDemo />
            </Reveal>
          </div>

          {/* stats ledger */}
          <div
            className="stats-grid"
            style={{
              marginTop: "clamp(48px,7vw,88px)",
              borderTop: "1px solid var(--rule-strong)",
              borderBottom: "1px solid var(--rule-strong)",
            }}
          >
            {STATS.map(([v, l], i) => (
              <div
                key={l}
                style={{
                  padding: "26px 22px",
                  borderRight: i < STATS.length - 1 ? "1px solid var(--rule)" : "none",
                }}
              >
                <div className="display" style={{ fontSize: "2.2rem", fontWeight: 600, color: "var(--vault)" }}>
                  {v}
                </div>
                <div className="mono" style={{ fontSize: "0.72rem", color: "var(--ink-faint)", marginTop: "6px", letterSpacing: "0.04em" }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
          <p className="mono" style={{ fontSize: "0.68rem", color: "var(--ink-faint)", marginTop: "12px", lineHeight: 1.5 }}>
            * p95 added latency tokenizing a 512-token prompt with 5 PII entities (local Presidio,
            en_core_web_lg). Varies by host hardware and entity density — benchmark on your own infra.
          </p>
        </div>
      </header>

      {/* ── THREE PLANES ── */}
      <section id="platform" style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <Reveal>
            <Marker no="01" label="The platform" tone="vault" />
            <h2 className="display display-lg" style={{ maxWidth: "20ch" }}>
              Three planes, one trust fabric.
            </h2>
            <p className="lede" style={{ marginTop: "18px", maxWidth: "58ch" }}>
              Most teams bolt point tools onto AI after the fact. ClawWarden governs the whole path —
              what goes in, what comes out, and the record that proves it.
            </p>
          </Reveal>

          <div className="cols-3" style={{ marginTop: "56px", borderTop: "1px solid var(--rule-strong)" }}>
            {PLANES.map((p, i) => (
              <Reveal key={p.no} delay={i * 90}>
                <div
                  style={{
                    padding: "34px 28px 38px",
                    borderRight: i < PLANES.length - 1 ? "1px solid var(--rule)" : "none",
                    height: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span className="display" style={{ fontSize: "2.4rem", fontWeight: 500, color: "var(--ink-faint)" }}>
                      {p.no}
                    </span>
                    <span className="mono" style={{ fontSize: "0.66rem", color: "var(--vault)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {p.sub}
                    </span>
                  </div>
                  <h3 className="display" style={{ fontSize: "1.5rem", fontWeight: 600, marginTop: "16px" }}>
                    {p.name}
                  </h3>
                  <p style={{ fontSize: "0.95rem", lineHeight: 1.65, color: "var(--ink-soft)", marginTop: "12px" }}>
                    {p.body}
                  </p>
                  <div style={{ marginTop: "22px", display: "flex", flexDirection: "column", gap: "9px" }}>
                    {p.points.map((pt) => (
                      <div key={pt} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                        <Check size={15} color="var(--vault)" strokeWidth={2.5} />
                        <span style={{ fontSize: "0.86rem", color: "var(--ink)" }}>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCOPE: what it is / isn't ── */}
      <section style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <Reveal>
            <Marker no="·" label="Scope, honestly" tone="vault" />
            <h2 className="display display-md" style={{ maxWidth: "22ch" }}>
              The trust layer — not a replacement for your whole AI stack.
            </h2>
          </Reveal>
          <div className="split-2" style={{ marginTop: "40px", gap: "0", borderTop: "1px solid var(--rule-strong)" }}>
            <Reveal>
              <div style={{ padding: "28px clamp(20px,3vw,40px) 28px 0", borderRight: "1px solid var(--rule)", height: "100%" }}>
                <span className="eyebrow eyebrow-vault">What ClawWarden does</span>
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[
                    "Tokenize PII/MNPI before prompts leave your network",
                    "Role-aware detokenization (RBAC at the token level)",
                    "Runtime screening: prompt injection, PII leakage, jailbreaks",
                    "Versioned policy + immutable, hash-chained audit + evidence packs",
                    "OpenTelemetry / SIEM / OIDC integration hooks",
                  ].map((t) => (
                    <div key={t} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <Check size={15} color="var(--vault)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "3px" }} />
                      <span style={{ fontSize: "0.92rem", color: "var(--ink)" }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div style={{ padding: "28px 0 28px clamp(20px,3vw,40px)", height: "100%" }}>
                <span className="eyebrow" style={{ color: "var(--ink-faint)" }}>What it isn't (use alongside)</span>
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[
                    "Not a full model-risk-management (SR 11-7) suite",
                    "Not your LLM gateway/router — it sits in front of one",
                    "Not broad endpoint DLP or CASB",
                    "Not an APM / observability platform (it feeds yours)",
                    "Not an IAM/SSO provider (it integrates with yours)",
                  ].map((t) => (
                    <div key={t} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ color: "var(--ink-faint)", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>—</span>
                      <span style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>{t}</span>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: "18px", fontSize: "0.85rem", color: "var(--ink-faint)", lineHeight: 1.6 }}>
                  ClawWarden is the governance &amp; privacy control point — it complements your routing,
                  IAM, and observability rather than replacing them.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM (op-ed) ── */}
      <section style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap-narrow" style={{ textAlign: "center" }}>
          <Reveal>
            <span className="eyebrow eyebrow-signal">The collision</span>
            <p
              className="display"
              style={{ fontSize: "clamp(1.7rem,3.4vw,2.6rem)", fontWeight: 500, lineHeight: 1.28, marginTop: "20px", letterSpacing: "-0.015em" }}
            >
              A bank doesn't ask{" "}
              <span style={{ color: "var(--ink-faint)" }}>"how many tokens did the model use?"</span>{" "}
              It asks whether an AI system{" "}
              <span className="serif-italic" style={{ color: "var(--signal)" }}>
                violated lending policy
              </span>{" "}
              or exposed{" "}
              <span className="serif-italic" style={{ color: "var(--signal)" }}>
                regulated customer data.
              </span>
            </p>
            <p style={{ fontSize: "0.98rem", color: "var(--ink-soft)", marginTop: "24px", maxWidth: "60ch", marginInline: "auto", lineHeight: 1.7 }}>
              Analysts paste SSNs into chatbots. Cloud models retain prompts. Junior staff see
              VP-level data. Every unguarded prompt is a compliance incident waiting for an auditor.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <Reveal>
            <Marker no="02" label="How it works" tone="vault" />
            <h2 className="display display-lg" style={{ maxWidth: "16ch" }}>
              One governed round-trip.
            </h2>
          </Reveal>
          <div style={{ marginTop: "48px", borderTop: "1px solid var(--rule-strong)" }}>
            {FLOW.map(([t, d], i) => (
              <Reveal key={t} delay={i * 60}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr",
                    gap: "clamp(16px,4vw,48px)",
                    alignItems: "baseline",
                    padding: "26px 0",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <span className="mono" style={{ fontSize: "0.8rem", color: "var(--vault)" }}>
                    0{i + 1}
                  </span>
                  <div style={{ display: "flex", gap: "clamp(16px,4vw,48px)", flexWrap: "wrap", alignItems: "baseline" }}>
                    <h3 className="display" style={{ fontSize: "1.5rem", fontWeight: 500, minWidth: "180px" }}>
                      {t}
                    </h3>
                    <p style={{ fontSize: "0.98rem", color: "var(--ink-soft)", lineHeight: 1.6, flex: 1, minWidth: "260px" }}>
                      {d}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── GOVERNANCE / AUDIT LEDGER ── */}
      <section id="governance" style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <div className="split-2" style={{ alignItems: "center" }}>
            <Reveal>
              <Marker no="03" label="The governance engine" tone="vault" />
              <h2 className="display display-lg" style={{ maxWidth: "16ch" }}>
                History you can't quietly rewrite.
              </h2>
              <p className="lede" style={{ marginTop: "18px", maxWidth: "50ch" }}>
                Every policy decision, override, and detokenization is hash-chained into an
                append-only ledger. Change one row and the chain breaks — visibly.
              </p>
              <div style={{ marginTop: "26px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {["Policy versioning with dual-approval", "Separation of duties enforced", "Evidence packs for a 90-day window"].map((t) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Check size={16} color="var(--vault)" strokeWidth={2.5} />
                    <span style={{ fontSize: "0.92rem" }}>{t}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="panel" style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--rule)", background: "var(--paper-deep)", display: "flex", justifyContent: "space-between" }}>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>audit_events — tenant ledger</span>
                  <span className="mono" style={{ fontSize: "0.66rem", color: "var(--vault)" }}>● chain verified</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 64px 78px", padding: "10px 18px", borderBottom: "1px solid var(--rule)" }}>
                  {["seq", "event", "sev", "hash"].map((h) => (
                    <span key={h} className="mono" style={{ fontSize: "0.64rem", color: "var(--ink-faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>
                {AUDIT_ROWS.map(([seq, ev, sev, hash]) => (
                  <div key={seq} style={{ display: "grid", gridTemplateColumns: "44px 1fr 64px 78px", padding: "11px 18px", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: "0.74rem", color: "var(--ink-faint)" }}>{seq}</span>
                    <span className="mono" style={{ fontSize: "0.76rem", color: "var(--ink)" }}>{ev}</span>
                    <span className="mono" style={{ fontSize: "0.66rem", color: sev === "high" ? "var(--signal)" : "var(--ink-faint)" }}>{sev}</span>
                    <span className="mono" style={{ fontSize: "0.7rem", color: "var(--vault)" }}>{hash}</span>
                  </div>
                ))}
                <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="mono" style={{ fontSize: "0.66rem", color: "var(--ink-faint)" }}>
                    each entry_hash links to the previous · WORM-enforced
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── OPEN SOURCE ── */}
      <section style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <div className="panel-ink" style={{ padding: "clamp(32px,5vw,64px)", overflow: "hidden" }}>
            <div className="split-2" style={{ alignItems: "center" }}>
              <Reveal>
                <span className="eyebrow" style={{ color: "rgba(241,236,225,0.6)" }}>Open core · Apache-2.0</span>
                <h2 className="display display-lg" style={{ color: "var(--paper)", marginTop: "18px", maxWidth: "16ch" }}>
                  Start on the open reference. Upgrade the brains.
                </h2>
                <p style={{ color: "rgba(241,236,225,0.72)", marginTop: "18px", fontSize: "1rem", lineHeight: 1.7, maxWidth: "48ch" }}>
                  The interfaces, reference detectors, classifier, integrations, and SDKs are open and
                  run standalone forever. The tuned detectors, semantic model, and BFSI taxonomy plug
                  in behind the same interfaces.
                </p>
                <a
                  href="https://github.com/clawwarden/clawwarden"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{ marginTop: "30px", background: "var(--paper)", color: "var(--ink)", padding: "13px 22px" }}
                >
                  Explore the repository <ArrowUpRight size={16} />
                </a>
              </Reveal>

              <Reveal delay={120}>
                <pre
                  className="mono"
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(241,236,225,0.12)",
                    borderRadius: "3px",
                    padding: "22px",
                    fontSize: "0.8rem",
                    lineHeight: 1.7,
                    color: "rgba(241,236,225,0.9)",
                    overflowX: "auto",
                  }}
                >
{`import {
  DetectorRegistry,
  referenceDetectors,
} from 'clawwarden-finsafe-core';

const registry = new DetectorRegistry(
  referenceDetectors(),
);

const findings = await registry.scan({
  phase: 'input',
  text: userPrompt,
});
// → [{ category: 'prompt_injection',
//      severity: 'high', ... }]`}
                </pre>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE STRIP ── */}
      <section style={{ paddingTop: "clamp(64px,9vw,110px)" }}>
        <div className="wrap">
          <p className="eyebrow" style={{ textAlign: "center", marginBottom: "24px" }}>
            Mapped to the frameworks your auditors use
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "10px 12px",
              borderTop: "1px solid var(--rule)",
              borderBottom: "1px solid var(--rule)",
              padding: "26px 0",
            }}
          >
            {FRAMEWORKS.map((f) => (
              <span key={f} className="chip">{f}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── OPEN SOURCE ── */}
      <section id="pricing" style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <Reveal>
            <Marker no="04" label="Open source" tone="vault" />
            <h2 className="display display-lg">Free. Forever. Apache-2.0.</h2>
            <p style={{ fontSize: "1rem", lineHeight: 1.65, marginTop: "18px", maxWidth: "62ch", color: "var(--ink-soft)" }}>
              ClawWarden is fully open source — no paid tier, no locked features, no
              telemetry. Self-host it, read every line, fork it, ship it. Bring your own
              API key or run a local model. You hold the keys and the data.
            </p>
            <div style={{ display: "flex", gap: "12px", marginTop: "30px", flexWrap: "wrap" }}>
              <a href="https://github.com/clawwarden/clawwarden" target="_blank" rel="noopener noreferrer" className="btn btn-vault">
                View on GitHub
              </a>
              <Link href="/setup" className="btn btn-line">Quickstart</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ paddingTop: "clamp(80px,12vw,140px)" }}>
        <div className="wrap">
          <div className="split-2" style={{ gap: "clamp(28px,5vw,80px)", alignItems: "start" }}>
            <Reveal>
              <Marker no="05" label="Questions" tone="vault" />
              <h2 className="display display-lg" style={{ maxWidth: "12ch" }}>
                The honest answers.
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <div>
                {FAQ.map(([q, a]) => (
                  <FaqItem key={q} q={q} a={a} />
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ── */}
      <section style={{ paddingTop: "clamp(90px,13vw,150px)" }}>
        <div className="wrap-narrow" style={{ textAlign: "center" }}>
          <Reveal>
            <h2 className="display" style={{ fontSize: "clamp(2.2rem,5vw,3.8rem)", fontWeight: 500, lineHeight: 1.08 }}>
              Make your AI{" "}
              <span className="serif-italic" style={{ color: "var(--vault)" }}>
                provable.
              </span>
            </h2>
            <p className="lede" style={{ marginTop: "20px", maxWidth: "46ch", marginInline: "auto" }}>
              Fully open source, self-hosted, your keys and your data. Run it in minutes —
              or try the live tokenizer in your browser, no install.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "34px", flexWrap: "wrap" }}>
              <Link href="/tokenize" className="btn btn-ink" style={{ padding: "14px 28px", fontSize: "1rem" }}>
                Try it live <ArrowRight size={17} />
              </Link>
              <a href="https://github.com/clawwarden/clawwarden" target="_blank" rel="noopener noreferrer" className="btn btn-line" style={{ padding: "14px 26px", fontSize: "1rem" }}>
                View on GitHub
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
