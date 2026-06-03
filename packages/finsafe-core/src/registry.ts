import type { Detector, Finding, ScanContext } from './types.js';

/**
 * Runs the registered detectors that apply to a given scan phase and aggregates
 * their findings. Detectors are independent — order does not matter.
 */
export class DetectorRegistry {
  private detectors: Detector[] = [];

  constructor(detectors: Detector[] = []) {
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
    const applicable = this.detectors.filter((d) =>
      d.phases.includes(ctx.phase),
    );
    const results = await Promise.all(applicable.map((d) => d.scan(ctx)));
    return results.flat();
  }
}
