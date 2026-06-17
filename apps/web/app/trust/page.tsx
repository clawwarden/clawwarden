import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  FileLock2,
  Server,
  ScrollText,
  GitBranch,
  AlertTriangle,
} from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "ClawWarden Trust Center — security posture, data handling, audit integrity, compliance status, and responsible disclosure. Stated honestly.",
  alternates: { canonical: "https://clawwarden.space/trust" },
};

const POSTURE = [
  {
    icon: Server,
    title: "Self-host = your data residency",
    body: "Run the open source engine inside your own perimeter. With local models, prompts and PII never leave your network — there is no ClawWarden cloud in the path and nothing to trust us with.",
  },
  {
    icon: FileLock2,
    title: "Tamper-evident audit",
    body: "Governance decisions are hash-chained into an append-only ledger; edits or deletions break the chain and are blocked at the database (WORM). Evidence packs export a verified, date-ranged trail.",
  },
  {
    icon: GitBranch,
    title: "Open to inspection",
    body: "The SDKs, reference detectors, classifier, and contracts are Apache-2.0. Clone, run SAST/SCA, and audit every line before it touches your stack — no black box.",
  },
  {
    icon: ScrollText,
    title: "Least-privilege by design",
    body: "Role-based detokenization at the token level, tenant-scoped data, and Row-Level Security scaffolding (defense-in-depth) so a junior analyst and a VP never see the same response.",
  },
];

// Honest status — NOT certification claims.
const STATUS: [string, string, string][] = [
  ["SOC 2 Type II", "In progress", "Not yet audited. We map controls to SOC 2 today; an independent Type II report is on the roadmap. We will not claim a report we don't hold."],
  ["Data Processing Agreement", "On request", "A DPA is available to enterprise evaluators. Self-host deployments process no data on our infrastructure."],
  ["Penetration test", "Planned", "Third-party pen test planned ahead of GA; results shared under NDA."],
  ["NIST AI RMF / SR 11-7 / GLBA / GDPR", "Mapped", "Controls and evidence are mapped to these frameworks (see Compliance). Final determinations rest with your legal/compliance teams."],
];

export default function TrustPage() {
  return (
    <>
      <SiteNav />
      <main style={{ background: "var(--paper)", minHeight: "100vh", paddingTop: "120px" }}>
        <div className="wrap">
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid var(--rule-strong)" }}>
            <span className="eyebrow">Trust Center</span>
            <span className="eyebrow">Stated honestly</span>
          </div>

          <div className="split-2" style={{ marginTop: "48px", alignItems: "end" }}>
            <h1 className="display display-lg" style={{ maxWidth: "16ch" }}>
              No trust theater. Just the posture.
            </h1>
            <p className="lede">
              Banks reject vendors who overclaim. So here is exactly what is true today, what
              isn't yet, and how to verify all of it yourself.
            </p>
          </div>

          {/* Posture */}
          <div className="split-2" style={{ marginTop: "56px", gap: "0", borderTop: "1px solid var(--rule-strong)" }}>
            {POSTURE.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  style={{
                    padding: "30px clamp(16px,3vw,36px) 30px 0",
                    borderBottom: "1px solid var(--rule)",
                    borderRight: i % 2 === 0 ? "1px solid var(--rule)" : "none",
                    paddingLeft: i % 2 === 1 ? "clamp(16px,3vw,36px)" : "0",
                  }}
                >
                  <Icon size={22} color="var(--vault)" strokeWidth={1.6} />
                  <h3 className="display" style={{ fontSize: "1.25rem", fontWeight: 500, marginTop: "14px" }}>{p.title}</h3>
                  <p style={{ marginTop: "8px", fontSize: "0.94rem", lineHeight: 1.65, color: "var(--ink-soft)" }}>{p.body}</p>
                </div>
              );
            })}
          </div>

          {/* Honest status ledger */}
          <h2 className="display display-md" style={{ marginTop: "clamp(64px,9vw,110px)" }}>Certifications & status</h2>
          <p style={{ marginTop: "12px", color: "var(--ink-soft)", maxWidth: "60ch" }}>
            We publish status, not badges. Where something isn't done, we say so.
          </p>
          <div className="panel" style={{ marginTop: "28px", overflow: "hidden" }}>
            {STATUS.map(([name, state, note], i) => (
              <div
                key={name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px, 1.2fr) 120px 2fr",
                  gap: "clamp(12px,3vw,32px)",
                  padding: "18px 22px",
                  borderBottom: i < STATUS.length - 1 ? "1px solid var(--rule)" : "none",
                  alignItems: "baseline",
                }}
                className="compliance-row"
              >
                <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>{name}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: "0.7rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: state === "Mapped" || state === "On request" ? "var(--vault)" : "var(--gold)",
                  }}
                >
                  {state}
                </span>
                <span style={{ fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>{note}</span>
              </div>
            ))}
          </div>

          {/* Verify it yourself */}
          <div className="panel-ink" style={{ marginTop: "48px", padding: "clamp(28px,4vw,48px)" }}>
            <span className="eyebrow" style={{ color: "rgba(241,236,225,0.6)" }}>Don't take our word for it</span>
            <h2 className="display" style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", fontWeight: 500, color: "var(--paper)", marginTop: "14px", maxWidth: "20ch" }}>
              Audit the source. Run it offline. Then decide.
            </h2>
            <div style={{ display: "flex", gap: "12px", marginTop: "26px", flexWrap: "wrap" }}>
              <a href="https://github.com/clawwarden/clawwarden" target="_blank" rel="noopener noreferrer" className="btn" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                Inspect the repository
              </a>
              <Link href="/security" className="btn" style={{ background: "transparent", color: "var(--paper)", border: "1px solid rgba(241,236,225,0.3)" }}>
                Security architecture
              </Link>
            </div>
          </div>

          {/* Disclosure */}
          <div style={{ marginTop: "48px", display: "flex", gap: "12px", alignItems: "flex-start", paddingBottom: "20px" }}>
            <AlertTriangle size={20} color="var(--signal)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <p style={{ fontSize: "0.95rem", color: "var(--ink-soft)", margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: "var(--ink)" }}>Responsible disclosure.</strong> Report
              vulnerabilities to{" "}
              <a className="link-underline" href="mailto:security@clawwarden.space">security@clawwarden.space</a>{" "}
              or via{" "}
              <a className="link-underline" href="https://github.com/clawwarden/clawwarden/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">
                SECURITY.md
              </a>. Enterprise evaluators: request our entity details, DPA, and architecture brief
              at <a className="link-underline" href="/contact">contact</a>.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
