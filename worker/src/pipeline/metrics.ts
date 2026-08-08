import type { SourceCategory } from './trust'

export type PriorityBucket = '0-25' | '25-50' | '50-75' | '75-100'

export interface PipelineMetricsSnapshot {
  eventsCollected: number
  itemsProcessed: number
  /** How many items were found to share content with an existing event — regardless of what happened next. */
  duplicatesDetected: number
  /** How many of those duplicates actually completed a merge — "merge rate" = merged ÷ duplicatesDetected, expected ~100%. A real health signal if it drops. */
  merged: number
  updatesRecorded: number
  workerFailures: number
  retryCount: number
  averageProcessingTimeMs: number
  averageAiLatencyMs: number
  /** Items processed per minute since this store was created (resets on Worker restart, same as everything else here). */
  queueThroughputPerMinute: number
  sourceTrustDistribution: Record<SourceCategory, number>
  priorityDistribution: Record<PriorityBucket, number>
}

export type ProcessingOutcome = 'stored' | 'merged' | 'updated' | 'unchanged' | 'failed'

export interface ProcessingRecord {
  processingTimeMs: number
  /** Absent when no AI provider call was made (e.g. an unchanged re-fetch skipped before enrichment). */
  aiLatencyMs?: number
  outcome: ProcessingOutcome
  /** Cloudflare Queues exposes this natively per-message — recorded, not invented. */
  retries?: number
  /** True whenever dedupe.ts found a content-hash match, independent of whether the merge itself succeeded. */
  duplicateDetected?: boolean
  sourceCategory?: SourceCategory
  priorityScore?: number
}

function priorityBucket(score: number): PriorityBucket {
  if (score >= 75) return '75-100'
  if (score >= 50) return '50-75'
  if (score >= 25) return '25-50'
  return '0-25'
}

/**
 * Consumer-side metrics — deliberately separate from ConnectorManager's
 * collection-side ConnectorMetricsSnapshot, matching the actual
 * collect-vs-process architecture split (see
 * computeAverageConnectorLatency below for how the two are combined for
 * reporting without merging the stores themselves). "Queue depth" is
 * intentionally NOT modeled here: a Worker can't introspect its own
 * queue's true backlog from inside a consumer (only Cloudflare's dashboard/
 * GraphQL Analytics API can) — fabricating an approximation would be worse
 * than not reporting it.
 */
export interface PipelineMetrics {
  recordCollected(count: number): void
  recordProcessing(record: ProcessingRecord): void
  recordWorkerFailure(): void
  getSnapshot(): PipelineMetricsSnapshot
}

const EMPTY_TRUST_DISTRIBUTION: Record<SourceCategory, number> = {
  official: 0,
  government: 0,
  company: 0,
  ngo: 0,
  university: 0,
  rss: 0,
  community: 0,
}

const EMPTY_PRIORITY_DISTRIBUTION: Record<PriorityBucket, number> = {
  '0-25': 0,
  '25-50': 0,
  '50-75': 0,
  '75-100': 0,
}

export class InMemoryPipelineMetrics implements PipelineMetrics {
  private readonly createdAt = Date.now()
  private eventsCollected = 0
  private itemsProcessed = 0
  private duplicatesDetected = 0
  private merged = 0
  private updatesRecorded = 0
  private workerFailures = 0
  private retryCount = 0
  private totalProcessingTimeMs = 0
  private totalAiLatencyMs = 0
  private aiLatencySamples = 0
  private readonly sourceTrustDistribution = { ...EMPTY_TRUST_DISTRIBUTION }
  private readonly priorityDistribution = { ...EMPTY_PRIORITY_DISTRIBUTION }

  recordCollected(count: number): void {
    this.eventsCollected += count
  }

  recordProcessing(record: ProcessingRecord): void {
    this.itemsProcessed += 1
    this.totalProcessingTimeMs += record.processingTimeMs
    if (record.aiLatencyMs !== undefined) {
      this.totalAiLatencyMs += record.aiLatencyMs
      this.aiLatencySamples += 1
    }
    if (record.duplicateDetected) this.duplicatesDetected += 1
    if (record.outcome === 'merged') this.merged += 1
    if (record.outcome === 'updated') this.updatesRecorded += 1
    if (record.retries) this.retryCount += record.retries
    if (record.sourceCategory) this.sourceTrustDistribution[record.sourceCategory] += 1
    if (record.priorityScore !== undefined) this.priorityDistribution[priorityBucket(record.priorityScore)] += 1
  }

  recordWorkerFailure(): void {
    this.workerFailures += 1
  }

  getSnapshot(): PipelineMetricsSnapshot {
    const elapsedMinutes = Math.max((Date.now() - this.createdAt) / 60_000, 1 / 60)
    return {
      eventsCollected: this.eventsCollected,
      itemsProcessed: this.itemsProcessed,
      duplicatesDetected: this.duplicatesDetected,
      merged: this.merged,
      updatesRecorded: this.updatesRecorded,
      workerFailures: this.workerFailures,
      retryCount: this.retryCount,
      averageProcessingTimeMs:
        this.itemsProcessed === 0 ? 0 : Math.round(this.totalProcessingTimeMs / this.itemsProcessed),
      averageAiLatencyMs:
        this.aiLatencySamples === 0 ? 0 : Math.round(this.totalAiLatencyMs / this.aiLatencySamples),
      queueThroughputPerMinute: Math.round((this.itemsProcessed / elapsedMinutes) * 100) / 100,
      sourceTrustDistribution: { ...this.sourceTrustDistribution },
      priorityDistribution: { ...this.priorityDistribution },
    }
  }
}

/**
 * Combines ConnectorManager's per-connector averageDurationMs (collection
 * side) into one fleet-wide number — a plain function, not stored state,
 * since PipelineMetrics has no visibility into ConnectorManager and
 * shouldn't need any to report this.
 */
export function computeAverageConnectorLatency(
  connectorSnapshots: { averageDurationMs: number; totalRuns: number }[],
): number {
  const withRuns = connectorSnapshots.filter((s) => s.totalRuns > 0)
  if (withRuns.length === 0) return 0
  const total = withRuns.reduce((sum, s) => sum + s.averageDurationMs, 0)
  return Math.round(total / withRuns.length)
}
