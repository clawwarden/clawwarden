import {
  SEVERITY_SCORE,
  type Detector,
  type Finding,
  type ScanContext,
  type Severity,
} from '../types.js';

/**
 * Reference prompt-injection detector (OWASP LLM01). Heuristic pattern set —
 * an open baseline, NOT a complete defense. a custom detector
 * implements the same `Detector` interface with tuned/ML detection.
 */
const PATTERNS: Array<{ re: RegExp; severity: Severity; label: string }> = [
  { re: /ignore\s+(?:all\s+|the\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?)/i, severity: 'high', label: 'override-instructions' },
  { re: /disregard\s+(?:the\s+)?(?:system|above|previous|earlier)/i, severity: 'high', label: 'disregard' },
  { re: /reveal\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?)/i, severity: 'high', label: 'prompt-extraction' },
  { re: /\bnew\s+instructions?\s*:/i, severity: 'medium', label: 'injected-instructions' },
  { re: /\byou\s+are\s+now\b/i, severity: 'medium', label: 'role-reassignment' },
  { re: /\bsystem\s+prompt\b/i, severity: 'medium', label: 'system-prompt-probe' },
];

export class InjectionDetector implements Detector {
  readonly id = 'reference.injection';
  readonly category = 'prompt_injection';
  readonly phases = ['input'] as const;

  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const p of PATTERNS) {
      const m = p.re.exec(ctx.text);
      if (m) {
        findings.push({
          detector: this.id,
          category: this.category,
          severity: p.severity,
          score: SEVERITY_SCORE[p.severity],
          message: `Possible prompt injection (${p.label})`,
          evidence: m[0].slice(0, 80),
        });
      }
    }
    return findings;
  }
}
