export type RunStatus = 'success' | 'partial' | 'failed'

export interface ConnectorRunResult {
  connectorId: string
  status: RunStatus
  startedAt: string
  finishedAt: string
  durationMs: number
  attempts: number
  itemsFetched: number
  itemsNormalized: number
  itemsValid: number
  itemsInvalid: number
  /** Up to 5 sample error messages — enough to debug, not a full audit log. */
  sampleErrors: string[]
}

export type CollectionStatus = 'collected' | 'failed'

/**
 * Result of the async pipeline's collection step (ConnectorManager.collectDue)
 * — deliberately lighter than ConnectorRunResult: normalize/validate haven't
 * run yet at this point (see worker/src/pipeline/processMessage.ts), so
 * there's nothing to report beyond "did we fetch, and how much."
 */
export interface CollectionResult {
  connectorId: string
  status: CollectionStatus
  startedAt: string
  finishedAt: string
  durationMs: number
  attempts: number
  itemsCollected: number
  error?: string
}

export interface ConnectorMetricsSnapshot {
  connectorId: string
  totalRuns: number
  successCount: number
  partialCount: number
  failureCount: number
  lastRunAt?: string
  lastSuccessAt?: string
  lastFailureAt?: string
  averageDurationMs: number
  lastError?: string
}

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  event: string
  timestamp: string
  connectorId?: string
  [key: string]: unknown
}

export interface Logger {
  log(entry: LogEntry): void
}

export interface MetricsStore {
  record(result: ConnectorRunResult): void
  getSnapshot(connectorId: string): ConnectorMetricsSnapshot | undefined
  getAllSnapshots(): ConnectorMetricsSnapshot[]
}
