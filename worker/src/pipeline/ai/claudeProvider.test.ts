import { describe, expect, it, vi } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { ClaudeAiProvider } from './claudeProvider'

function makeEvent(): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Storm approaches coast',
    description: 'A tropical storm is approaching the coastline.',
    country: 'Global',
    category: 'natural_disasters',
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

function fakeAnthropicResponse(input: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'tool_use', name: 'submit_enrichment', input }],
    }),
  } as Response
}

describe('ClaudeAiProvider', () => {
  it('sends the expected request shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeAnthropicResponse({ summary: 'x', keywords: [], importance: 'medium', confidence: 0.5 }),
    )
    const provider = new ClaudeAiProvider({ apiKey: 'test-key', fetchImpl })

    await provider.enrich(makeEvent())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('test-key')
    expect(init.headers['anthropic-version']).toBeDefined()
    const body = JSON.parse(init.body)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_enrichment' })
    expect(body.messages[0].content).toContain('Storm approaches coast')
  })

  it('parses a well-formed tool_use response into AiEnrichmentResult', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeAnthropicResponse({
        summary: 'A storm is approaching.',
        keywords: ['storm', 'coast'],
        people: ['Jane Forecaster'],
        organizations: ['NOAA'],
        suggestedCategory: 'weather',
        importance: 'high',
        confidence: 0.82,
        language: 'en',
      }),
    )
    const provider = new ClaudeAiProvider({ apiKey: 'test-key', fetchImpl })

    const result = await provider.enrich(makeEvent())
    expect(result.summary).toBe('A storm is approaching.')
    expect(result.keywords).toEqual(['storm', 'coast'])
    expect(result.importance).toBe('high')
    expect(result.confidence).toBe(0.82)
    expect(result.model).toBe('claude-sonnet-5')
  })

  it('ignores an out-of-enum suggestedCategory/importance rather than throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeAnthropicResponse({ summary: 'x', keywords: [], importance: 'nonsense', suggestedCategory: 'nonsense', confidence: 0.5 }),
    )
    const provider = new ClaudeAiProvider({ apiKey: 'test-key', fetchImpl })
    const result = await provider.enrich(makeEvent())
    expect(result.importance).toBeUndefined()
    expect(result.suggestedCategory).toBeUndefined()
  })

  it('throws when the HTTP response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const provider = new ClaudeAiProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.enrich(makeEvent())).rejects.toThrow(/HTTP 500/)
  })

  it('throws when the response has no tool_use block', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'oops, plain text' }] }),
    } as Response)
    const provider = new ClaudeAiProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.enrich(makeEvent())).rejects.toThrow(/tool_use/)
  })

  it('returns no embedding (no first-party Anthropic embeddings endpoint)', async () => {
    const provider = new ClaudeAiProvider({ apiKey: 'test-key' })
    expect(await provider.embed('text')).toBeUndefined()
  })
})
