import type { MetricSample } from './types.js';

export interface DatadogSeries {
  series: Array<{
    metric: string;
    points: Array<[number, number]>;
    tags: string[];
    type: number; // 0 unspecified, 1 count, 2 rate, 3 gauge
  }>;
}

/** Convert metric samples to a Datadog v2 series payload. Pure — testable. */
export function toDatadogSeries(samples: MetricSample[]): DatadogSeries {
  return {
    series: samples.map((s) => ({
      metric: s.name,
      points: [
        [
          Math.floor((s.timestamp ?? new Date()).getTime() / 1000),
          s.value,
        ] as [number, number],
      ],
      tags: Object.entries(s.tags ?? {}).map(([k, v]) => `${k}:${v}`),
      type: 3,
    })),
  };
}

export interface DatadogOptions {
  apiKey: string;
  site?: string; // e.g. 'datadoghq.com' (default) or 'datadoghq.eu'
  fetchImpl?: typeof fetch;
}

/** Thin Datadog metrics exporter (fetch wrapper). */
export class DatadogExporter {
  constructor(private readonly opts: DatadogOptions) {}

  async export(samples: MetricSample[]): Promise<void> {
    if (samples.length === 0) return;
    const site = this.opts.site ?? 'datadoghq.com';
    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(`https://api.${site}/api/v2/series`, {
      method: 'POST',
      headers: {
        'DD-API-KEY': this.opts.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toDatadogSeries(samples)),
    });
    if (!res.ok) {
      throw new Error(`Datadog export failed: ${res.status}`);
    }
  }
}
