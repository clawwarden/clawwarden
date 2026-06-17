/**
 * clawwarden-finsafe-core — runtime AI-safety detectors.
 *
 * Open interfaces + reference heuristic detectors for OWASP LLM Top 10 risks.
 * a custom detectors implement the same `Detector` interface
 * with tuned models and per-model risk scoring.
 */

export * from './types.js';
export {
  DetectorRegistry,
  DEFAULT_MAX_SCAN_LENGTH,
  type DetectorRegistryOptions,
} from './registry.js';
export { assessRisk, type RiskAssessment } from './score.js';
export { InjectionDetector } from './detectors/injection.js';
export { PiiLeakageDetector } from './detectors/pii-leakage.js';
export { JailbreakDetector } from './detectors/jailbreak.js';

import { InjectionDetector } from './detectors/injection.js';
import { PiiLeakageDetector } from './detectors/pii-leakage.js';
import { JailbreakDetector } from './detectors/jailbreak.js';
import type { Detector } from './types.js';

/** The open reference detector set. Compose your own registry to customize. */
export function referenceDetectors(): Detector[] {
  return [
    new InjectionDetector(),
    new PiiLeakageDetector(),
    new JailbreakDetector(),
  ];
}
