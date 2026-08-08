import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { checkForDuplicate, computeContentHash, InMemoryDuplicateIndex } from './dedupe'

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Storm approaches coast',
    description: 'A tropical storm is approaching the coastline.',
    country: 'Global',
    category: 'weather',
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
    ...overrides,
  }
}

describe('computeContentHash', () => {
  it('is deterministic for the same title+description', async () => {
    const a = await computeContentHash(makeEvent())
    const b = await computeContentHash(makeEvent({ id: 'different-id' }))
    expect(a).toBe(b)
  })

  it('is case- and whitespace-insensitive', async () => {
    const a = await computeContentHash(makeEvent({ title: 'Storm approaches coast' }))
    const b = await computeContentHash(makeEvent({ title: '  STORM   approaches   coast  ' }))
    expect(a).toBe(b)
  })

  it('differs when the content actually differs', async () => {
    const a = await computeContentHash(makeEvent())
    const b = await computeContentHash(makeEvent({ title: 'A completely different headline' }))
    expect(a).not.toBe(b)
  })
})

describe('checkForDuplicate', () => {
  it('reports new for content never seen before', async () => {
    const index = new InMemoryDuplicateIndex()
    const outcome = await checkForDuplicate(makeEvent(), index)
    expect(outcome).toEqual({ kind: 'new' })
  })

  it('reports unchanged when the same id is re-fetched with no real changes', async () => {
    const index = new InMemoryDuplicateIndex()
    const event = makeEvent()
    await index.remember({
      id: event.id,
      contentHash: await computeContentHash(event),
      title: event.title,
      description: event.description,
      status: event.status,
      importance: event.importance,
    })

    const outcome = await checkForDuplicate(event, index)
    expect(outcome).toEqual({ kind: 'unchanged', existingId: event.id })
  })

  it('reports updated with a change log when the same id has new content', async () => {
    const index = new InMemoryDuplicateIndex()
    const original = makeEvent({ status: 'developing', importance: 'medium' })
    await index.remember({
      id: original.id,
      contentHash: await computeContentHash(original),
      title: original.title,
      description: original.description,
      status: original.status,
      importance: original.importance,
    })

    const updated = makeEvent({ status: 'resolved', importance: 'critical' })
    const outcome = await checkForDuplicate(updated, index)

    expect(outcome.kind).toBe('updated')
    if (outcome.kind === 'updated') {
      expect(outcome.changes.length).toBeGreaterThanOrEqual(2)
      expect(outcome.changes.some((c) => c.label.includes('Status changed'))).toBe(true)
      expect(outcome.changes.some((c) => c.label.includes('Importance changed'))).toBe(true)
    }
  })

  it('reports duplicate when a different id produces the same content hash', async () => {
    const index = new InMemoryDuplicateIndex()
    const first = makeEvent({ id: 'nasa-news:ev-1' })
    await index.remember({
      id: first.id,
      contentHash: await computeContentHash(first),
      title: first.title,
      description: first.description,
      status: first.status,
      importance: first.importance,
    })

    const sameStoryDifferentSource = makeEvent({ id: 'who-news:ev-99' })
    const outcome = await checkForDuplicate(sameStoryDifferentSource, index)
    expect(outcome).toEqual({ kind: 'duplicate', existingId: 'nasa-news:ev-1' })
  })
})
