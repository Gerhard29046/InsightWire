import { describe, expect, it } from 'vitest'
import { computeAverageConnectorLatency, InMemoryPipelineMetrics } from './metrics'

describe('InMemoryPipelineMetrics', () => {
  it('starts at zero', () => {
    const metrics = new InMemoryPipelineMetrics()
    const snapshot = metrics.getSnapshot()
    expect(snapshot.eventsCollected).toBe(0)
    expect(snapshot.itemsProcessed).toBe(0)
    expect(snapshot.duplicatesDetected).toBe(0)
    expect(snapshot.merged).toBe(0)
    expect(snapshot.updatesRecorded).toBe(0)
    expect(snapshot.workerFailures).toBe(0)
    expect(snapshot.retryCount).toBe(0)
    expect(snapshot.averageProcessingTimeMs).toBe(0)
    expect(snapshot.averageAiLatencyMs).toBe(0)
    expect(Object.values(snapshot.sourceTrustDistribution).every((n) => n === 0)).toBe(true)
    expect(Object.values(snapshot.priorityDistribution).every((n) => n === 0)).toBe(true)
  })

  it('accumulates collected counts', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordCollected(5)
    metrics.recordCollected(3)
    expect(metrics.getSnapshot().eventsCollected).toBe(8)
  })

  it('tracks duplicatesDetected independently from merged outcome', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored' })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'merged', duplicateDetected: true })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'updated' })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'unchanged' })
    const snapshot = metrics.getSnapshot()
    expect(snapshot.itemsProcessed).toBe(4)
    expect(snapshot.duplicatesDetected).toBe(1)
    expect(snapshot.merged).toBe(1)
    expect(snapshot.updatesRecorded).toBe(1)
  })

  it('a duplicate that fails to merge (defensive fallback) counts as detected but not merged', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', duplicateDetected: true })
    const snapshot = metrics.getSnapshot()
    expect(snapshot.duplicatesDetected).toBe(1)
    expect(snapshot.merged).toBe(0)
  })

  it('computes average processing and AI latency only over samples that have them', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 100, aiLatencyMs: 500, outcome: 'stored' })
    metrics.recordProcessing({ processingTimeMs: 200, outcome: 'merged', duplicateDetected: true })
    const snapshot = metrics.getSnapshot()
    expect(snapshot.averageProcessingTimeMs).toBe(150)
    expect(snapshot.averageAiLatencyMs).toBe(500)
  })

  it('accumulates retry counts and worker failures', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'failed', retries: 2 })
    metrics.recordWorkerFailure()
    metrics.recordWorkerFailure()
    const snapshot = metrics.getSnapshot()
    expect(snapshot.retryCount).toBe(2)
    expect(snapshot.workerFailures).toBe(2)
  })

  it('buckets source trust distribution by category', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', sourceCategory: 'government' })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', sourceCategory: 'government' })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', sourceCategory: 'official' })
    const snapshot = metrics.getSnapshot()
    expect(snapshot.sourceTrustDistribution.government).toBe(2)
    expect(snapshot.sourceTrustDistribution.official).toBe(1)
    expect(snapshot.sourceTrustDistribution.community).toBe(0)
  })

  it('buckets priority distribution into 25-point ranges', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', priorityScore: 10 })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', priorityScore: 40 })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', priorityScore: 60 })
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored', priorityScore: 90 })
    const snapshot = metrics.getSnapshot()
    expect(snapshot.priorityDistribution).toEqual({ '0-25': 1, '25-50': 1, '50-75': 1, '75-100': 1 })
  })

  it('reports a non-negative queue throughput once items have been processed', () => {
    const metrics = new InMemoryPipelineMetrics()
    metrics.recordProcessing({ processingTimeMs: 10, outcome: 'stored' })
    expect(metrics.getSnapshot().queueThroughputPerMinute).toBeGreaterThan(0)
  })
})

describe('computeAverageConnectorLatency', () => {
  it('returns 0 for an empty fleet', () => {
    expect(computeAverageConnectorLatency([])).toBe(0)
  })

  it('ignores connectors that have never run', () => {
    const avg = computeAverageConnectorLatency([
      { averageDurationMs: 100, totalRuns: 5 },
      { averageDurationMs: 0, totalRuns: 0 },
    ])
    expect(avg).toBe(100)
  })

  it('averages across connectors that have run', () => {
    const avg = computeAverageConnectorLatency([
      { averageDurationMs: 100, totalRuns: 3 },
      { averageDurationMs: 300, totalRuns: 1 },
    ])
    expect(avg).toBe(200)
  })
})
