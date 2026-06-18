"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  RefreshCw,
  ChevronLeft,
  Lock,
  AlertCircle,
} from "lucide-react";
import { getJWT, getRole } from "@/lib/session";
import { getAuditLogs, verifyAudit, type AuditEntry, type VerifyResult } from "@/lib/api";

// ---------------------------------------------------------------------------
// Event type styling
// ---------------------------------------------------------------------------

const EVENT_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  session_create:      { color: "#0d5a40", bg: "rgba(13,90,64,0.08)", label: "SESSION" },
  auth_token_issued:   { color: "#0d5a40", bg: "rgba(13,90,64,0.08)", label: "AUTH" },
  auth_failure:        { color: "#b3261e", bg: "rgba(255,68,68,0.08)",  label: "FAIL" },
  chat_request:        { color: "#6f5519", bg: "rgba(138,106,34,0.08)",  label: "CHAT" },
  pii_detected:        { color: "#b3261e", bg: "rgba(255,68,68,0.08)",  label: "PII" },
  pii_detokenized:     { color: "#0d5a40", bg: "rgba(13,90,64,0.08)", label: "DETOK" },
  llm_call:            { color: "#0d5a40", bg: "rgba(13,90,64,0.08)", label: "LLM" },
  admin_access:        { color: "#6f5519", bg: "rgba(138,106,34,0.08)",  label: "ADMIN" },
  rate_limit:          { color: "#b3261e", bg: "rgba(255,68,68,0.08)",  label: "RATE" },
};

const DEFAULT_STYLE = { color: "#475569", bg: "rgba(136,153,170,0.08)", label: "EVENT" };

