/**
 * Core FIN-SAFE types. These interfaces are the open contract; the proprietary
 * ClawWarden detectors implement the same `Detector` interface with tuned models
 * and scoring. See README.
 */

export type DetectorPhase = 'input' | 'output';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Severity → confidence-score baseline used by the reference detectors. */
export const SEVERITY_SCORE: Record<Severity, number> = {
  low: 0.4,
  medium: 0.6,
  high: 0.8,
  critical: 0.95,
};

export interface ScanContext {
  /** Which side of the model call this text is on. */
  phase: DetectorPhase;
  /** The prompt (input) or completion (output) text to inspect. */
  text: string;
  /** Optional caller-supplied context (agentId, model, etc.). */
  metadata?: Record<string, unknown>;
}

export interface Finding {
  /** Detector id that produced this finding. */
  detector: string;
  /** Threat category, e.g. 'prompt_injection', 'pii_leakage', 'jailbreak'. */
  category: string;
  severity: Severity;
  /** Confidence 0..1. */
  score: number;
  message: string;
  /** The matched snippet, if any (kept short — never log full PII). */
  evidence?: string;
}

export interface Detector {
  readonly id: string;
  readonly category: string;
  readonly phases: readonly DetectorPhase[];
  scan(ctx: ScanContext): Finding[] | Promise<Finding[]>;
}
