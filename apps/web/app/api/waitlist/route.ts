import { NextRequest, NextResponse } from "next/server";

// Best-effort per-IP rate limit. In-memory = per-instance only; for durable,
// cross-instance limiting back this with Upstash Redis or a Vercel WAF rate-limit
// rule. Still stops naive spam against the public waitlist + Resend cost abuse.
const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }
  rec.count += 1;
  if (rec.count > RATE_LIMIT) {
    return { limited: true, retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : "").trim() || "unknown";
}

interface WaitlistEntry {
  email: string;
  company: string;
  role: string;
  timestamp: string;
}

// Escape HTML special chars so user input can never inject tags into the email body.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Strip newlines and angle brackets from email subject to prevent SMTP header injection.
function safeSubject(s: string): string {
  return s.replace(/[\r\n<>]/g, "");
}

// Email notification is sent to hello@clawwarden.space via the Resend API.
// Set the RESEND_API_KEY environment variable in Vercel project settings.
// Get a free key (100 emails/day) at https://resend.com
//
// Optional: also set WAITLIST_WEBHOOK_URL to forward entries to any
// additional webhook (Zapier, Make, n8n, Airtable, Formspree, etc.)

async function sendEmailNotification(entry: WaitlistEntry): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // Skip silently if key not configured

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; background: #0a0f1e; color: #e2e8f0; padding: 32px; border-radius: 12px;">
      <h2 style="color: #00d4ff; margin-top: 0;">New ClawWarden Waitlist Signup</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #94a3b8; width: 90px;">Email</td><td style="padding: 8px 0; font-weight: 600;">${esc(entry.email)}</td></tr>
        ${entry.company ? `<tr><td style="padding: 8px 0; color: #94a3b8;">Company</td><td style="padding: 8px 0;">${esc(entry.company)}</td></tr>` : ""}
        ${entry.role ? `<tr><td style="padding: 8px 0; color: #94a3b8;">Role</td><td style="padding: 8px 0;">${esc(entry.role)}</td></tr>` : ""}
        <tr><td style="padding: 8px 0; color: #94a3b8;">Time</td><td style="padding: 8px 0; font-size: 0.85em;">${esc(entry.timestamp)}</td></tr>
      </table>
      <p style="margin-top: 24px; font-size: 0.8em; color: #64748b;">Sent by ClawWarden waitlist API Â· clawwarden.space</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ClawWarden Waitlist <waitlist@clawwarden.space>",
      to: ["hello@clawwarden.space"],
      subject: safeSubject(`New waitlist signup: ${entry.email}${entry.company ? ` (${entry.company})` : ""}`),
      html,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown");
    console.error("[WAITLIST] Resend email failed:", response.status, err);
  }
}

export async function POST(req: NextRequest) {
  const { limited, retryAfter } = rateLimited(clientIp(req));
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: { email?: string; company?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@") || !email.includes(".")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (email.length > 254) {
    return NextResponse.json({ error: "Email too long" }, { status: 400 });
  }

  const entry: WaitlistEntry = {
    email,
    company: (body.company || "").trim().slice(0, 200),
    role: (body.role || "").trim().slice(0, 100),
    timestamp: new Date().toISOString(),
  };

  // Always log (visible in Vercel function logs)
  console.log("[WAITLIST]", JSON.stringify(entry));

  // Send email notification to hello@clawwarden.space via Resend
  await sendEmailNotification(entry).catch(err =>
    console.error("[WAITLIST] Email notification error:", err)
  );

  // Also forward to optional webhook if configured
  const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).catch(err => console.error("[WAITLIST] Webhook forward failed:", err));
  }

  return NextResponse.json({
    message: "You are on the list! We will notify you at launch with 3 months free access.",
  });
}

export async function GET() {
  // Placeholder â€” returns 0 when no persistent store is configured.
  // Set WAITLIST_WEBHOOK_URL to a service that tracks counts if needed.
  return NextResponse.json({ count: 0 });
}
