import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { InMemoryRepository } from './repository'

function makeEvent(): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Test event',
    description: 'A description.',
    country: 'Global',
    category: 'science',
    source: 'NASA News',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
  }
}

describe('InMemoryRepository', () => {
  it('stores and retrieves a normalized event by id', async () => {
    const repo = new InMemoryRepository()
    const event = makeEvent()
    await repo.upsertNormalizedEvent(event)
    expect(await repo.getNormalizedEvent(event.id)).toEqual(event)
  })

  it('returns undefined for an event never stored', async () => {
    const repo = new InMemoryRepository()
    expect(await repo.getNormalizedEvent('missing')).toBeUndefined()
  })

  it('upsert overwrites the previous value for the same id', async () => {
    const repo = new InMemoryRepository()
    const event = makeEvent()
    await repo.upsertNormalizedEvent(event)
    await repo.upsertNormalizedEvent({ ...event, title: 'Updated title' })
    expect((await repo.getNormalizedEvent(event.id))?.title).toBe('Updated title')
    expect(repo.normalizedEvents.size).toBe(1)
  })

  it('records event updates, ai summaries, and embeddings as append-only lists', async () => {
    const repo = new InMemoryRepository()
    await repo.recordEventUpdate('nasa-news:ev-1', { at: '2026-01-01T00:00:00.000Z', label: 'Status changed' })
    await repo.recordAiSummary({
      normalizedEventId: 'nasa-news:ev-1',
      model: 'claude-sonnet-5',
      summary: 'A summary.',
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    await repo.recordEmbedding({ subjectType: 'normalized_event', subjectId: 'nasa-news:ev-1', model: 'test', embedding: [0.1] })

    expect(repo.eventUpdates).toHaveLength(1)
    expect(repo.aiSummaries).toHaveLength(1)
    expect(repo.embeddings).toHaveLength(1)
  })

  it('records raw events', async () => {
    const repo = new InMemoryRepository()
    await repo.upsertRawEvent({ connectorId: 'nasa-news', externalId: 'ev-1', fetchedAt: '2026-01-01T00:00:00.000Z', payload: {} })
    expect(repo.rawEvents).toHaveLength(1)
  })
})
