import Link from "next/link";

const COLS: { title: string; links: [string, string, boolean?][] }[] = [
  {
    title: "Platform",
    links: [
      ["Input governance", "/#platform"],
      ["Runtime & FIN-SAFE", "/security"],
      ["Governance engine", "/#governance"],
      ["Quickstart", "/setup"],
    ],
  },
  {
    title: "Open source",
    links: [
      ["GitHub — clawwarden", "https://github.com/clawwarden/clawwarden", true],
      ["Contracts & API", "https://github.com/clawwarden/clawwarden/tree/main/contracts", true],
      ["Report an issue", "https://github.com/clawwarden/clawwarden/issues", true],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Trust Center", "/trust"],
      ["Security", "/security"],
      ["Compliance", "/compliance"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--rule-strong)", marginTop: "40px", background: "var(--paper)" }}>
      <div className="wrap" style={{ paddingTop: "64px", paddingBottom: "40px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr repeat(4, 1fr)",
            gap: "40px",
            alignItems: "start",
          }}
          className="footer-grid"
        >
          <div style={{ maxWidth: "320px" }}>
            <span className="display" style={{ fontSize: "1.6rem", fontWeight: 600 }}>
              ClawWarden
            </span>
            <p style={{ marginTop: "14px", fontSize: "0.92rem", lineHeight: 1.6, color: "var(--ink-soft)" }}>
              The trust layer between regulated enterprises and the LLMs they use. Input governance,
              runtime safety, and an immutable governance engine.
            </p>
            <p className="eyebrow" style={{ marginTop: "20px" }}>
              Open-source · Apache-2.0
            </p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="eyebrow" style={{ marginBottom: "16px" }}>
                {col.title}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                {col.links.map(([label, href, external]) =>
                  external ? (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.9rem", color: "var(--ink-soft)", textDecoration: "none" }}
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      key={label}
                      href={href}
                      style={{ fontSize: "0.9rem", color: "var(--ink-soft)", textDecoration: "none" }}
                    >
                      {label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        <hr className="rule" style={{ margin: "44px 0 20px" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            fontSize: "0.8rem",
            color: "var(--ink-faint)",
          }}
        >
          <span className="mono">© 2026 ClawWarden — AI Trust Infrastructure</span>
          <span className="mono">GLBA · GDPR · SOC 2 · NIST AI RMF aligned</span>
        </div>
      </div>
    </footer>
  );
}