function eventStyle(type: string) {
  return EVENT_STYLES[type] ?? DEFAULT_STYLE;
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Event type breakdown bar
// ---------------------------------------------------------------------------

function BreakdownBar({ logs }: { logs: AuditEntry[] }) {
  const counts: Record<string, number> = {};
  for (const l of logs) counts[l.event_type] = (counts[l.event_type] ?? 0) + 1;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        padding: "12px 20px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {Object.entries(counts).map(([type, n]) => {
        const s = eventStyle(type);
        return (
          <span
            key={type}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: s.color,
              background: s.bg,
              borderRadius: "4px",
              padding: "3px 8px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {s.label}
            <span
              style={{
                background: "rgba(23,21,15,0.08)",
                color: "var(--ink)",
                borderRadius: "3px",
                padding: "0 4px",
                fontSize: "0.65rem",
              }}
            >
              {n}
            </span>
          </span>
        );
      })}
      {logs.length === 0 && (
        <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
          No events for this date
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log row
// ---------------------------------------------------------------------------

function LogRow({ entry }: { entry: AuditEntry }) {
  const s = eventStyle(entry.event_type);
  const hasDetails = Object.keys(entry.details ?? {}).length > 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 72px 120px 1fr",
        gap: "12px",
        alignItems: "start",
        padding: "7px 20px",
        borderBottom: "1px solid rgba(23,21,15,0.03)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
        lineHeight: 1.4,
      }}
    >
      {/* Timestamp */}
      <span style={{ color: "var(--text-muted)" }}>{formatTs(entry.timestamp)}</span>

      {/* Type badge */}
      <span
        style={{
          color: s.color,
          background: s.bg,
          borderRadius: "3px",
          padding: "1px 6px",
          fontWeight: 700,
          fontSize: "0.68rem",
          letterSpacing: "0.04em",
          textAlign: "center",
        }}
      >
        {s.label}
      </span>

      {/* Role + session */}
      <span style={{ color: "var(--text-secondary)" }}>
        {entry.role ?? "—"}
        {entry.session_id && (
          <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.67rem" }}>
            {entry.session_id.slice(0, 8)}…
          </span>
        )}
      </span>

      {/* Details */}
      <span style={{ color: "var(--text-secondary)", wordBreak: "break-all" }}>
        {hasDetails ? JSON.stringify(entry.details) : entry.event_type}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tamper-evidence verification banner
// ---------------------------------------------------------------------------

const ANCHOR_LABELS: Record<string, string> = {
  DurableAuditStore: "Postgres WORM mirror",
  S3ObjectLockAnchor: "S3 Object Lock",
};

function VerifyBanner({ result }: { result: VerifyResult }) {
  const ok = result.ok;
  const color = ok ? "var(--color-safe, #0d5a40)" : "var(--color-danger, #b3261e)";
  const bg = ok ? "rgba(13,90,64,0.08)" : "rgba(255,68,68,0.08)";
  const Icon = ok ? ShieldCheck : ShieldAlert;

  // Flatten checks into rows: the Redis chain, then each durable anchor (or the
  // single durable result when not a MultiAnchor).
  const rows: { label: string; ok: boolean; entries: number; error: string | null }[] = [
    {
      label: "Redis hash chain",
      ok: result.redis_chain.ok,
      entries: result.redis_chain.entries,
      error: result.redis_chain.error,
    },
  ];
  if (result.durable) {
    if (result.durable.anchors) {
      for (const [name, r] of Object.entries(result.durable.anchors)) {
        rows.push({ label: ANCHOR_LABELS[name] ?? name, ok: r.ok, entries: r.entries, error: r.error });
      }
    } else {
      rows.push({
        label: ANCHOR_LABELS["DurableAuditStore"],
        ok: result.durable.ok,
        entries: result.durable.entries,
        error: result.durable.error,
      });
    }
  }

  return (
    <div style={{ padding: "12px 20px", background: bg, borderBottom: `1px solid ${color}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: rows.length ? "8px" : 0 }}>
        <Icon size={16} style={{ color }} />
        <span style={{ color, fontWeight: 700, fontSize: "0.85rem" }}>
          {ok
            ? `Integrity verified — every link checks out (${result.date}).`
            : "TAMPER DETECTED — the audit record was altered."}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {rows.map((r) => {
          const rc = r.ok ? "var(--color-safe, #0d5a40)" : "var(--color-danger, #b3261e)";
          return (
            <span
              key={r.label}
              title={r.error ?? undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.72rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: rc,
                background: "rgba(0,0,0,0.04)",
                border: `1px solid ${rc}33`,
                borderRadius: "4px",
                padding: "3px 8px",
              }}
            >
              {r.ok ? "✓" : "✗"} {r.label}
              <span style={{ color: "var(--text-muted)" }}>{r.entries} entries</span>
            </span>
          );
        })}
      </div>
      {!ok && (
        <p style={{ color: "var(--color-danger, #b3261e)", fontSize: "0.74rem", marginTop: "8px", fontFamily: "var(--font-mono)" }}>
          {result.durable?.error ?? result.redis_chain.error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [count, setCount] = useState(0);
  const [date, setDate] = useState("");       // "" → today
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [access, setAccess] = useState<"checking" | "denied" | "ok">("checking");
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchLogs = useCallback(
    async (jwt: string) => {
      setLoading(true);
      setError("");
      try {
        const result = await getAuditLogs(jwt, date || undefined, 500);
        setLogs(result.logs);
        setCount(result.count);
      } catch (e: unknown) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [date]
  );

  const runVerify = useCallback(
    async (jwt: string) => {
      setVerifying(true);
      setError("");
      try {
        setVerify(await verifyAudit(jwt, date || undefined));
      } catch (e: unknown) {
        setVerify(null);
        setError(String(e));
      } finally {
        setVerifying(false);
      }
    },
    [date]
  );

  useEffect(() => {
    const role = getRole();
    const jwt = getJWT();
    if (role !== "admin" || !jwt) {
      setAccess("denied");
      return;
    }
    setAccess("ok");
    fetchLogs(jwt);
  }, [fetchLogs]);

  // -------------------------------------------------------------------------
  // Access denied view
  // -------------------------------------------------------------------------

  if (access === "denied") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-base)",
          gap: "16px",
        }}
      >
        <Lock size={40} style={{ color: "var(--color-danger)", opacity: 0.7 }} />
        <p style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "1.1rem" }}>
          Admin access required
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Switch your role to <strong style={{ color: "var(--color-safe)" }}>Admin</strong> in the
          chat page, then return here.
        </p>
        <button className="btn-ghost" onClick={() => router.push("/chat")}>
          <ChevronLeft size={14} style={{ marginRight: "6px" }} />
          Back to Chat
        </button>
      </div>
    );
  }

  if (access === "checking") return null;

  // -------------------------------------------------------------------------
  // Admin view
  // -------------------------------------------------------------------------

  const jwt = getJWT()!;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-base)",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(13,90,64,0.05) 0%, transparent 60%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Navbar */}
      <header
        style={{
          height: "52px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Shield size={18} style={{ color: "var(--color-primary)" }} />
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
            Admin Console
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--color-warn)",
              background: "rgba(138,106,34,0.1)",
              border: "1px solid rgba(138,106,34,0.3)",
              borderRadius: "100px",
              padding: "2px 8px",
              fontWeight: 600,
            }}
          >
            ADMIN
          </span>
        </div>
        <button
          className="btn-ghost"
          onClick={() => router.push("/chat")}
          style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" }}
        >
          <ChevronLeft size={14} />
          Back to Chat
        </button>
      </header>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(0,0,0,0.3)",
          flexShrink: 0,
          zIndex: 5,
        }}
      >
        <Activity size={14} style={{ color: "var(--color-primary)" }} />
        <span
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Audit Log
        </span>

        {/* Date picker */}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            color: "var(--text-primary)",
            fontSize: "0.8rem",
            padding: "5px 10px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
          }}
        />

        <button
          className="btn-ghost"
          onClick={() => fetchLogs(jwt)}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.8rem",
            padding: "6px 12px",
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Loading…" : "Refresh"}
        </button>

        <button
          className="btn-ghost"
          onClick={() => runVerify(jwt)}
          disabled={verifying}
          title="Walk the hash chain + WORM anchor(s) and prove no entry was altered, reordered, or deleted"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.8rem",
            padding: "6px 12px",
          }}
        >
          <ShieldCheck size={13} style={{ animation: verifying ? "spin 1s linear infinite" : "none" }} />
          {verifying ? "Verifying…" : "Verify integrity"}
        </button>

        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {count} event{count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            background: "var(--color-danger-dim)",
            borderBottom: "1px solid rgba(255,68,68,0.3)",
            color: "var(--color-danger)",
            fontSize: "0.83rem",
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Tamper-evidence verification result */}
      {verify && <VerifyBanner result={verify} />}

      {/* Breakdown bar */}
      <BreakdownBar logs={logs} />

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "70px 72px 120px 1fr",
          gap: "12px",
          padding: "6px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(0,0,0,0.4)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.67rem",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        <span>Time</span>
        <span>Type</span>
        <span>Role / Session</span>
        <span>Details</span>
      </div>

      {/* Log rows */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        {logs.length === 0 && !loading && (
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.83rem",
              margin: "40px auto",
              textAlign: "center",
            }}
          >
            No audit entries for this date.
          </p>
        )}
        {[...logs].reverse().map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
