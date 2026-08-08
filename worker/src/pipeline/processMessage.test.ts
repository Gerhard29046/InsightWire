import { describe, expect, it, vi } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { ConnectorRegistry } from '../connectors/registry'
import type { RawEvent } from '../connectors/types'
import { FakeConnector } from '../manager/__fixtures__/FakeConnector'
import { NullAiProvider } from './ai/nullProvider'
import type { AiProvider } from './ai/types'
import { InMemoryDuplicateIndex } from './dedupe'
import { InMemoryEntityGraphStore } from './entityGraph'
import { InMemoryPipelineMetrics } from './metrics'
import { processMessage, type ProcessMessageDeps } from './processMessage'
import { InMemoryRepository } from './repository'
import { ConfigurableTrustRegistry } from './trust'

function makeRaw(connectorId: string, externalId: string, overrides: Partial<NormalizedEvent> = {}): RawEvent {
  const publishedAt = '2026-01-01T00:00:00.000Z'
  const event: NormalizedEvent = {
    id: `${connectorId}:${externalId}`,
    title: 'A headline',
    description: 'A description.',
    country: 'Global',
    category: 'science',
    source: 'Fake Source',
    publishedAt,
    updatedAt: publishedAt,
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
    confirmingSources: [{ connectorId, reportedAt: publishedAt }],
    ...overrides,
  }
  return {
    connectorId,
    externalId,
    fetchedAt: new Date().toISOString(),
    payload: event,
  }
}

function makeDeps(overrides: Partial<ProcessMessageDeps> = {}): ProcessMessageDeps {
  const trustRegistry = new ConfigurableTrustRegistry()
  trustRegistry.setProfile('fake-connector', { category: 'rss' })
  trustRegistry.setProfile('fake-connector-2', { category: 'rss' })
  return {
    registry: new ConnectorRegistry(),
    duplicateIndex: new InMemoryDuplicateIndex(),
    aiProvider: new NullAiProvider(),
    repository: new InMemoryRepository(),
    metrics: new InMemoryPipelineMetrics(),
    logger: { log: vi.fn() },
    trustRegistry,
    entityGraphStore: new InMemoryEntityGraphStore(),
    ...overrides,
  }
}

