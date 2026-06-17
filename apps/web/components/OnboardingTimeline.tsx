"use client";

import { useState } from "react";

const STEPS = [
  {
    num: "01",
    time: "~2 min",
    title: "Prerequisites",
    what: "Docker Desktop installed and running. Either an Anthropic/OpenAI API key, or Ollama installed locally (free, zero egress).",
    command: "# Verify Docker is installed and running\ndocker --version\ndocker compose version\n\n# Optional: verify Ollama (required for free Starter tier)\nollama --version",
    output: "Docker version 27.x, build abc1234\nDocker Compose version v2.32.x\n\nollama version 0.5.x",
  },
  {
    num: "02",
    time: "~3 min",
    title: "Pull and start the gateway",
    what: "One docker-compose command starts the FastAPI gateway, Presidio NER engine, and Redis token vault — all in your network.",
    command: "git clone https://github.com/clawwarden/clawwarden-core\ncd clawwarden-core\ndocker-compose up -d",
    output: "✓  presidio-analyzer  started\n✓  redis              started\n✓  clawwarden-gateway    started\n→  Listening on http://localhost:8000",
  },
  {
    num: "03",
    time: "~1 min",
    title: "Point your SDK at the gateway",
    what: "Change one line in your existing Python or Node code. No other modifications needed.",
    command: `# Python (Anthropic)\nclient = anthropic.Anthropic(\n    base_url="http://localhost:8000",\n    api_key="sk-ant-..."\n)\n\n# Node (OpenAI)\nconst client = new OpenAI({\n    baseURL: "http://localhost:8000",\n    apiKey: "sk-..."\n});`,
    output: null,
  },
  {
    num: "04",
    time: "~2 min",
    title: "Send a test prompt",
    what: "Run a curl to verify PII is being tokenized before leaving the gateway.",
    command: `curl http://localhost:8000/v1/messages \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"Review loan for Jane Smith, SSN 123-45-6789"}]}'`,
    output: `# What the LLM receives (logged by gateway):\n"Review loan for {{PERSON_1}}, SSN {{SSN_1}}"\n\n# What you receive back:\n"{{PERSON_1}}'s application shows moderate risk..."`,
  },
  {
    num: "05",
    time: "~2 min",
    title: "Check the audit log",
    what: "Every request is logged with a correlation ID, entity counts, and role. Accessible via the admin console or direct Redis query.",
    command: `curl http://localhost:8000/audit?limit=1`,
    output: `{\n  "correlation_id": "req_a1b2c3",\n  "timestamp": "2026-06-03T09:14:22Z",\n  "user_role": "junior_analyst",\n  "provider": "anthropic",\n  "entities_detected": { "PERSON": 1, "SSN": 1 },\n  "latency_ms": 6,\n  "pii_in_response": false\n}`,
  },
];

export default function OnboardingTimeline() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={{ marginBottom: "40px" }}>
      {/* Header */}
      <div style={{ background: "var(--vault-soft)", border: "1px solid rgba(13,90,64,0.25)", borderRadius: "4px", padding: "20px 24px", marginBottom: "10px", display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>🚀</span>
        <div>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--vault)", margin: "0 0 4px" }}>Under 30 minutes, from zero to protected</p>
          <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)", margin: 0, lineHeight: 1.55 }}>
            The five steps below are the complete deployment path. Total elapsed time: ~10 minutes on a prepared machine, ~30 minutes including model setup and first test. Click any step to see the exact commands and expected output.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {STEPS.map((step, i) => {
          const open = expanded === i;
          return (
            <div
              key={step.num}
              style={{ background: "var(--paper-card)", border: "1px solid " + (open ? "rgba(13,90,64,0.4)" : "var(--rule)"), borderRadius: "4px", overflow: "hidden", transition: "border-color 0.2s" }}
            >
              <button
                onClick={() => setExpanded(open ? null : i)}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", textAlign: "left" }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "var(--vault-soft)", border: "1px solid rgba(13,90,64,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--vault)", fontFamily: "var(--font-mono)" }}>{step.num}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--ink)", marginBottom: "2px" }}>{step.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>{step.what}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--vault)", fontWeight: 600, background: "var(--vault-soft)", border: "1px solid rgba(13,90,64,0.25)", borderRadius: "100px", padding: "2px 8px", fontFamily: "var(--font-mono)" }}>
                    {step.time}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--ink-faint)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                </div>
              </button>

              {open && (step.command || step.output) && (
                <div style={{ padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {step.command && (
                    <div style={{ background: "var(--ink)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(241,236,225,0.12)", fontSize: "0.6rem", color: "rgba(241,236,225,0.55)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>COMMAND</div>
                      <pre style={{ margin: 0, padding: "14px 16px", fontSize: "0.76rem", fontFamily: "var(--font-mono)", color: "rgba(241,236,225,0.9)", lineHeight: 1.65, overflowX: "auto" }}><code>{step.command}</code></pre>
                    </div>
                  )}
                  {step.output && (
                    <div style={{ background: "var(--ink)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(127,209,168,0.2)", fontSize: "0.6rem", color: "#7fd1a8", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>EXPECTED OUTPUT</div>
                      <pre style={{ margin: 0, padding: "14px 16px", fontSize: "0.76rem", fontFamily: "var(--font-mono)", color: "#9ad8b5", lineHeight: 1.65, overflowX: "auto" }}><code>{step.output}</code></pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: "12px", fontSize: "0.72rem", color: "var(--ink-faint)", textAlign: "center", lineHeight: 1.6 }}>
        Commands target clawwarden v0.x · Tested on macOS (Apple Silicon), Linux (x86_64), Windows with WSL2
      </p>
    </div>
  );
}
