import type { Detector, Finding, ScanContext } from './types.js';

/**
 * Upper bound on text length a detector scans. Inputs are attacker-controlled,
 * and several reference patterns use `.*` — capping length bounds regex work and
 * neutralizes pathological (ReDoS) inputs. Override via the registry options.
 */
export const DEFAULT_MAX_SCAN_LENGTH = 100_000;

export interface DetectorRegistryOptions {
  maxScanLength?: number;
}

/**
 * Runs the registered detectors that apply to a given scan phase and aggregates
 * their findings. Detectors are independent — order does not matter, and a
 * throwing detector cannot suppress the others (it is isolated and surfaced as a
 * finding instead).
 */
export class DetectorRegistry {
  private detectors: Detector[] = [];
  private readonly maxScanLength: number;

  constructor(detectors: Detector[] = [], opts: DetectorRegistryOptions = {}) {
    this.maxScanLength = opts.maxScanLength ?? DEFAULT_MAX_SCAN_LENGTH;
    for (const d of detectors) this.register(d);
  }

  register(detector: Detector): this {
    this.detectors.push(detector);
    return this;
  }

  list(): readonly Detector[] {
    return this.detectors;
  }

  async scan(ctx: ScanContext): Promise<Finding[]> {
    // Bound the work per scan; truncation is safe — detectors look for markers.
    const scanCtx: ScanContext =
      ctx.text.length > this.maxScanLength
        ? { ...ctx, text: ctx.text.slice(0, this.maxScanLength) }
        : ctx;

    const applicable = this.detectors.filter((d) =>
      d.phases.includes(scanCtx.phase),
    );
    // One throwing/buggy detector must not blind the rest (fail-closed per
    // detector): isolate each and emit a critical finding for the failure.
    const settled = await Promise.allSettled(
      applicable.map(async (d) => d.scan(scanCtx)),
    );

    const findings: Finding[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      } else {
        const d = applicable[i]!;
        findings.push({
          detector: d.id,
          category: 'detector_error',
          severity: 'critical',
          score: 1,
          message: `Detector "${d.id}" failed to run: ${String(result.reason)}`.slice(0, 200),
        });
      }
    });
    return findings;
  }
}