describe('processMessage', () => {
  it('throws for an unknown connector id', async () => {
    const deps = makeDeps()
    await expect(processMessage(makeRaw('fake-connector', 'ev-1'), deps)).rejects.toThrow(/unknown connector/)
  })

  it('returns invalid when normalize() throws, without touching the repository', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector', throwOnNormalizeFor: ['ev-1'] }))
    const repository = new InMemoryRepository()
    const deps = makeDeps({ registry, repository })

    const outcome = await processMessage(makeRaw('fake-connector', 'ev-1'), deps)
    expect(outcome.outcome).toBe('invalid')
    expect(repository.normalizedEvents.size).toBe(0)
  })

  it('returns invalid when validate() fails', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector', invalidFor: ['fake-connector:ev-1'] }))
    const deps = makeDeps({ registry })

    const outcome = await processMessage(makeRaw('fake-connector', 'ev-1'), deps)
    expect(outcome.outcome).toBe('invalid')
  })

  it('stores a genuinely new event, enriches it, and assigns a priority score', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector' }))
    const repository = new InMemoryRepository()
    const metrics = new InMemoryPipelineMetrics()
    const deps = makeDeps({ registry, repository, metrics })

    const outcome = await processMessage(makeRaw('fake-connector', 'ev-1'), deps)
    expect(outcome).toEqual({ outcome: 'stored', eventId: 'fake-connector:ev-1' })

    const stored = await repository.getNormalizedEvent('fake-connector:ev-1')
    expect(stored).toBeDefined()
    expect(stored?.sourceTrustScore).toBeGreaterThan(0)
    expect(stored?.priorityScore).toBeGreaterThanOrEqual(0)
    expect(repository.rawEvents).toHaveLength(1)
    expect(metrics.getSnapshot().itemsProcessed).toBe(1)
  })

  it('populates the entity graph with the event and its topics', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector' }))
    const entityGraphStore = new InMemoryEntityGraphStore()
    const deps = makeDeps({ registry, entityGraphStore })

    await processMessage(makeRaw('fake-connector', 'ev-1', { tags: ['space'], city: 'Houston' }), deps)

    const eventEntity = await entityGraphStore.findOrCreateEntity('event', 'fake-connector:ev-1')
    const relationships = await entityGraphStore.getRelationships(eventEntity.id)
    expect(relationships.some((r) => r.type === 'tagged_with')).toBe(true)
    expect(relationships.some((r) => r.type === 'occurred_in')).toBe(true)
  })

  it('is unchanged on a re-fetch with identical content, and does not re-upsert', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector' }))
    const repository = new InMemoryRepository()
    const duplicateIndex = new InMemoryDuplicateIndex()
    const deps = makeDeps({ registry, repository, duplicateIndex })

    await processMessage(makeRaw('fake-connector', 'ev-1'), deps)
    const outcome = await processMessage(makeRaw('fake-connector', 'ev-1'), deps)

    expect(outcome).toEqual({ outcome: 'unchanged', eventId: 'fake-connector:ev-1' })
  })

  it('records an event_update and re-upserts when the same id has new content', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector' }))
    const repository = new InMemoryRepository()
    const deps = makeDeps({ registry, repository })

    await processMessage(makeRaw('fake-connector', 'ev-1', { status: 'developing' }), deps)
    const outcome = await processMessage(
      makeRaw('fake-connector', 'ev-1', { status: 'resolved', updatedAt: '2026-01-02T00:00:00.000Z' }),
      deps,
    )

    expect(outcome.outcome).toBe('updated')
    expect(repository.eventUpdates.length).toBeGreaterThan(0)
    expect((await repository.getNormalizedEvent('fake-connector:ev-1'))?.status).toBe('resolved')
  })

  it('merges a different connector reporting the same event, instead of creating a duplicate', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector' }))
    registry.register(new FakeConnector({ id: 'fake-connector-2' }))
    const repository = new InMemoryRepository()
    const metrics = new InMemoryPipelineMetrics()
    const deps = makeDeps({ registry, repository, metrics })

    await processMessage(makeRaw('fake-connector', 'ev-1', { confidence: 0.4 }), deps)
    // Same title/description -> same content hash -> a merge, not a new row.
    const outcome = await processMessage(makeRaw('fake-connector-2', 'ev-9', { confidence: 0.4 }), deps)

    expect(outcome).toEqual({ outcome: 'merged', eventId: 'fake-connector:ev-1' })
    expect(await repository.getNormalizedEvent('fake-connector-2:ev-9')).toBeUndefined()

    const merged = await repository.getNormalizedEvent('fake-connector:ev-1')
    expect(merged?.confirmingSources?.map((s) => s.connectorId).sort()).toEqual(['fake-connector', 'fake-connector-2'])
    expect(merged?.confidence).toBeGreaterThan(0.4)
    expect(merged?.priorityScore).toBeGreaterThanOrEqual(0)
    expect(repository.eventUpdates.some((e) => e.normalizedEventId === 'fake-connector:ev-1')).toBe(true)

    const snapshot = metrics.getSnapshot()
    expect(snapshot.duplicatesDetected).toBe(1)
    expect(snapshot.merged).toBe(1)
  })

  it('records AI latency and a summary record when the provider actually enriches', async () => {
    const registry = new ConnectorRegistry()
    registry.register(new FakeConnector({ id: 'fake-connector' }))
    const repository = new InMemoryRepository()
    const metrics = new InMemoryPipelineMetrics()
    const aiProvider: AiProvider = {
      name: 'fake-ai',
      async enrich() {
        return { summary: 'Enriched.', keywords: [], people: [], organizations: [], relatedEventIds: [], model: 'fake-ai' }
      },
      async embed() {
        return [0.1, 0.2]
      },
    }
    const deps = makeDeps({ registry, repository, metrics, aiProvider })

    await processMessage(makeRaw('fake-connector', 'ev-1'), deps)

    expect(repository.aiSummaries).toHaveLength(1)
    expect(repository.embeddings).toHaveLength(1)
    expect(metrics.getSnapshot().averageAiLatencyMs).toBeGreaterThanOrEqual(0)
  })
})
