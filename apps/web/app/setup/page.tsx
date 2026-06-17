"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Zap,
  Server,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Terminal,
  ExternalLink,
  Lock,
} from "lucide-react";
import { configureSession, listOllamaModels, healthCheck, OllamaModel } from "@/lib/api";
import { setSessionId, getJWT, initSession } from "@/lib/session";
import HowItWorks from "@/components/HowItWorks";
import SiteNav from "@/components/SiteNav";
import OnboardingTimeline from "@/components/OnboardingTimeline";

type Provider = "anthropic" | "openai" | "ollama";

const PROVIDERS = [
  {
    id: "anthropic" as Provider,
    name: "Anthropic",
    subtitle: "Claude models — cloud, PII-stripped",
    icon: <Shield size={28} />,
    description: "The gateway tokenizes all PII before the request leaves your machine. Anthropic's API only ever receives {{PERSON_1}}-style tokens — never raw names, SSNs, or emails. Bring your own API key.",
    caveat: "Prompts travel to Anthropic's cloud (tokenized). You provide your own API key.",
    defaultModel: "claude-sonnet-4-5",
    requiresKey: true,
    keyLabel: "Anthropic API Key",
    keyPlaceholder: "sk-ant-...",
    proOnly: false,
  },
  {
    id: "openai" as Provider,
    name: "OpenAI",
    subtitle: "GPT models — cloud, PII-stripped",
    icon: <Zap size={28} />,
    description: "Same intercept model as Anthropic — Presidio NER strips PII locally, then the tokenized prompt is forwarded to OpenAI. GPT never sees a single real identifier. Bring your own API key.",
    caveat: "Prompts travel to OpenAI's cloud (tokenized). You provide your own API key.",
    defaultModel: "gpt-4o",
    requiresKey: true,
    keyLabel: "OpenAI API Key",
    keyPlaceholder: "sk-...",
    proOnly: false,
  },
  {
    id: "ollama" as Provider,
    name: "Ollama",
    subtitle: "Local models — zero cloud egress",
    icon: <Server size={28} />,
    description: "Everything runs on your own hardware. Zero API cost, zero cloud egress, zero data ever leaves your network. Strongest compliance posture.",
    caveat: "",
    defaultModel: "",
    requiresKey: false,
    keyLabel: "",
    keyPlaceholder: "",
    proOnly: false,
  },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<Provider | null>("ollama");
  const [hoveredProvider, setHoveredProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState("");

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);
  const [gatewayNotLocal, setGatewayNotLocal] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Detect if the user is visiting from a non-localhost origin
  useEffect(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      setGatewayNotLocal(h !== "localhost" && h !== "127.0.0.1");
    }
  }, []);

  // When provider is selected, set the default model
  useEffect(() => {
    if (selectedProvider) {
      setModel(selectedProvider.defaultModel || "");
    }
  }, [provider]);

  // Fetch Ollama models when user switches to Ollama provider or URL changes
  async function fetchOllamaModels() {
    setLoadingModels(true);
    setModelError("");
    try {
      const models = await listOllamaModels(ollamaUrl);
      setOllamaModels(models);
      if (models.length > 0 && !model) {
        setModel(models[0].name);
      }
    } catch (e: unknown) {
      setModelError(String(e));
    } finally {
      setLoadingModels(false);
    }
  }

  useEffect(() => {
    if (provider === "ollama" && step === 2) {
      fetchOllamaModels();
    }
  }, [provider, step]);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const ok = await healthCheck();
    setTestResult(ok ? "ok" : "fail");
    setTesting(false);
  }

  async function handleFinish() {
    if (!provider || !model) return;
    setConfiguring(true);
    setError("");
    try {
      // Free tier (local Ollama / self-host) needs no account: run as the
      // least-privileged role — tokens only, no PII reveal. A logged-in user
      // keeps their own account role/JWT. Privileged roles (vp_risk/admin) and
      // the cloud providers stay gated (the gateway won't issue them here).
      let jwt = getJWT();
      if (!jwt) {
        await initSession("junior_analyst");
        jwt = getJWT();
      }
      if (!jwt) throw new Error("Could not establish a session. Please sign in and retry.");
      const sessionId = await configureSession(
        {
          provider,
          model,
          api_key: apiKey || undefined,
          ollama_url: provider === "ollama" ? ollamaUrl : undefined,
        },
        jwt,
      );
      setSessionId(sessionId);
      router.push("/chat");
    } catch (e: unknown) {
      setError(String(e));
      setConfiguring(false);
    }
  }

  return (
    <>
    <SiteNav />
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "88px 24px 24px",
        background: "var(--bg-base)",
      }}
    >
      {/* Background radial glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(13,90,64,0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: "640px", position: "relative" }}>
        {/* Top utility bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
          <button
            onClick={() => router.push("/tokenize")}
            className="btn-ghost"
            style={{ padding: "5px 12px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "5px", color: "#0d5a40", borderColor: "rgba(13,90,64,0.25)" }}
          >
            PII Tokenizer
          </button>
          <button
            onClick={() => setGuideOpen(true)}
            className="btn-ghost"
            style={{ padding: "5px 12px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "5px" }}
          >
            ? How it works
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              background: "var(--color-primary-dim)",
              border: "1px solid var(--border-primary)",
              borderRadius: "100px",
              padding: "6px 16px",
              marginBottom: "20px",
            }}
          >
            <Shield size={14} style={{ color: "var(--color-primary)" }} />
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--color-primary)",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              PII Tokenization Gateway
            </span>
          </div>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 8px",
              lineHeight: 1.2,
            }}
          >
            Connect your LLM
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.95rem" }}>
            All PII is tokenized locally before it reaches any model provider.
          </p>
        </div>

        {/* ── Path chooser: visiting from Vercel / non-localhost ── */}
        {gatewayNotLocal && (
          <div style={{ marginBottom: "28px" }}>
            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", textAlign: "center" }}>
              Choose your path
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Zero-install path */}
              <button
                onClick={() => router.push("/tokenize")}
                style={{
                  background: "rgba(13,90,64,0.07)",
                  border: "1px solid rgba(13,90,64,0.3)",
                  borderRadius: "14px",
                  padding: "20px 18px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.2s",
                }}
              >
                <div style={{ fontSize: "1.4rem", marginBottom: "8px" }}>⚡</div>
                <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0d5a40", marginBottom: "6px" }}>
                  Try It Free — No Install
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Live PII tokenizer runs entirely in your browser. No Docker, no API key, no signup.
                </div>
                <div style={{ marginTop: "12px", fontSize: "0.72rem", fontWeight: 700, color: "#0d5a40", display: "flex", alignItems: "center", gap: "4px" }}>
                  Open PII Tokenizer →
                </div>
              </button>

              {/* Full gateway path */}
              <div
                style={{
                  background: "rgba(13,90,64,0.05)",
                  border: "1px solid rgba(13,90,64,0.2)",
                  borderRadius: "14px",
                  padding: "20px 18px",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "1.4rem", marginBottom: "8px" }}>🔒</div>
                <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0d5a40", marginBottom: "6px" }}>
                  Deploy the Full Gateway
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: "10px" }}>
                  Run locally: gateway + Redis in Docker, LLM provider of your choice. Under 30 min.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {[
                    "git clone https://github.com/clawwarden/clawwarden-core",
                    "docker-compose up -d",
                    "npm run dev  # visit localhost:3000",
                  ].map((cmd, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#0d5a40", minWidth: "14px" }}>{i + 1}.</span>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-soft)" }}>{cmd}</code>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "10px", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  Continue below ↓ to configure once running locally
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step indicators */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "32px",
          }}
        >
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                onClick={() => { if (s < step) setStep(s); }}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  background:
                    step >= s ? "var(--color-primary)" : "var(--bg-surface)",
                  color: step >= s ? "var(--paper)" : "var(--text-muted)",
                  border:
                    step >= s
                      ? "none"
                      : "1px solid var(--border-subtle)",
                  transition: "all var(--transition-base)",
                  boxShadow:
                    step === s ? "0 0 16px var(--color-primary-glow)" : "none",
                  cursor: s < step ? "pointer" : "default",
                }}
                title={s < step ? `Go back to step ${s}` : undefined}
              >
                {step > s ? <CheckCircle size={14} /> : s}
              </div>
              {s < 3 && (
                <div
                  style={{
                    width: "40px",
                    height: "1px",
                    background:
                      step > s
                        ? "var(--color-primary)"
                        : "var(--border-subtle)",
                    transition: "background var(--transition-base)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Onboarding timeline — shown before step 1 only */}
        {step === 1 && <OnboardingTimeline />}

        {/* Step 1: Provider selection */}
        {step === 1 && (
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "16px",
                fontSize: "0.85rem",
                textAlign: "center",
              }}
            >
              Step 1 — Choose your LLM provider
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {PROVIDERS.map((p) => (
                <div
                  key={p.id}
                  onClick={() => !p.proOnly && setProvider(p.id)}
                  onMouseEnter={() => !p.proOnly && setHoveredProvider(p.id)}
                  onMouseLeave={() => setHoveredProvider(null)}
                  style={{
                    background: p.proOnly
                      ? "rgba(23,21,15,0.015)"
                      : provider === p.id
                      ? "var(--color-primary-dim)"
                      : hoveredProvider === p.id
                      ? "rgba(13,90,64,0.05)"
                      : "var(--bg-glass)",
                    backdropFilter: "blur(20px)",
                    border: p.proOnly
                      ? "2px solid rgba(138,106,34,0.2)"
                      : provider === p.id
                      ? "2px solid var(--color-primary)"
                      : hoveredProvider === p.id
                      ? "2px solid rgba(13,90,64,0.35)"
                      : "2px solid rgba(23,21,15,0.1)",
                    borderRadius: "12px",
                    padding: "20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    cursor: p.proOnly ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all var(--transition-base)",
                    boxShadow: provider === p.id && !p.proOnly ? "0 0 28px var(--color-primary-glow)" : "none",
                    width: "100%",
                    opacity: p.proOnly ? 0.55 : 1,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      color: p.proOnly
                        ? "var(--text-muted)"
                        : provider === p.id
                        ? "var(--color-primary)"
                        : "var(--text-secondary)",
                      transition: "color var(--transition-base)",
                      flexShrink: 0,
                    }}
                  >
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "1rem",
                        color: p.proOnly ? "var(--text-muted)" : "var(--text-primary)",
                        marginBottom: "2px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      {p.name}
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          fontWeight: 400,
                        }}
                      >
                        {p.subtitle}
                      </span>
                      {p.proOnly && (
                        <span style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background: "rgba(138,106,34,0.15)",
                          border: "1px solid rgba(138,106,34,0.35)",
                          color: "#6f5519",
                          borderRadius: "4px",
                          padding: "2px 7px",
                        }}>Pro</span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}>
                      {p.description}
                    </div>
                    {p.proOnly && (
                      <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Lock size={12} style={{ color: "#6f5519", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.74rem", color: "#6f5519" }}>Requires Pro plan — </span>
                        <a
                          href="mailto:hello@clawwarden.space?subject=ClawWarden%20Professional%20Plan%20%E2%80%94%20Demo%20Request"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: "0.74rem", color: "#0d5a40", fontWeight: 700, textDecoration: "none" }}
                        >
                          Book a Demo
                        </a>
                      </div>
                    )}
                  </div>
                  {p.proOnly
                    ? <Lock size={18} style={{ color: "rgba(138,106,34,0.5)", flexShrink: 0 }} />
                    : <CheckCircle size={18} style={{ color: provider === p.id ? "var(--color-primary)" : "transparent", flexShrink: 0, transition: "color var(--transition-base)" }} />
                  }
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                className="btn-primary"
                disabled={!provider || !!PROVIDERS.find(p => p.id === provider)?.proOnly}
                onClick={() => setStep(2)}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Credentials / Model */}
        {step === 2 && selectedProvider && (
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "16px",
                fontSize: "0.85rem",
                textAlign: "center",
              }}
            >
              Step 2 — Configure {selectedProvider.name}
            </p>
            <div className="glass-card" style={{ padding: "24px" }}>
              {selectedProvider.requiresKey && (
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                      marginBottom: "8px",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedProvider.keyLabel}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={selectedProvider.keyPlaceholder}
                    style={{
                      width: "100%",
                      background: "rgba(23,21,15,0.04)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                      outline: "none",
                      transition: "border-color var(--transition-base)",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = "var(--color-primary)")
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = "var(--border-subtle)")
                    }
                  />
                </div>
              )}

              {/* Ollama URL */}
              {provider === "ollama" && (
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                      marginBottom: "8px",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Ollama URL
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      style={{
                        flex: 1,
                        background: "rgba(23,21,15,0.04)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        outline: "none",
                      }}
                    />
                    <button
                      className="btn-ghost"
                      onClick={fetchOllamaModels}
                      style={{ whiteSpace: "nowrap", padding: "10px 14px" }}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}

              {/* Model selection */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Model
                </label>
                {provider === "ollama" ? (
                  loadingModels ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                        padding: "10px 0",
                      }}
                    >
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      Fetching models from Ollama...
                    </div>
                  ) : modelError ? (
                    <div>
                      {modelError === "MIXED_CONTENT" ? (
                        /* ── Vercel/HTTPS mixed-content block ── */
                        <div style={{
                          background: "rgba(138,106,34,0.06)",
                          border: "1px solid rgba(138,106,34,0.3)",
                          borderRadius: "10px",
                          padding: "16px 18px",
                          marginBottom: "14px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
                            <Lock size={13} style={{ color: "#6f5519" }} />
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6f5519" }}>Browser blocked: HTTPS → HTTP not allowed</span>
                          </div>
                          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 12px" }}>
                            You&apos;re on <strong style={{ color: "var(--text-primary)" }}>https://clawwarden.space</strong>. Browsers block requests to <code style={{ fontFamily: "var(--font-mono)", color: "#6f5519", fontSize: "0.74rem" }}>http://localhost</code> from HTTPS pages (mixed content). To connect your local Ollama, run the UI on your own machine:
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                            {[
                              { cmd: "git clone https://github.com/clawwarden/clawwarden-core && cd clawwarden-core", note: "Clone repo" },
                              { cmd: "docker-compose up -d", note: "Start gateway + Redis" },
                              { cmd: "cd ui && npm install && npm run dev", note: "UI at localhost:3000" },
                            ].map((r, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(138,106,34,0.15)", border: "1px solid rgba(138,106,34,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 800, color: "#6f5519", flexShrink: 0 }}>{i + 1}</span>
                                <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "#0d5a40", background: "rgba(13,90,64,0.07)", borderRadius: "4px", padding: "2px 8px", flex: 1 }}>{r.cmd}</code>
                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>— {r.note}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* ── Local CORS / offline error ── */
                        <div style={{
                          background: "rgba(255,107,107,0.06)",
                          border: "1px solid rgba(255,107,107,0.2)",
                          borderRadius: "10px",
                          padding: "14px 16px",
                          marginBottom: "14px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
                            <Terminal size={13} style={{ color: "#b23a20" }} />
                            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#b23a20" }}>Cannot reach Ollama — try one of these fixes:</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.78rem" }}>
                            <div style={{ color: "var(--text-secondary)" }}>
                              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Option A — Enable CORS in Ollama</span>{" "}
                              <span style={{ color: "var(--text-muted)" }}>(direct browser access, no gateway needed)</span>
                              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                <span style={{ fontSize: "0.71rem", color: "var(--text-muted)" }}>Windows (PowerShell):</span>
                                <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "#0d5a40", background: "rgba(13,90,64,0.07)", borderRadius: "4px", padding: "3px 8px", display: "block" }}>$env:OLLAMA_ORIGINS=&quot;*&quot;; ollama serve</code>
                                <span style={{ fontSize: "0.71rem", color: "var(--text-muted)", marginTop: "2px" }}>macOS / Linux:</span>
                                <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "#0d5a40", background: "rgba(13,90,64,0.07)", borderRadius: "4px", padding: "3px 8px", display: "block" }}>OLLAMA_ORIGINS=* ollama serve</code>
                                <span style={{ fontSize: "0.71rem", color: "var(--text-muted)", marginTop: "2px" }}>Then click <strong style={{ color: "var(--text-secondary)" }}>Refresh</strong> — your models will appear.</span>
                              </div>
                            </div>
                            <div style={{ color: "var(--text-secondary)" }}>
                              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Option B — Start the full gateway</span>{" "}
                              <span style={{ color: "var(--text-muted)" }}>(required for the chat page)</span>
                              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                {["docker-compose up -d"].map(cmd => (
                                  <code key={cmd} style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "#0d5a40", background: "rgba(13,90,64,0.07)", borderRadius: "4px", padding: "3px 8px", display: "block" }}>{cmd}</code>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Or type model name manually</label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="e.g. llama3.2:3b, qwen3:4b, phi4:latest"
                        style={{
                          width: "100%",
                          background: "rgba(23,21,15,0.04)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.85rem",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ) : (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(23,21,15,0.04)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      {ollamaModels.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{
                      width: "100%",
                      background: "rgba(23,21,15,0.04)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Ollama legal disclaimer */}
            {provider === "ollama" && (
              <div style={{
                background: "rgba(138,106,34,0.05)",
                border: "1px solid rgba(138,106,34,0.2)",
                borderRadius: "10px",
                padding: "14px 16px",
                marginTop: "20px",
                fontSize: "0.76rem",
                color: "var(--text-muted)",
                lineHeight: 1.65,
              }}>
                <div style={{ fontWeight: 700, color: "#6f5519", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.7rem" }}>⚠</span> Important — Your Responsibility
                </div>
                ClawWarden tokenizes PII locally using Microsoft Presidio before any data reaches your Ollama instance.
                The token vault and all decrypted values remain on your own machine.{" "}
                <strong style={{ color: "var(--text-secondary)" }}>You are solely responsible</strong>{" "}
                for securing your local infrastructure, enforcing data governance policies, and ensuring compliance
                with applicable laws (GLBA, GDPR, HIPAA, CCPA, etc.) in your jurisdiction.
                ClawWarden is provided as-is, without warranties of any kind. It is not a substitute for qualified legal
                or compliance counsel. By proceeding you acknowledge that you have read and accepted our{" "}
                <a href="/terms" style={{ color: "#6f5519", textDecoration: "underline" }}>Terms of Use</a>.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button
                className="btn-ghost"
                onClick={() => setStep(1)}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                className="btn-primary"
                disabled={!model || (selectedProvider.requiresKey && !apiKey)}
                onClick={() => setStep(3)}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Test + Launch */}
        {step === 3 && (
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "16px",
                fontSize: "0.85rem",
                textAlign: "center",
              }}
            >
              Step 3 — Verify gateway connection
            </p>
            <div className="glass-card" style={{ padding: "28px", textAlign: "center" }}>
              <div style={{ marginBottom: "20px" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0 0 4px" }}>
                  Provider
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-primary)",
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {provider} / {model}
                </p>
              </div>
              <div className="glow-divider" style={{ margin: "20px 0" }} />
              <button
                className="btn-ghost"
                onClick={handleTest}
                disabled={testing}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "20px",
                }}
              >
                {testing ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Zap size={16} />
                )}
                Ping Gateway
              </button>

              {testResult === "ok" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    color: "var(--color-safe)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    margin: "0 0 20px",
                  }}
                >
                  <CheckCircle size={18} /> Gateway reachable — ready to go
                </div>
              )}
              {testResult === "fail" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    color: "var(--color-danger)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    margin: "0 0 8px",
                  }}
                >
                  <XCircle size={18} /> Gateway unreachable — is it running?
                </div>
              )}
              {testResult === "fail" && (
                <div style={{
                  background: "rgba(255,107,107,0.06)",
                  border: "1px solid rgba(255,107,107,0.18)",
                  borderRadius: "10px",
                  padding: "14px 18px",
                  margin: "0 0 20px",
                  textAlign: "left",
                  fontSize: "0.8rem",
                }}>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "7px" }}>
                    <Terminal size={13} style={{ color: "#b23a20" }} /> How to start the gateway
                  </div>
                  {[
                    { cmd: "git clone https://github.com/clawwarden/clawwarden-core", note: "Clone repo" },
                    { cmd: "cd clawwarden-core", note: "" },
                    { cmd: "docker-compose up -d", note: "Starts gateway on :8000 + Redis" },
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.76rem", color: "#0d5a40", background: "rgba(13,90,64,0.07)", borderRadius: "4px", padding: "2px 8px", flex: 1 }}>{r.cmd}</code>
                      {r.note && <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>— {r.note}</span>}
                    </div>
                  ))}
                  <div style={{ marginTop: "10px", color: "var(--text-muted)", fontSize: "0.76rem" }}>
                    Then click <strong style={{ color: "var(--text-secondary)" }}>Ping Gateway</strong> again. If still failing, check <code style={{ fontFamily: "var(--font-mono)", color: "#0d5a40" }}>docker ps</code> to confirm both containers are healthy.
                  </div>
                </div>
              )}

              {error && (
                <p style={{ color: "var(--color-danger)", fontSize: "0.85rem", marginBottom: "16px" }}>
                  {error}
                </p>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button
                className="btn-ghost"
                onClick={() => setStep(2)}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                className="btn-primary"
                disabled={configuring}
                onClick={handleFinish}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {configuring ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Shield size={16} />
                )}
                Launch Gateway
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <HowItWorks open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
    </>
  );
}
