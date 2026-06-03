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
const PII_PATTERNS: Array<{ re: RegExp; severity: Severity; label: string }> = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'critical', label: 'SSN' },
  { re: /\b(?:\d[ -]?){13,16}\b/, severity: 'high', label: 'card-number' },
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
      if (p.re.test(ctx.text)) {
        findings.push({
          detector: this.id,
          category: this.category,
          severity: p.severity,
          score: SEVERITY_SCORE[p.severity],
          message: `Possible ${p.label} in ${ctx.phase}`,
          evidence: `<${p.label}>`,
        });
      }
    }
    return findings;
  }
}
