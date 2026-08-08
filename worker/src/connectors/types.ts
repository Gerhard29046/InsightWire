import type { CategoryId, NormalizedEvent } from '@insightwire/shared'

export type ConnectorType = 'rss' | 'api' | 'dataset'

export interface ConnectorRateLimit {
  requestsPerMinute: number
}

export interface ConnectorHealthStatus {
  healthy: boolean
  message?: string
  checkedAt: string
}

/**
 * What a connector's fetch() returns before normalization — the untouched
 * shape received from the source, plus the metadata needed to trace it back.
 * `payload` is intentionally `unknown`: each connector knows its own raw
 * shape and narrows it in normalize()/validate(); nothing else should
 * assume a structure here.
 */
export interface RawEvent {
  connectorId: string
  externalId: string
  fetchedAt: string
  payload: unknown
}

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

/**
 * The contract every data source implements. A connector never talks to the
 * database or the AI pipeline directly — it only turns "whatever this source
 * returns" into `RawEvent`s and then `NormalizedEvent`s. Orchestration
 * (scheduling, retries, metrics) is the Connector Manager's job (Phase 2),
 * deliberately not part of this interface.
 */
export interface SourceConnector {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly type: ConnectorType
  readonly enabled: boolean
  /** Traces historical runs/records back to the connector logic that produced them. */
  readonly version: string
  /** How often this source should be polled — a fact about the source, not a scheduler guess. */
  readonly refreshIntervalMs: number
  /** Empty = global/unrestricted (matches the `country: 'Global'` placeholder pattern). */
  readonly supportedCountries: string[]
  readonly supportedCategories: CategoryId[]
  /** Absent when the source doesn't document a limit. */
  readonly rateLimit?: ConnectorRateLimit

  healthCheck(): Promise<ConnectorHealthStatus>
  fetch(): Promise<RawEvent[]>
  normalize(raw: RawEvent): NormalizedEvent
  validate(event: NormalizedEvent): ValidationResult
}
