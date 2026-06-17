import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Compliance",
  description:
    "How ClawWarden maps to the frameworks regulated institutions answer to: NIST AI RMF, SOC 2, Fed SR 11-7, GLBA, GDPR, EU AI Act, ISO 42001.",
  alternates: { canonical: "https://clawwarden.space/compliance" },
};

const FRAMEWORKS: { code: string; name: string; how: string }[] = [
  { code: "NIST AI RMF", name: "AI Risk Management Framework + GenAI Profile", how: "Risk domains, runtime safety evaluation, and the ability to supersede or gate an AI system map to GOVERN / MEASURE / MANAGE functions." },
  { code: "Fed SR 11-7", name: "Model Risk Management", how: "Ongoing monitoring of model use, versioned policies, approvals, and immutable documentation of controls." },
  { code: "SOC 2", name: "Type II — Common Criteria", how: "Logical access (RBAC, tenant isolation), monitoring of components for anomalies, and security-event response." },
  { code: "GLBA", name: "Gramm-Leach-Bliley (US financial)", how: "Customer identifiers never leave your network in raw form; access is need-to-know; every disclosure is logged." },
  { code: "GDPR", name: "EU data protection", how: "Data minimization via tokenization, role-based disclosure, and an auditable record of processing." },
  { code: "EU AI Act", name: "High-risk system obligations", how: "Risk classification, human-oversight workflows, logging, and evidence for high-risk use cases such as credit scoring." },
  { code: "ISO/IEC 42001", name: "AI management system", how: "Policy lifecycle, control mapping, and continuous evidence collection support an AI management system." },
];

export default function CompliancePage() {
  return (
    <>
      <SiteNav />
      <main style={{ background: "var(--paper)", minHeight: "100vh", paddingTop: "120px" }}>
        <div className="wrap">
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid var(--rule-strong)" }}>
            <span className="eyebrow">Compliance</span>
            <span className="eyebrow">Evidence, not promises</span>
          </div>

          <div className="split-2" style={{ marginTop: "48px", alignItems: "end" }}>
            <h1 className="display display-lg" style={{ maxWidth: "16ch" }}>
              Mapped to the frameworks your auditors already use.
            </h1>
            <p className="lede">
              ClawWarden doesn't claim certifications it doesn't hold. It gives you the controls and the
              evidence — versioned policies, an immutable audit chain, and exportable evidence packs —
              that compliance teams assemble those certifications from.
            </p>
          </div>

          {/* Framework ledger */}
          <div style={{ marginTop: "56px", borderTop: "1px solid var(--rule-strong)" }}>
            {FRAMEWORKS.map((f) => (
              <div
                key={f.code}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 1fr",
                  gap: "clamp(16px,4vw,48px)",
                  padding: "26px 0",
                  borderBottom: "1px solid var(--rule)",
                }}
                className="compliance-row"
              >
                <div>
                  <div className="mono" style={{ fontSize: "0.78rem", color: "var(--vault)", letterSpacing: "0.04em" }}>{f.code}</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginTop: "4px" }}>{f.name}</div>
                </div>
                <p style={{ fontSize: "0.98rem", lineHeight: 1.65, color: "var(--ink-soft)", margin: 0, maxWidth: "62ch" }}>{f.how}</p>
              </div>
            ))}
          </div>

          {/* Evidence pack callout */}
          <div className="panel" style={{ marginTop: "56px", padding: "clamp(24px,4vw,44px)" }}>
            <span className="eyebrow eyebrow-vault">The evidence pack</span>
            <p className="display display-md" style={{ marginTop: "14px", maxWidth: "24ch" }}>
              "Show me this control worked for the last 90 days."
            </p>
            <p style={{ marginTop: "14px", fontSize: "0.98rem", lineHeight: 1.7, color: "var(--ink-soft)", maxWidth: "66ch" }}>
              ClawWarden answers that question with one export: a date-ranged bundle of the verified audit
              chain, control coverage, the decisions taken, and the artifacts that justify them — with
              chain integrity checked at export time.
            </p>
          </div>

          <p style={{ marginTop: "40px", fontSize: "0.82rem", color: "var(--ink-faint)", lineHeight: 1.7, maxWidth: "70ch" }}>
            ClawWarden is architected to support compliance; it is not legal advice. Final determinations
            rest with your legal, compliance, and data-protection teams.
          </p>

          <div style={{ marginTop: "28px", display: "flex", gap: "12px", flexWrap: "wrap", paddingBottom: "20px" }}>
            <Link href="/security" className="btn btn-ink">Security architecture</Link>
            <a href="mailto:hello@clawwarden.space?subject=Compliance%20review" className="btn btn-line">Request a compliance review</a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
