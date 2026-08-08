import { describe, expect, it, vi } from 'vitest'
import { GeminiEntityBriefProvider, type EntityBriefInput } from './entityBriefProvider'

function makeInput(overrides: Partial<EntityBriefInput> = {}): EntityBriefInput {
  return {
    entityName: 'South Africa',
    entityType: 'country',
    recentEvents: [{ id: 'sanews:ev-1', title: 'Cabinet approves budget', source: 'SAnews', sourceUrl: 'https://sanews.gov.za/1', publishedAt: '2026-08-08T00:00:00.000Z' }],
    breakingEvents: [],
    upcomingEvents: [],
    relationships: [],
    sources: ['SAnews'],
    ...overrides,
  }
}

function fakeBrief(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'South Africa has seen routine government activity recently.',
    whatChanged: 'Cabinet approved the budget.',
    confirmedFacts: [{ statement: 'Cabinet approved the budget', eventId: 'sanews:ev-1' }],
    aiInterpretation: ['This suggests continued fiscal policy focus.'],
    whatToWatch: [],
    sourcesConfirming: ['SAnews'],
    ...overrides,
  }
}

function fakeGeminiResponse(brief: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(brief) }] } }] }),
  } as Response
}

describe('GeminiEntityBriefProvider', () => {
  it('sends the expected request shape: system instruction, schema, and real supplied evidence only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiEntityBriefProvider({ apiKey: 'test-key', fetchImpl })

    await provider.generateBrief(makeInput())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('test-key')

    const body = JSON.parse(init.body)
    expect(body.systemInstruction.parts[0].text).toContain('NEVER FABRICATE')
    expect(body.systemInstruction.parts[0].text).toContain('CONFIRMED FACTS')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.required).toContain('confirmedFacts')
    expect(body.contents[0].parts[0].text).toContain('Cabinet approves budget')
    expect(body.contents[0].parts[0].text).toContain('sanews:ev-1')
  })

  it('parses a well-formed response into an EntityBrief', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiEntityBriefProvider({ apiKey: 'test-key', fetchImpl })

    const brief = await provider.generateBrief(makeInput())
    expect(brief.summary).toContain('South Africa')
    expect(brief.confirmedFacts).toEqual([{ statement: 'Cabinet approved the budget', eventId: 'sanews:ev-1' }])
    expect(brief.aiInterpretation).toEqual(['This suggests continued fiscal policy focus.'])
    expect(brief.model).toBe('gemini-flash-latest')
  })

  it('drops a confirmedFacts entry missing a real eventId rather than keeping an uncitable claim', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief({ confirmedFacts: [{ statement: 'Something happened' }] })))
    const provider = new GeminiEntityBriefProvider({ apiKey: 'test-key', fetchImpl })
    const brief = await provider.generateBrief(makeInput())
    expect(brief.confirmedFacts).toEqual([])
  })

  it('includes upcoming events and relationships in the prompt when present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiEntityBriefProvider({ apiKey: 'test-key', fetchImpl })
    await provider.generateBrief(
      makeInput({
        upcomingEvents: [{ id: 'sanews:ev-2', title: 'Parliament sitting', source: 'SAnews', sourceUrl: null, publishedAt: '2026-08-15T00:00:00.000Z' }],
        relationships: [{ relatedEntityName: 'Germany', relationshipType: 'mentioned_with', evidenceSnippet: 'talks with Germany', eventId: 'sanews:ev-3' }],
      }),
    )
    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.contents[0].parts[0].text).toContain('Parliament sitting')
    expect(body.contents[0].parts[0].text).toContain('Germany')
  })

  it('throws with the response body when the HTTP response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' } as Response)
    const provider = new GeminiEntityBriefProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.generateBrief(makeInput())).rejects.toThrow(/HTTP 429/)
  })

  it('throws a clear error when the model returns non-JSON text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
    } as Response)
    const provider = new GeminiEntityBriefProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.generateBrief(makeInput())).rejects.toThrow(/not valid JSON/)
  })
})
