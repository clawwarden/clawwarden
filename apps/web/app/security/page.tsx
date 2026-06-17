import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Lock, FileLock2, KeyRound, ServerCog, Network } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Security",
  description:
    "ClawWarden security architecture: tokenization at the edge, tamper-evident audit chain, role-based disclosure, zero-trust tenant isolation, and enterprise deployment.",
  alternates: { canonical: "https://clawwarden.space/security" },
};

const CONTROLS = [
  { icon: Lock, title: "PII never leaves un-tokenized", body: "Detected identifiers are tokenized at the gateway before any prompt is forwarded. With local models, nothing leaves your network at all. The token vault is encrypted at rest and never transmitted." },
  { icon: FileLock2, title: "Tamper-evident audit chain", body: "Every governance decision is hash-chained into an append-only ledger. Each entry links to the previous one; edits or deletions break the chain and are blocked at the database (WORM)." },
  { icon: KeyRound, title: "Role-based disclosure", body: "Detokenization is enforced per role at the token level — a junior analyst and a VP never see the same response. Access decisions are themselves audited." },
  { icon: Network, title: "Zero-trust tenant isolation", body: "Every record is tenant-scoped and every query is filtered; row-level security enforces it at the database as defense-in-depth." },
  { icon: KeyRound, title: "Secrets & key management", body: "Signing keys, provider credentials, and the token-encryption key live in a secrets provider, never in source. Rotation is key-id based with a grace window so it never invalidates in-flight sessions." },
  { icon: ServerCog, title: "Deploy on your terms", body: "Self-host with Docker, run in a private VPC, or keep everything on-prem with local models. No data egress required for the core privacy guarantee." },
];

export default function SecurityPage() {
  return (
    <>
      <SiteNav />
      <main style={{ background: "var(--paper)", minHeight: "100vh", paddingTop: "120px" }}>
        <div className="wrap">
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid var(--rule-strong)" }}>
            <span className="eyebrow">Security</span>
            <span className="eyebrow">Architecture &amp; posture</span>
          </div>

          <div className="split-2" style={{ marginTop: "48px", alignItems: "end" }}>
            <h1 className="display display-lg" style={{ maxWidth: "16ch" }}>
              Built to be trusted by people who trust nothing.
            </h1>
            <p className="lede">
              Banks don't buy diagrams — they buy controls, isolation, auditability, and evidence.
              Here's how ClawWarden is constructed to earn a pilot.
            </p>
          </div>

          {/* Trust boundary diagram */}
          <div className="panel" style={{ marginTop: "56px", padding: "clamp(24px,4vw,44px)", background: "var(--ink)", color: "var(--paper)" }}>
            <span className="eyebrow" style={{ color: "rgba(241,236,225,0.6)" }}>The trust boundary</span>
            <p className="display" style={{ fontSize: "clamp(1.3rem,2.6vw,2rem)", fontWeight: 400, lineHeight: 1.4, marginTop: "16px", maxWidth: "30ch", color: "var(--paper)" }}>
              Raw data stays <span className="serif-italic" style={{ color: "#7fd1a8" }}>inside</span>. The model
              provider lives <span className="serif-italic" style={{ color: "#e0a08f" }}>outside</span>. The line
              between them is enforced, not assumed.
            </p>
            <p className="mono" style={{ fontSize: "0.74rem", color: "rgba(241,236,225,0.55)", marginTop: "20px" }}>
              your network ─▶ classify ─▶ tokenize ─▶ [ boundary ] ─▶ LLM ─▶ screen ─▶ detokenize (by role) ─▶ audit
            </p>
          </div>

          {/* Controls grid */}
          <div className="split-2" style={{ marginTop: "56px", gap: "0", borderTop: "1px solid var(--rule-strong)" }}>
            {CONTROLS.map((c, i) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  style={{
                    padding: "30px clamp(16px,3vw,36px) 30px 0",
                    borderBottom: "1px solid var(--rule)",
                    borderRight: i % 2 === 0 ? "1px solid var(--rule)" : "none",
                    paddingLeft: i % 2 === 1 ? "clamp(16px,3vw,36px)" : "0",
                  }}
                >
                  <Icon size={22} color="var(--vault)" strokeWidth={1.6} />
                  <h3 className="display" style={{ fontSize: "1.25rem", fontWeight: 500, marginTop: "14px" }}>{c.title}</h3>
                  <p style={{ marginTop: "8px", fontSize: "0.94rem", lineHeight: 1.65, color: "var(--ink-soft)" }}>{c.body}</p>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "56px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <ShieldCheck size={20} color="var(--vault)" />
            <p style={{ fontSize: "0.95rem", color: "var(--ink-soft)", margin: 0 }}>
              Found a vulnerability? Read our{" "}
              <a className="link-underline" href="https://github.com/clawwarden/clawwarden/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">
                responsible-disclosure policy
              </a>{" "}
              or email <a className="link-underline" href="mailto:security@clawwarden.space">security@clawwarden.space</a>.
            </p>
          </div>

          <div style={{ marginTop: "40px", display: "flex", gap: "12px", flexWrap: "wrap", paddingBottom: "20px" }}>
            <Link href="/compliance" className="btn btn-ink">Compliance &amp; frameworks</Link>
            <Link href="/setup" className="btn btn-line">Get started</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
