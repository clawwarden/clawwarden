"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Star } from "lucide-react";

const LINKS = [
  { label: "Platform", href: "/#platform" },
  { label: "Security", href: "/security" },
  { label: "Compliance", href: "/compliance" },
  { label: "Quickstart", href: "/setup" },
  { label: "About", href: "/about" },
];

const GITHUB = "https://github.com/clawwarden/clawwarden";

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12);
    h();
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: scrolled ? "rgba(241,236,225,0.86)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: scrolled ? "1px solid var(--rule)" : "1px solid transparent",
        transition: "all 240ms ease",
      }}
    >
      <div
        className="wrap"
        style={{ height: "68px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        {/* Wordmark */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "14px", textDecoration: "none" }}>
          <span
            className="display"
            style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}
          >
            ClawWarden
          </span>
          <span className="rule-v hidden sm:inline-block" style={{ height: "20px" }} />
          <span className="eyebrow hidden sm:inline" style={{ fontSize: "0.6rem" }}>
            AI Trust Infrastructure
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex" style={{ alignItems: "center", gap: "30px" }}>
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--ink-soft)", textDecoration: "none" }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex" style={{ alignItems: "center", gap: "12px" }}>
          <a
            href={GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-line"
            style={{ padding: "9px 16px", fontSize: "0.85rem" }}
          >
            <Star size={15} /> GitHub
          </a>
          <Link href="/tokenize" className="btn btn-ink" style={{ padding: "9px 18px", fontSize: "0.85rem" }}>
            Try the demo
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)", padding: 6 }}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div
          className="md:hidden"
          style={{
            background: "var(--paper-card)",
            borderTop: "1px solid var(--rule)",
            borderBottom: "1px solid var(--rule)",
            padding: "16px clamp(20px,5vw,64px) 24px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: "var(--ink)",
                  textDecoration: "none",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="btn btn-line" style={{ flex: 1 }}>
              <Star size={15} /> GitHub
            </a>
            <Link href="/tokenize" className="btn btn-ink" style={{ flex: 1 }} onClick={() => setOpen(false)}>
              Try the demo
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
