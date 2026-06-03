export type EventSeverity = 'low' | 'medium' | 'high' | 'critical';

/** A normalized security/governance event for SIEM + log forwarding. */
export interface SiemEvent {
  eventType: string;
  severity?: EventSeverity;
  message: string;
  timestamp?: Date;
  /** Flat key/value context. Avoid putting raw PII here. */
  attributes?: Record<string, unknown>;
}

export interface SiemExporter {
  export(event: SiemEvent): Promise<void>;
}

/** A single metric observation. */
export interface MetricSample {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: Date;
}
