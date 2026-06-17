import type { Metadata } from "next";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clawwarden.space";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "ClawWarden — AI Trust Infrastructure for Regulated Enterprises",
    template: "%s | ClawWarden",
  },
  description:
    "ClawWarden is the trust layer between your enterprise and the LLMs it uses. Keep regulated data out of prompts, catch runtime AI risk, and produce the audit evidence regulators ask for. Open source, built for BFSI.",
  keywords: [
    "AI trust infrastructure",
    "AI governance platform",
    "LLM PII tokenization",
    "prompt injection detection",
    "model risk management AI",
    "immutable audit AI",
    "BFSI AI compliance",
    "open source AI security",
    "AI runtime safety",
    "enterprise LLM governance",
  ],
  authors: [{ name: "ClawWarden" }],
  creator: "ClawWarden",
  publisher: "ClawWarden",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "ClawWarden",
    title: "ClawWarden — AI Trust Infrastructure for Regulated Enterprises",
    description:
      "Input governance, runtime safety, and an immutable governance engine — the trust layer between your enterprise and its LLMs. Open source, built for BFSI.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ClawWarden — AI Trust Infrastructure" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClawWarden — AI Trust Infrastructure for Regulated Enterprises",
    description: "Keep regulated data out of prompts, catch runtime AI risk, prove it to regulators. Open source.",
    creator: "@clawwardenai",
    images: ["/og-image.png"],
  },
  alternates: { canonical: APP_URL },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ClawWarden",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Linux, Windows, macOS (Docker)",
  description:
    "Open source AI trust infrastructure for regulated enterprises: input governance (PII tokenization), runtime safety (prompt injection, PII leakage, jailbreak detection), and a governance engine with policy versioning, immutable audit, and evidence packs.",
  url: APP_URL,
  publisher: { "@type": "Organization", name: "ClawWarden", url: APP_URL },
  offers: [
    { "@type": "Offer", name: "Open Source", price: "0", priceCurrency: "USD" },
    {
      "@type": "Offer",
      name: "Professional",
      price: "299",
      priceCurrency: "USD",
      priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
