export type Labels = Record<string, string>;

interface Series {
  labels: Labels;
  value: number;
}
interface MetricEntry {
  help: string;
  type: 'counter' | 'gauge';
  series: Map<string, Series>;
}

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

/**
 * Minimal, dependency-free Prometheus registry. Enough to expose counters and
 * gauges at a `/metrics` endpoint in the Prometheus text-exposition format.
 * Drop in `prom-client` if you need histograms/summaries.
 */
export class PrometheusRegistry {
  private metrics = new Map<string, MetricEntry>();

  private ensure(
    name: string,
    type: 'counter' | 'gauge',
    help: string,
  ): MetricEntry {
    let m = this.metrics.get(name);
    if (!m) {
      m = { help, type, series: new Map() };
      this.metrics.set(name, m);
    } else if (help && !m.help) {
      m.help = help;
    }
    return m;
  }

  inc(name: string, labels: Labels = {}, by = 1, help = ''): void {
    const m = this.ensure(name, 'counter', help);
    const k = labelKey(labels);
    const s = m.series.get(k);
    if (s) s.value += by;
    else m.series.set(k, { labels, value: by });
  }

  set(name: string, value: number, labels: Labels = {}, help = ''): void {
    const m = this.ensure(name, 'gauge', help);
    m.series.set(labelKey(labels), { labels, value });
  }

  /** Render the Prometheus text exposition format. */
  render(): string {
    const lines: string[] = [];
    for (const [name, m] of this.metrics) {
      if (m.help) lines.push(`# HELP ${name} ${m.help}`);
      lines.push(`# TYPE ${name} ${m.type}`);
      for (const s of m.series.values()) {
        const lbl = Object.keys(s.labels).length
          ? '{' +
            Object.entries(s.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',') +
            '}'
          : '';
        lines.push(`${name}${lbl} ${s.value}`);
      }
    }
    return lines.join('\n') + '\n';
  }
}
