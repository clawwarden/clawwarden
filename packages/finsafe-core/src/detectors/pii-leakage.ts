import {
  SEVERITY_SCORE,
  type Detector,
  type Finding,
  type ScanContext,
  type Severity,
} from '../types.js';

/**
 * Reference PII-leakage detector (OWASP LLM06 — sensitive information
 * disclosure). Flags identifiers appearing in model output (or echoed input).
 * Heuristic regex baseline; the proprietary detector adds NER + semantic checks.
 *
 * Evidence is redacted to a type label — we never echo the raw match.
 */
interface PiiPattern {
  re: RegExp;
  severity: Severity;
  label: string;
  /** Optional extra validation on the raw match (e.g. Luhn for card numbers). */
  validate?: (match: string) => boolean;
}

/** Luhn checksum — rejects digit runs that aren't valid card numbers. */
function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const PII_PATTERNS: PiiPattern[] = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'critical', label: 'SSN' },
  {
    re: /\b(?:\d[ -]?){13,16}\b/,
    severity: 'high',
    label: 'card-number',
    validate: luhnValid,
  },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, severity: 'medium', label: 'email' },
  { re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, severity: 'medium', label: 'phone' },
];

export class PiiLeakageDetector implements Detector {
  readonly id = 'reference.pii_leakage';
  readonly category = 'pii_leakage';
  readonly phases = ['input', 'output'] as const;

  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const p of PII_PATTERNS) {
      // Global match so a validator (Luhn) sees the actual candidate string.
      const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
      let m: RegExpExecArray | null;
      let flagged = false;
      while (!flagged && (m = re.exec(ctx.text)) !== null) {
        if (p.validate && !p.validate(m[0])) continue;
        findings.push({
          detector: this.id,
          category: this.category,
          severity: p.severity,
          score: SEVERITY_SCORE[p.severity],
          message: `Possible ${p.label} in ${ctx.phase}`,
          evidence: `<${p.label}>`,
        });
        flagged = true; // one finding per pattern is enough
      }
    }
    return findings;
  }
}
