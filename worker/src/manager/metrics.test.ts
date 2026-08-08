import { describe, expect, it } from 'vitest'
import { InMemoryMetricsStore } from './metrics'
import type { ConnectorRunResult } from './types'

function makeResult(overrides: Partial<ConnectorRunResult> = {}): ConnectorRunResult {
  return {
    connectorId: 'test',
    status: 'success',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    attempts: 1,
    itemsFetched: 5,
    itemsNormalized: 5,
    itemsValid: 5,
    itemsInvalid: 0,
    sampleErrors: [],
    ...overrides,
  }
}

describe('InMemoryMetricsStore', () => {
  it('returns undefined for a connector with no recorded runs', () => {
    const store = new InMemoryMetricsStore()
    expect(store.getSnapshot('missing')).toBeUndefined()
  })

  it('accumulates counts and computes an average duration across runs', () => {
    const store = new InMemoryMetricsStore()
    store.record(makeResult({ durationMs: 1000, finishedAt: 't1' }))
    store.record(makeResult({ durationMs: 3000, finishedAt: 't2' }))
    const snapshot = store.getSnapshot('test')
    expect(snapshot?.totalRuns).toBe(2)
    expect(snapshot?.successCount).toBe(2)
    expect(snapshot?.averageDurationMs).toBe(2000)
    expect(snapshot?.lastRunAt).toBe('t2')
  })

  it('tracks success/partial/failure counts and the last error independently', () => {
    const store = new InMemoryMetricsStore()
    store.record(makeResult({ status: 'success', finishedAt: 't1' }))
    store.record(makeResult({ status: 'partial', finishedAt: 't2', sampleErrors: ['bad item'] }))
    store.record(makeResult({ status: 'failed', finishedAt: 't3', sampleErrors: ['down'] }))
    const snapshot = store.getSnapshot('test')
    expect(snapshot?.successCount).toBe(1)
    expect(snapshot?.partialCount).toBe(1)
    expect(snapshot?.failureCount).toBe(1)
    expect(snapshot?.lastSuccessAt).toBe('t2')
    expect(snapshot?.lastFailureAt).toBe('t3')
    expect(snapshot?.lastError).toBe('down')
  })

  it('lists snapshots for every connector that has recorded a run', () => {
    const store = new InMemoryMetricsStore()
    store.record(makeResult({ connectorId: 'a' }))
    store.record(makeResult({ connectorId: 'b' }))
    expect(
      store
        .getAllSnapshots()
        .map((s) => s.connectorId)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})
