import type { Metadata } from "next";
import Link from "next/link";
import { Shield } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "ClawWarden Terms of Use — last updated May 2026.",
  alternates: { canonical: "https://clawwarden.space/terms" },
};

const LAST_UPDATED = "13 May 2026";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using any ClawWarden software, website, API, or associated services (collectively, the "Services"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree, do not use the Services.

These Terms constitute a binding legal agreement between you (individually or on behalf of the entity you represent, "User") and ClawWarden ("we", "us", "our"). Use of the Services constitutes acceptance of any future revisions to these Terms, which will be posted at clawwarden.space/terms.

Note on legal entity: ClawWarden is currently in its pre-incorporation phase. The formal legal entity name, company registration number, registered address, and governing jurisdiction will be published at clawwarden.space/terms upon incorporation. If you require an executed agreement with a named legal entity before that time, please contact us at hello@clawwarden.space.`,
  },
  {
    title: "2. Description of Services",
    body: `ClawWarden provides a self-hosted AI privacy gateway that intercepts outbound prompts, tokenizes detected personally identifiable information (PII) using Microsoft Presidio NER, and forwards sanitized prompts to third-party large language model (LLM) providers. Responses are de-tokenized on the return path in accordance with role-based access control (RBAC) rules configured by the User.

The Services are available in two forms:

• Open-Source (MIT license): The core tokenization engine, published at github.com/clawwarden/clawwarden-core. Governed by the MIT License in addition to these Terms.
• Hosted / Commercial: The web UI hosted at clawwarden.space, managed SaaS tiers, and enterprise feature sets. Governed solely by these Terms and any applicable Order Form.`,
  },
  {
    title: "3. No Legal or Compliance Guarantee",
    body: `THE SERVICES ARE PROVIDED AS A TECHNICAL TOOL ONLY. CLAWWARDEN DOES NOT PROVIDE LEGAL, COMPLIANCE, REGULATORY, OR PROFESSIONAL ADVICE OF ANY KIND.

While ClawWarden is architected to support compliance with regulations including GLBA, GDPR, HIPAA, and CCPA, use of the Services does not, by itself, ensure or guarantee regulatory compliance. Final compliance determinations are your sole responsibility and should be made in consultation with qualified legal counsel, a Data Protection Officer (DPO), or other compliance professionals.

ClawWarden makes no representations or warranties that the Services satisfy any specific regulatory requirement in any jurisdiction.`,
  },
  {
    title: "4. User Responsibilities",
    body: `You are solely responsible for:

a) Securing your local infrastructure, including the Docker host, Redis instance, API keys, and any secrets stored in environment variables.

b) Configuring RBAC policies, retention policies, and access controls appropriate to your organization's regulatory obligations.

c) Ensuring that any third-party LLM provider you connect (Anthropic, OpenAI, Ollama, or otherwise) is approved for use under your data governance policies.

d) Validating that the Presidio NER engine correctly identifies all PII categories relevant to your use case. Presidio is a probabilistic system; misclassifications may occur.

e) Obtaining all necessary consents from data subjects before processing their personal data through the Services.

