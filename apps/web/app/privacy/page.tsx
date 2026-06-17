import type { Metadata } from "next";
import Link from "next/link";
import { Shield } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ClawWarden Privacy Policy — how we handle data on the hosted site and what data we do not collect.",
  alternates: { canonical: "https://clawwarden.space/privacy" },
};

const LAST_UPDATED = "13 May 2026";

const sections = [
  {
    title: "1. Overview",
    body: `This Privacy Policy describes how ClawWarden ("we", "us", "our") handles information in connection with the ClawWarden website (clawwarden.space) and associated services.

ClawWarden is built around a core principle: we process as little personal data as possible, and we never collect the sensitive financial data that flows through the self-hosted gateway.`,
  },
  {
    title: "2. Self-Hosted Gateway — No Data Collection",
    body: `If you deploy the ClawWarden open-source gateway on your own infrastructure (the Starter / self-hosted tier), ClawWarden collects zero data from your deployment.

All tokenization, PII detection, audit logs, session data, and Redis vault contents remain entirely within your network. We have no access to, and do not receive, any prompt data, customer PII, or vault contents from self-hosted deployments.`,
  },
  {
    title: "3. Website (clawwarden.space)",
    body: `When you visit clawwarden.space, standard web server logs may capture your IP address, browser type, referring URL, and pages visited. This information is used solely for security monitoring and aggregate analytics.

We do not use tracking cookies or third-party analytics scripts that profile individual visitors.`,
  },
  {
    title: "4. Contact & enquiries",
    body: `If you submit your details via the contact form, we collect:

• Email address (required)
• Company name (optional)
• Role and message (optional)

This information is used only to follow up about your enquiry, a pilot, or early access. We will not sell, share, or rent your contact information to third parties. You may request deletion at any time by emailing hello@clawwarden.space.`,
  },
  {
    title: "5. Hosted / SaaS Tiers",
    body: `If you use a managed or hosted ClawWarden tier (Professional or Enterprise), a separate Data Processing Agreement (DPA) governs the handling of any data processed through your deployment. Please contact hello@clawwarden.space to request a DPA.

In hosted tiers, we process tokenized prompts on your behalf as a data processor. Raw PII never travels to our servers — it is tokenized before leaving your network boundary.`,
  },
  {
    title: "6. Data Retention",
    body: `Waitlist email addresses are retained until you request deletion or the waitlist programme ends.

Website server logs are retained for up to 30 days for security purposes and then automatically purged.

We do not retain any prompt data, customer PII, or AI responses from self-hosted gateways.`,
  },
  {
    title: "7. Your Rights",
    body: `Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict processing of your personal data. To exercise any of these rights, contact us at hello@clawwarden.space. We will respond within 30 days.

For EU/EEA residents, you may also lodge a complaint with your local supervisory authority.`,
  },
  {
    title: "8. Security",
    body: `We implement reasonable technical and organizational measures to protect personal data against unauthorized access, disclosure, or loss. Waitlist data is transmitted over TLS and stored with access controls.`,
  },
  {
    title: "9. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. Changes will be posted at clawwarden.space/privacy with an updated "Last Updated" date. For material changes, we will make reasonable efforts to notify you.`,
  },
  {
    title: "10. Contact",
    body: `For privacy-related questions or requests, contact us at:\n\nhello@clawwarden.space`,
  },
];

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <div style={{ background: "var(--paper)", minHeight: "100vh", color: "var(--ink)" }}>

      <main className="wrap-narrow" style={{ paddingTop: "120px", paddingBottom: "100px" }}>
        {/* Header */}
        <div style={{ marginBottom: "56px" }}>
          <p className="eyebrow eyebrow-vault" style={{ marginBottom: "16px" }}>Legal</p>
          <h1 className="display display-lg">Privacy Policy</h1>
          <p className="mono" style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginTop: "12px" }}>Last updated: {LAST_UPDATED}</p>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="display" style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--ink)", marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid var(--rule)" }}>
                {s.title}
              </h2>
              <div style={{ fontSize: "0.92rem", color: "var(--ink-soft)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {s.title === "10. Contact" ? (
                  <>
                    For privacy-related questions or requests, contact us at:{"\n\n"}
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
            <Link href="/terms" style={{ fontSize: "0.83rem", color: "var(--ink-faint)", textDecoration: "none" }}>Terms of Use</Link>
            <Link href="/compliance" style={{ fontSize: "0.83rem", color: "var(--ink-faint)", textDecoration: "none" }}>Compliance</Link>
            <a href="mailto:hello@clawwarden.space" style={{ fontSize: "0.83rem", color: "var(--ink-faint)", textDecoration: "none" }}>Contact</a>
          </div>
        </div>
      </main>
    </div>
    <SiteFooter />
    </>
  );
}
