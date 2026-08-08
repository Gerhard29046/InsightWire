import type { ConnectorMetricsSnapshot, ConnectorRunResult, MetricsStore } from './types'

interface MutableMetrics {
  connectorId: string
  totalRuns: number
  successCount: number
  partialCount: number
  failureCount: number
  totalDurationMs: number
  lastRunAt?: string
  lastSuccessAt?: string
  lastFailureAt?: string
  lastError?: string
}

function toSnapshot(m: MutableMetrics): ConnectorMetricsSnapshot {
  return {
    connectorId: m.connectorId,
    totalRuns: m.totalRuns,
    successCount: m.successCount,
    partialCount: m.partialCount,
    failureCount: m.failureCount,
    lastRunAt: m.lastRunAt,
    lastSuccessAt: m.lastSuccessAt,
    lastFailureAt: m.lastFailureAt,
    averageDurationMs: m.totalRuns === 0 ? 0 : Math.round(m.totalDurationMs / m.totalRuns),
    lastError: m.lastError,
  }
}

/**
 * In-memory only — resets on worker restart. Acceptable for Phase 2 (no
 * database yet); Phase 6's `connector_runs` table is what makes this survive
 * a redeploy or cold start.
 */
export class InMemoryMetricsStore implements MetricsStore {
  private readonly byConnector = new Map<string, MutableMetrics>()

  record(result: ConnectorRunResult): void {
    const existing = this.byConnector.get(result.connectorId) ?? {
      connectorId: result.connectorId,
      totalRuns: 0,
      successCount: 0,
      partialCount: 0,
      failureCount: 0,
      totalDurationMs: 0,
    }

    existing.totalRuns += 1
    existing.totalDurationMs += result.durationMs
    existing.lastRunAt = result.finishedAt

    if (result.status === 'success') existing.successCount += 1
    else if (result.status === 'partial') existing.partialCount += 1
    else existing.failureCount += 1

    if (result.status === 'success' || result.status === 'partial') {
      existing.lastSuccessAt = result.finishedAt
    }
    if (result.status === 'failed' || result.status === 'partial') {
      existing.lastFailureAt = result.finishedAt
      existing.lastError = result.sampleErrors[0]
    }

    this.byConnector.set(result.connectorId, existing)
  }

  getSnapshot(connectorId: string): ConnectorMetricsSnapshot | undefined {
    const existing = this.byConnector.get(connectorId)
    return existing ? toSnapshot(existing) : undefined
  }

  getAllSnapshots(): ConnectorMetricsSnapshot[] {
    return [...this.byConnector.values()].map(toSnapshot)
  }
}
