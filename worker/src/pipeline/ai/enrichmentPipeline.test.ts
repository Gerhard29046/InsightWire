import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { enrichEvent, selectAiProvider } from './enrichmentPipeline'
import { NullAiProvider } from './nullProvider'
import { ClaudeAiProvider } from './claudeProvider'
import type { AiProvider } from './types'

function makeEvent(): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Original title',
    description: 'Original description.',
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

describe('selectAiProvider', () => {
  it('selects NullAiProvider when no key is configured', () => {
    expect(selectAiProvider({})).toBeInstanceOf(NullAiProvider)
  })

  it('selects ClaudeAiProvider when ANTHROPIC_API_KEY is present', () => {
    expect(selectAiProvider({ ANTHROPIC_API_KEY: 'sk-test' })).toBeInstanceOf(ClaudeAiProvider)
  })
})

describe('enrichEvent', () => {
  it('with NullAiProvider, leaves the event content-identical (no fabrication)', async () => {
    const event = makeEvent()
    const outcome = await enrichEvent(event, new NullAiProvider())
    expect(outcome.event).toEqual(event)
    expect(outcome.summaryRecord).toBeUndefined()
    expect(outcome.embedding).toBeUndefined()
  })

  it('never touches raw fields even when the provider returns enrichment', async () => {
    const event = makeEvent()
    const fakeProvider: AiProvider = {
      name: 'fake',
      async enrich() {
        return {
          summary: 'AI summary.',
          keywords: ['a', 'b'],
          people: ['Alice'],
          organizations: ['Acme'],
          importance: 'high',
          confidence: 0.9,
          relatedEventIds: [],
          model: 'fake-model',
        }
      },
      async embed() {
        return [0.1, 0.2, 0.3]
      },
    }

    const outcome = await enrichEvent(event, fakeProvider)

    expect(outcome.event.title).toBe(event.title)
    expect(outcome.event.description).toBe(event.description)
    expect(outcome.event.source).toBe(event.source)
    expect(outcome.event.summary).toBe('AI summary.')
    expect(outcome.event.keywords).toEqual(['a', 'b'])
    expect(outcome.event.people).toEqual(['Alice'])
    expect(outcome.event.organizations).toEqual(['Acme'])
    expect(outcome.event.importance).toBe('high')
    expect(outcome.event.confidence).toBe(0.9)

    expect(outcome.summaryRecord).toMatchObject({
      normalizedEventId: event.id,
      model: 'fake-model',
      summary: 'AI summary.',
    })
    expect(outcome.embedding).toEqual([0.1, 0.2, 0.3])
  })

  it('keeps existing keywords/people/organizations when the provider returns none', async () => {
    const event = makeEvent()
    event.keywords = ['existing']
    const fakeProvider: AiProvider = {
      name: 'fake',
      async enrich() {
        return { keywords: [], people: [], organizations: [], relatedEventIds: [], model: 'fake' }
      },
      async embed() {
        return undefined
      },
    }
    const outcome = await enrichEvent(event, fakeProvider)
    expect(outcome.event.keywords).toEqual(['existing'])
  })
})
