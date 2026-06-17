import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "About",
  description:
    "ClawWarden builds open source AI trust infrastructure for regulated enterprises — input governance, runtime safety, and an immutable governance engine.",
  alternates: { canonical: "https://clawwarden.space/about" },
};

const PRINCIPLES = [
  ["Trust is data, not a slide", "Every block, override, and disclosure is recorded as evidence — with the policy version and reason attached. Governance you can show an auditor, not just describe."],
  ["Open at the edges, earned at the core", "The interfaces, reference detectors, and SDKs are open source. The tuned detection, risk taxonomy, and managed compliance are what we sell. Adoption and moat, separated cleanly."],
  ["Analytics must survive privacy", "Tokenizing a name shouldn't destroy a portfolio query. We redact identifiers and keep the numbers — so models stay useful and data stays safe."],
  ["Fail toward safety", "Input governance fails closed. Gate-mode enforcement fails closed. The defaults protect the institution, not the demo."],
];

export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main style={{ background: "var(--paper)", minHeight: "100vh", paddingTop: "120px" }}>
        <div className="wrap-narrow">
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid var(--rule-strong)" }}>
            <span className="eyebrow">About</span>
            <span className="eyebrow">Est. for regulated AI</span>
          </div>

          <h1 className="display display-lg" style={{ marginTop: "48px", maxWidth: "18ch" }}>
            The trust layer regulated AI was missing.
          </h1>

          <p className="lede" style={{ marginTop: "24px" }}>
            Enterprises are adopting AI faster than they can govern it. Analysts paste customer data
            into chatbots, agents take actions no one reviewed, and when a regulator asks "show me
            this control worked," there's nothing to hand over.
          </p>

          <p className="drop-cap" style={{ marginTop: "28px", fontSize: "1.02rem", lineHeight: 1.8, color: "var(--ink-soft)" }}>
            ClawWarden exists to close that gap. We build the trust layer between an enterprise and the
            LLMs it uses — governing what goes in, watching what comes out, and keeping the immutable
            record that proves it. It's three planes around one trust fabric: input governance
            (ClawWarden), runtime monitoring and safety (AgentGuard · FIN-SAFE), and a governance engine
            with versioned policies, an append-only audit chain, and regulator-ready evidence packs.
          </p>

          <p style={{ marginTop: "20px", fontSize: "1.02rem", lineHeight: 1.8, color: "var(--ink-soft)" }}>
            We build it open source because trust infrastructure earns adoption by being inspectable.
            The interfaces and reference implementations are Apache-2.0 and run standalone forever;
            the tuned detection, BFSI risk taxonomy, and managed compliance are the commercial core.
          </p>

          <hr className="rule" style={{ margin: "56px 0" }} />

          <span className="eyebrow eyebrow-vault">What we believe</span>
          <div style={{ marginTop: "28px", display: "flex", flexDirection: "column" }}>
            {PRINCIPLES.map(([t, d], i) => (
              <div
                key={t}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr",
                  gap: "20px",
                  padding: "24px 0",
                  borderTop: "1px solid var(--rule)",
                  borderBottom: i === PRINCIPLES.length - 1 ? "1px solid var(--rule)" : "none",
                }}
              >
                <span className="mono" style={{ fontSize: "0.8rem", color: "var(--vault)" }}>0{i + 1}</span>
                <div>
                  <h3 className="display" style={{ fontSize: "1.3rem", fontWeight: 500 }}>{t}</h3>
                  <p style={{ marginTop: "8px", fontSize: "0.96rem", lineHeight: 1.65, color: "var(--ink-soft)" }}>{d}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "56px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <a href="https://github.com/clawwarden/clawwarden" target="_blank" rel="noopener noreferrer" className="btn btn-ink">
              Read the source <ArrowUpRight size={16} />
            </a>
            <Link href="/security" className="btn btn-line">How it's built</Link>
          </div>
          <div style={{ height: "40px" }} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
