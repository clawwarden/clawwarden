import type { EventSeverity, SiemEvent, SiemExporter } from './types.js';

// RFC 5424 severity codes (subset we map onto).
const SYSLOG_SEVERITY: Record<EventSeverity, number> = {
  critical: 2, // Critical
  high: 3, // Error
  medium: 4, // Warning
  low: 6, // Informational
};

export interface SyslogOptions {
  facility?: number; // default local0 (16)
  hostname?: string;
  appName?: string;
}

/**
 * Strip CR/LF and other control characters so attacker-controlled text (prompts,
 * messages) cannot forge new syslog records or break field boundaries (log
 * injection / forging). Control chars collapse to spaces; the field stays one line.
 */
function sanitizeLine(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, ' ');
}

/**
 * Format an event as RFC 5424 syslog. Pure — testable, no I/O.
 *   <PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG
 *
 * `eventType` and `message` are sanitized — they often carry untrusted text.
 */
export function formatSyslog(event: SiemEvent, opts: SyslogOptions = {}): string {
  const facility = opts.facility ?? 16;
  const severity = SYSLOG_SEVERITY[event.severity ?? 'low'];
  const pri = facility * 8 + severity;
  const ts = (event.timestamp ?? new Date()).toISOString();
  const host = opts.hostname ?? '-';
  const app = opts.appName ?? 'clawwarden';
  const sd = formatStructuredData(event.attributes);
  const eventType = sanitizeLine(event.eventType);
  const message = sanitizeLine(event.message);
  return `<${pri}>1 ${ts} ${host} ${app} - ${eventType} ${sd} ${message}`;
}

function formatStructuredData(attrs?: Record<string, unknown>): string {
  if (!attrs || Object.keys(attrs).length === 0) return '-';
  const pairs = Object.entries(attrs)
    .map(([k, v]) => {
      // SD-NAME forbids '=', ' ', ']', '"'; param values escape '"', '\', ']'.
      const key = sanitizeLine(k).replace(/[=\]" ]/g, '_');
      const val = sanitizeLine(String(v)).replace(/(["\\\]])/g, '\\$1');
      return `${key}="${val}"`;
    })
    .join(' ');
  return `[clawwarden@0 ${pairs}]`;
}

/**
 * Format an event as a Splunk HEC JSON envelope. Pure — testable.
 */
export function formatHec(event: SiemEvent, source = 'clawwarden'): string {
  return JSON.stringify({
    time: Math.floor((event.timestamp ?? new Date()).getTime() / 1000),
    source,
    sourcetype: '_json',
    event: {
      eventType: event.eventType,
      severity: event.severity ?? 'low',
      message: event.message,
      ...event.attributes,
    },
  });
}

export interface HecOptions {
  /** Splunk HEC collector URL, e.g. https://splunk:8088/services/collector */
  url: string;
  token: string;
  source?: string;
  fetchImpl?: typeof fetch;
}

/** Splunk HTTP Event Collector exporter (thin fetch wrapper). */
export class SplunkHecExporter implements SiemExporter {
  constructor(private readonly opts: HecOptions) {}

  async export(event: SiemEvent): Promise<void> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(this.opts.url, {
      method: 'POST',
      headers: {
        Authorization: `Splunk ${this.opts.token}`,
        'Content-Type': 'application/json',
      },
      body: formatHec(event, this.opts.source),
    });
    if (!res.ok) {
      throw new Error(`Splunk HEC export failed: ${res.status}`);
    }
  }
}
