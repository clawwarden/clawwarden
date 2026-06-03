import {
  SEVERITY_SCORE,
  type Detector,
  type Finding,
  type ScanContext,
  type Severity,
} from '../types.js';

/**
 * Reference jailbreak detector. Flags well-known guardrail-bypass markers.
 * Heuristic baseline; proprietary detector adds adversarial/ML detection.
 */
const MARKERS: Array<{ re: RegExp; severity: Severity; label: string }> = [
  { re: /\bdo\s+anything\s+now\b|\bD\.?A\.?N\.?\b/i, severity: 'high', label: 'DAN' },
  { re: /\bdeveloper\s+mode\b/i, severity: 'medium', label: 'developer-mode' },
  { re: /pretend\b.*\b(?:no\s+(?:restrictions?|rules?|filters?)|unrestricted|without\s+limits?)/i, severity: 'high', label: 'roleplay-bypass' },
  { re: /(?:ignore|bypass|turn\s+off)\s+(?:your\s+)?(?:safety|content|moderation)\s+(?:guidelines?|policy|policies|filters?|rules?)/i, severity: 'high', label: 'safety-bypass' },
  { re: /\bjailbreak\b/i, severity: 'low', label: 'keyword' },
];

export class JailbreakDetector implements Detector {
  readonly id = 'reference.jailbreak';
  readonly category = 'jailbreak';
  readonly phases = ['input'] as const;

  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const m of MARKERS) {
      const match = m.re.exec(ctx.text);
      if (match) {
        findings.push({
          detector: this.id,
          category: this.category,
          severity: m.severity,
          score: SEVERITY_SCORE[m.severity],
          message: `Possible jailbreak attempt (${m.label})`,
          evidence: match[0].slice(0, 80),
        });
      }
    }
    return findings;
  }
}
