import { describe, expect, it, vi } from 'vitest'
import { ConnectorRegistry } from '../connectors/registry'
import { ConnectorManager } from './ConnectorManager'
import { FakeConnector, makeRawEvent } from './__fixtures__/FakeConnector'
import type { MetricsStore } from './types'

function silentLogger() {
  return { log: vi.fn() }
}

describe('ConnectorManager', () => {
  it('runs a healthy connector and records a success', async () => {
    const registry = new ConnectorRegistry()
    const connector = new FakeConnector({ id: 'a', items: [makeRawEvent('a', 'ev-1')] })
    registry.register(connector)
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const result = await manager.runConnector('a')
    expect(result.status).toBe('success')
    expect(result.itemsFetched).toBe(1)
    expect(result.itemsValid).toBe(1)
    expect(result.itemsInvalid).toBe(0)

    const snapshot = manager.getMetrics().find((s) => s.connectorId === 'a')
    expect(snapshot?.successCount).toBe(1)
  })

  it('skips the fetch and fails immediately when the connector reports unhealthy', async () => {
    const registry = new ConnectorRegistry()
    const connector = new FakeConnector({ id: 'a', healthy: false })
    registry.register(connector)
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const result = await manager.runConnector('a')
    expect(result.status).toBe('failed')
    expect(connector.fetchCallCount).toBe(0)
  })

  it('retries a failing fetch and recovers within the retry budget', async () => {
    const registry = new ConnectorRegistry()
    const connector = new FakeConnector({ id: 'a', failFetchTimes: 2, items: [makeRawEvent('a', 'ev-1')] })
    registry.register(connector)
    const manager = new ConnectorManager(registry, {
      logger: silentLogger(),
      retryPolicy: { maxAttempts: 3, baseDelayMs: 1 },
    })

    const result = await manager.runConnector('a')
    expect(result.status).toBe('success')
    expect(result.attempts).toBe(3)
    expect(connector.fetchCallCount).toBe(3)
  })

  it('fails the run once retries are exhausted', async () => {
    const registry = new ConnectorRegistry()
    const connector = new FakeConnector({ id: 'a', failFetchTimes: 5 })
    registry.register(connector)
    const manager = new ConnectorManager(registry, {
      logger: silentLogger(),
      retryPolicy: { maxAttempts: 2, baseDelayMs: 1 },
    })

    const result = await manager.runConnector('a')
    expect(result.status).toBe('failed')
    expect(result.attempts).toBe(2)
    expect(result.sampleErrors[0]).toMatch(/simulated fetch failure/)
  })

  it('isolates a per-item normalize failure without failing the whole run', async () => {
    const registry = new ConnectorRegistry()
    const connector = new FakeConnector({
      id: 'a',
      items: [makeRawEvent('a', 'ev-1'), makeRawEvent('a', 'ev-2')],
      throwOnNormalizeFor: ['ev-2'],
    })
    registry.register(connector)
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const result = await manager.runConnector('a')
    expect(result.status).toBe('partial')
    expect(result.itemsValid).toBe(1)
    expect(result.itemsInvalid).toBe(1)
  })

  it('marks the run failed when every fetched item is invalid', async () => {
    const registry = new ConnectorRegistry()
    const connector = new FakeConnector({ id: 'a', items: [makeRawEvent('a', 'ev-1')], invalidFor: ['ev-1'] })
    registry.register(connector)
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const result = await manager.runConnector('a')
    expect(result.status).toBe('failed')
    expect(result.itemsValid).toBe(0)
    expect(result.itemsInvalid).toBe(1)
  })

  it('runAll runs every enabled connector and skips disabled ones', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'a', items: [makeRawEvent('a', 'ev-1')] }))
    registry.register(new FakeConnector({ id: 'b', enabled: false }))
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const results = await manager.runAll()
    expect(results.map((r) => r.connectorId)).toEqual(['a'])
  })

  it('runAll isolates one connector failing from the others succeeding', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'good', items: [makeRawEvent('good', 'ev-1')] }))
    registry.register(new FakeConnector({ id: 'bad', failFetchTimes: 99 }))
    const manager = new ConnectorManager(registry, {
      logger: silentLogger(),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 1 },
    })

    const results = await manager.runAll()
    expect(results.find((r) => r.connectorId === 'good')?.status).toBe('success')
    expect(results.find((r) => r.connectorId === 'bad')?.status).toBe('failed')
  })

  it('runDue runs connectors that have never run before', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'a', items: [] }))
    registry.register(new FakeConnector({ id: 'b', items: [] }))
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const results = await manager.runDue()
    expect(results.map((r) => r.connectorId).sort()).toEqual(['a', 'b'])
  })

  it('runDue only includes connectors whose refreshIntervalMs has elapsed since lastRunAt', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'frequent', refreshIntervalMs: 1000, items: [] }))
    registry.register(new FakeConnector({ id: 'infrequent', refreshIntervalMs: 10_000, items: [] }))

    const lastRunAt = '2026-01-01T00:00:00.000Z'
    const fakeMetrics: MetricsStore = {
      record: () => {},
      getSnapshot: (connectorId) => ({
        connectorId,
        totalRuns: 1,
        successCount: 1,
        partialCount: 0,
        failureCount: 0,
        lastRunAt,
        averageDurationMs: 0,
      }),
      getAllSnapshots: () => [],
    }
    const manager = new ConnectorManager(registry, { logger: silentLogger(), metrics: fakeMetrics })

    // 2s after lastRunAt: "frequent" (1s interval) is due again, "infrequent" (10s) isn't.
    const now = new Date(new Date(lastRunAt).getTime() + 2000)
    const results = await manager.runDue(now)
    expect(results.map((r) => r.connectorId)).toEqual(['frequent'])
  })

  it('getHealthSnapshot reports health for every registered connector, including disabled ones', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'a', healthy: true }))
    registry.register(new FakeConnector({ id: 'b', healthy: false, enabled: false }))
    const manager = new ConnectorManager(registry, { logger: silentLogger() })

    const health = await manager.getHealthSnapshot()
    expect(health.find((h) => h.connectorId === 'a')?.healthy).toBe(true)
    expect(health.find((h) => h.connectorId === 'b')?.healthy).toBe(false)
  })

  it('throws for an unknown connector id', async () => {
    const manager = new ConnectorManager(new ConnectorRegistry(), { logger: silentLogger() })
    await expect(manager.runConnector('missing')).rejects.toThrow(/Unknown connector/)
  })

  describe('collectDue', () => {
    it('publishes each fetched raw event instead of normalizing it', async () => {
      const registry = new ConnectorRegistry()
      const items = [makeRawEvent('a', 'ev-1'), makeRawEvent('a', 'ev-2')]
      registry.register(new FakeConnector({ id: 'a', items }))
      const manager = new ConnectorManager(registry, { logger: silentLogger() })

      const published: unknown[] = []
      const results = await manager.collectDue(async (raw) => {
        published.push(raw)
      })

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ connectorId: 'a', status: 'collected', itemsCollected: 2 })
      expect(published).toEqual(items)
    })

    it('skips the fetch and reports failed when the connector is unhealthy, without publishing', async () => {
      const registry = new ConnectorRegistry()
      registry.register(new FakeConnector({ id: 'a', healthy: false, items: [makeRawEvent('a', 'ev-1')] }))
      const manager = new ConnectorManager(registry, { logger: silentLogger() })

      const publish = vi.fn().mockResolvedValue(undefined)
      const results = await manager.collectDue(publish)

      expect(results[0]).toMatchObject({ connectorId: 'a', status: 'failed', attempts: 0, itemsCollected: 0 })
      expect(publish).not.toHaveBeenCalled()
    })

    it('only collects from connectors whose refreshIntervalMs has elapsed, same as runDue', async () => {
      const registry = new ConnectorRegistry()
      registry.register(new FakeConnector({ id: 'frequent', refreshIntervalMs: 1000, items: [] }))
      registry.register(new FakeConnector({ id: 'infrequent', refreshIntervalMs: 10_000, items: [] }))

      const lastRunAt = '2026-01-01T00:00:00.000Z'
      const fakeMetrics: MetricsStore = {
        record: () => {},
        getSnapshot: (connectorId) => ({
          connectorId,
          totalRuns: 1,
          successCount: 1,
          partialCount: 0,
          failureCount: 0,
          lastRunAt,
          averageDurationMs: 0,
        }),
        getAllSnapshots: () => [],
      }
      const manager = new ConnectorManager(registry, { logger: silentLogger(), metrics: fakeMetrics })

      const now = new Date(new Date(lastRunAt).getTime() + 2000)
      const results = await manager.collectDue(async () => {}, now)
      expect(results.map((r) => r.connectorId)).toEqual(['frequent'])
    })

    it('records collection activity into the same metrics store runDue reads from', async () => {
      const registry = new ConnectorRegistry()
      registry.register(new FakeConnector({ id: 'a', items: [makeRawEvent('a', 'ev-1')] }))
      const manager = new ConnectorManager(registry, { logger: silentLogger() })

      await manager.collectDue(async () => {})
      const snapshot = manager.getMetrics().find((s) => s.connectorId === 'a')
      expect(snapshot?.lastRunAt).toBeDefined()

      // Immediately again: the connector shouldn't be due yet (1s default interval).
      const results = await manager.collectDue(async () => {})
      expect(results).toEqual([])
    })
  })
})
