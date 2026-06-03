import type { Finding, Severity } from './types.js';

const RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface RiskAssessment {
  /** Highest detector confidence among findings (0..1). */
  riskScore: number;
  /** Worst severity observed, or 'none'. */
  level: Severity | 'none';
  findingCount: number;
  topCategory: string | null;
}

/**
 * Aggregate findings into a single assessment. This is the OPEN reference
 * aggregation (worst-severity / max-confidence). Proprietary model-risk scoring
 * with weighted, per-model risk tiers plugs in separately.
 */
export function assessRisk(findings: Finding[]): RiskAssessment {
  if (findings.length === 0) {
    return { riskScore: 0, level: 'none', findingCount: 0, topCategory: null };
  }
  const worst = findings.reduce((a, b) =>
    RANK[b.severity] > RANK[a.severity] ? b : a,
  );
  const riskScore = Math.max(...findings.map((f) => f.score));
  return {
    riskScore,
    level: worst.severity,
    findingCount: findings.length,
    topCategory: worst.category,
  };
}