f) Maintaining an audit trail and evidence pack sufficient for your jurisdiction's regulatory requirements.`,
  },
  {
    title: "5. Acceptable Use",
    body: `You agree not to use the Services to:

• Process data in violation of any applicable law, regulation, or third-party rights;
• Reverse-engineer, decompile, or attempt to extract the source code of any closed-source component;
• Resell, sublicense, or white-label the Services without express written permission;
• Attempt to circumvent security controls, rate limits, or access controls;
• Upload malware, harmful code, or data that infringes any intellectual property rights;
• Use the Services in any manner that could reasonably expose ClawWarden or its users to legal liability.`,
  },
  {
    title: "6. Data Processing & Privacy",
    body: `Self-Hosted (Starter / Open-Source): All data remains on your infrastructure. ClawWarden has no access to, and does not collect, any prompt data, PII, or tokenization vault contents.

Hosted / SaaS: If you use hosted tiers, please refer to our Privacy Policy (clawwarden.space/privacy) for details on what data we process, how it is stored, and your rights as a data subject.

Third-Party LLMs: When you route prompts to Anthropic, OpenAI, or other cloud LLM providers, those providers process the tokenized prompts under their own terms of service and privacy policies. Raw PII is not transmitted; however, you remain responsible for compliance with any data transfer restrictions in your jurisdiction.`,
  },
  {
    title: "7. Intellectual Property",
    body: `Open-Source Components: The clawwarden-core repository is released under the MIT License. You may use, copy, modify, and distribute it subject to the license terms.

Proprietary Components: The ClawWarden brand, UI, closed-source gateway extensions, compliance tooling, and associated documentation are the exclusive intellectual property of ClawWarden. No license to these materials is granted beyond what is necessary to use the Services as described herein.`,
  },
  {
    title: "8. Disclaimer of Warranties",
    body: `THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED OPERATION.

We do not warrant that: (a) the Services will meet your specific compliance requirements; (b) the PII detection engine will identify all sensitive data in all contexts; (c) the Services will be error-free or available without interruption.`,
  },
  {
    title: "9. Limitation of Liability",
    body: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLAWWARDEN AND ITS AFFILIATES, DIRECTORS, EMPLOYEES, OR AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

IN NO EVENT SHALL CLAWWARDEN'S TOTAL AGGREGATE LIABILITY EXCEED THE AMOUNTS PAID BY YOU TO CLAWWARDEN IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE CLAIM. FOR USERS OF THE FREE STARTER TIER WHO HAVE MADE NO PAYMENTS, LIABILITY IS LIMITED TO USD $0.`,
  },
  {
    title: "10. Indemnification",
    body: `You agree to indemnify, defend, and hold harmless ClawWarden and its affiliates from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising from: (a) your use of the Services; (b) your violation of these Terms; (c) any data breach or regulatory action arising from your infrastructure or policies; (d) any third-party claim relating to your processing of personal data.`,
  },
  {
    title: "11. Modifications to Terms",
    body: `We reserve the right to modify these Terms at any time. Changes will be posted at clawwarden.space/terms with an updated "Last Updated" date. Continued use of the Services following any modification constitutes your acceptance of the revised Terms. If a modification is material, we will make reasonable efforts to notify registered users at least 14 days in advance.`,
  },
  {
    title: "12. Governing Law & Disputes",
    body: `These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which ClawWarden is incorporated (to be confirmed and published upon incorporation), without regard to conflict of law principles.

Any disputes arising from these Terms shall first be submitted to good-faith negotiation for a period of 30 days. If unresolved within that period, disputes shall be subject to binding arbitration or the exclusive jurisdiction of courts in the governing jurisdiction, as applicable.

The governing jurisdiction and applicable arbitration rules will be published at clawwarden.space/terms upon formal incorporation.`,
  },
  {
    title: "13. Contact",
    body: `For general questions about these Terms, please contact us at:\n\nhello@clawwarden.space\n\nFor legal or compliance correspondence requiring a named contracting party: ClawWarden is in pre-incorporation phase. A formal legal entity name, registration number, and registered address will be published upon incorporation. In the interim, all legal notices may be directed to hello@clawwarden.space and will be acknowledged within 5 business days.`,
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <div style={{ background: "var(--paper)", minHeight: "100vh", color: "var(--ink)" }}>

      <main className="wrap-narrow" style={{ paddingTop: "120px", paddingBottom: "100px" }}>
        {/* Header */}
        <div style={{ marginBottom: "56px" }}>
          <p className="eyebrow eyebrow-vault" style={{ marginBottom: "16px" }}>Legal</p>
          <h1 className="display display-lg">Terms of Use</h1>
          <p className="mono" style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginTop: "12px" }}>Last updated: {LAST_UPDATED}</p>
          <div style={{ marginTop: "24px", background: "var(--signal-soft)", border: "1px solid rgba(178,58,32,0.25)", borderRadius: "2px", padding: "16px 18px", fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.65 }}>
            <strong style={{ color: "var(--signal)" }}>Important:</strong> These Terms include disclaimers about compliance liability (§3), warranties (§8), and liability (§9). Please read carefully before using the Services.
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="display" style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--ink)", marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid var(--rule)" }}>
                {s.title}
              </h2>
              <div style={{ fontSize: "0.92rem", color: "var(--ink-soft)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {s.title === "13. Contact" ? (
                  <>
                    For questions about these Terms, please contact us at:{"\n\n"}
                    <a className="link-underline" href="mailto:hello@clawwarden.space">hello@clawwarden.space</a>
                  </>
                ) : s.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer nav */}
        <div style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid var(--rule)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <Link href="/" className="link-underline" style={{ fontSize: "0.85rem" }}>← Back to home</Link>
          <div style={{ display: "flex", gap: "20px" }}>
            <Link href="/compliance" style={{ fontSize: "0.83rem", color: "var(--ink-faint)", textDecoration: "none" }}>Compliance</Link>
            <Link href="/security" style={{ fontSize: "0.83rem", color: "var(--ink-faint)", textDecoration: "none" }}>Security</Link>
            <a href="mailto:hello@clawwarden.space" style={{ fontSize: "0.83rem", color: "var(--ink-faint)", textDecoration: "none" }}>Contact</a>
          </div>
        </div>
      </main>
    </div>
    <SiteFooter />
    </>
  );
}
