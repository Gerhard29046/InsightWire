import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { NullAiProvider } from './nullProvider'

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

describe('NullAiProvider', () => {
  it('returns empty enrichment rather than fabricated content', async () => {
    const provider = new NullAiProvider()
    const result = await provider.enrich(makeEvent())
    expect(result.summary).toBeUndefined()
    expect(result.keywords).toEqual([])
    expect(result.people).toEqual([])
    expect(result.organizations).toEqual([])
    expect(result.importance).toBeUndefined()
    expect(result.confidence).toBeUndefined()
    expect(result.model).toBe('null')
  })

  it('returns no embedding', async () => {
    const provider = new NullAiProvider()
    expect(await provider.embed('some text')).toBeUndefined()
  })
})
