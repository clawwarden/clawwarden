"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail, Star, ShieldCheck } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

const INTERESTS = ["Book a demo", "Enterprise / on-prem", "Security review", "Open-source / self-host", "Other"];

export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [interest, setInterest] = useState(INTERESTS[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setMsg("");
    try {
      const composedRole = [role, interest, message].filter(Boolean).join(" · ");
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company, role: composedRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setStatus("ok");
      setMsg("Thanks — we've received it and will reply from hello@clawwarden.space.");
    } catch (err) {
      setStatus("err");
      setMsg(err instanceof Error ? err.message : "Please try again.");
    }
  }

  const field: React.CSSProperties = {
    width: "100%",
    background: "var(--paper-card)",
    border: "1px solid var(--rule-strong)",
    borderRadius: "3px",
    padding: "12px 14px",
    fontSize: "0.95rem",
    color: "var(--ink)",
    fontFamily: "var(--font-sans)",
  };
  const label: React.CSSProperties = {
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--ink-faint)",
    fontFamily: "var(--font-mono)",
    marginBottom: "7px",
    display: "block",
  };

  return (
    <>
      <SiteNav />
      <main style={{ background: "var(--paper)", minHeight: "100vh", paddingTop: "120px" }}>
        <div className="wrap">
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid var(--rule-strong)" }}>
            <span className="eyebrow">Contact</span>
            <span className="eyebrow">Demos · evaluations · disclosure</span>
          </div>

          <div className="split-2" style={{ marginTop: "48px", gap: "clamp(36px,6vw,80px)", alignItems: "start" }}>
            {/* Left: direct + due diligence */}
            <div>
              <h1 className="display display-lg" style={{ maxWidth: "14ch" }}>Talk to us.</h1>
              <p className="lede" style={{ marginTop: "18px", maxWidth: "44ch" }}>
                Whether you want a demo, an enterprise evaluation, or to audit the source — there's a
                real human on the other end.
              </p>

              <div style={{ marginTop: "36px", display: "flex", flexDirection: "column", gap: "18px" }}>
                <a href="mailto:hello@clawwarden.space" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none", color: "var(--ink)" }}>
                  <Mail size={18} color="var(--vault)" />
                  <span><strong>hello@clawwarden.space</strong> — general & sales</span>
                </a>
                <a href="mailto:security@clawwarden.space" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none", color: "var(--ink)" }}>
                  <ShieldCheck size={18} color="var(--vault)" />
                  <span><strong>security@clawwarden.space</strong> — responsible disclosure</span>
                </a>
                <a href="https://github.com/clawwarden/clawwarden" target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: "12px", alignItems: "center", textDecoration: "none", color: "var(--ink)" }}>
                  <Star size={18} color="var(--vault)" />
                  <span><strong>GitHub</strong> — audit the open-source code</span>
                </a>
              </div>

              <div className="panel" style={{ marginTop: "32px", padding: "22px", background: "var(--paper-deep)" }}>
                <p className="eyebrow eyebrow-vault" style={{ marginBottom: "10px" }}>For enterprise evaluators</p>
                <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink-soft)", margin: 0 }}>
                  Doing a third-party risk assessment? Ask for our entity & registration details, DPA,
                  current SOC 2 status, and architecture brief — we'll send what we have and be honest
                  about what's still in progress. See the{" "}
                  <Link href="/trust" className="link-underline">Trust Center</Link>.
                </p>
              </div>
            </div>

            {/* Right: form */}
            <div className="panel" style={{ padding: "clamp(24px,3vw,36px)" }}>
              {status === "ok" ? (
                <div style={{ textAlign: "center", padding: "40px 10px" }}>
                  <ShieldCheck size={32} color="var(--vault)" />
                  <h2 className="display" style={{ fontSize: "1.4rem", fontWeight: 600, marginTop: "14px" }}>Received</h2>
                  <p style={{ color: "var(--ink-soft)", marginTop: "8px", fontSize: "0.95rem" }}>{msg}</p>
                </div>
              ) : (
                <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={label}>Work email *</label>
                    <input style={field} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@bank.com" />
                  </div>
                  <div className="split-2" style={{ gap: "16px" }}>
                    <div>
                      <label style={label}>Company</label>
                      <input style={field} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Bank" />
                    </div>
                    <div>
                      <label style={label}>Role</label>
                      <input style={field} value={role} onChange={(e) => setRole(e.target.value)} placeholder="CISO, Platform Eng…" />
                    </div>
                  </div>
                  <div>
                    <label style={label}>I'm interested in</label>
                    <select style={field} value={interest} onChange={(e) => setInterest(e.target.value)}>
                      {INTERESTS.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Message</label>
                    <textarea style={{ ...field, minHeight: "96px", resize: "vertical" }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What are you evaluating?" />
                  </div>
                  <button type="submit" className="btn btn-ink" disabled={status === "loading"} style={{ width: "100%", marginTop: "4px" }}>
                    {status === "loading" ? "Sending…" : <>Send <ArrowRight size={16} /></>}
                  </button>
                  {status === "err" && <p style={{ color: "var(--signal)", fontSize: "0.85rem", margin: 0 }}>{msg}</p>}
                  <p style={{ fontSize: "0.75rem", color: "var(--ink-faint)", margin: 0, lineHeight: 1.5 }}>
                    By submitting you agree to be contacted about your enquiry. See our{" "}
                    <Link href="/privacy" className="link-underline">Privacy Policy</Link>.
                  </p>
                </form>
              )}
            </div>
          </div>
          <div style={{ height: "60px" }} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
