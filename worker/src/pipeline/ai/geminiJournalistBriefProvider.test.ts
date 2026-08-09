import { describe, expect, it, vi } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { GeminiJournalistBriefProvider } from './geminiJournalistBriefProvider'
import type { JournalistBriefInput } from './journalistBrief'

function makeEvent(): NormalizedEvent {
  return {
    id: 'nws-alerts:ev-1',
    title: 'Severe Thunderstorm Warning',
    description: 'A severe thunderstorm was located near Greensburg.',
    country: 'United States',
    city: 'Westmoreland, PA',
    category: 'natural_disasters',
    source: 'NWS Active Alerts',
    publishedAt: '2026-08-07T20:52:00.000Z',
    updatedAt: '2026-08-07T20:52:00.000Z',
    importance: 'high',
    confidence: 0.95,
    verificationStatus: 'verified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    confirmingSources: [{ connectorId: 'nws-alerts', sourceUrl: 'https://api.weather.gov/alerts/1', reportedAt: '2026-08-07T20:52:00.000Z' }],
  }
}

function makeInput(overrides: Partial<JournalistBriefInput> = {}): JournalistBriefInput {
  const event = makeEvent()
  return {
    event,
    timeline: [],
    confirmingSources: event.confirmingSources,
    ...overrides,
  }
}

function fakeBrief(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'A severe thunderstorm warning was issued for Westmoreland, PA.',
    whatHappened: 'NWS issued a severe thunderstorm warning.',
    whyItMattersKnown: 'Residents in the warned area face 60 mph wind gusts.',
    whyItMattersPotential: '',
    keyFacts: ['60 mph wind gusts reported', 'Radar indicated'],
    entities: { people: [], organizations: ['NWS'] },
    locations: ['Westmoreland, PA'],
    topics: ['severe weather'],
    suggestedHeadline: 'Severe Thunderstorm Warning Issued for Westmoreland County',
    storyAngles: ['What infrastructure is most at risk from wind damage here?'],
    followUpQuestions: ['Has this area seen similar storms recently?'],
    whatToWatch: ['Whether the warning is extended or upgraded'],
    confirmedFacts: ['NWS issued the warning at the stated time'],
    reportedClaims: [],
    unverifiedClaims: [],
    contradictions: [],
    sourceAssessment: 'Single official government source (NWS), a Tier 1 authority for weather alerts.',
    statementNature: 'government_announcement',
    confidence: 'high',
    confidenceReason: 'Official government meteorological source with radar-indicated data.',
    editorialPriority: 'monitor',
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

describe('GeminiJournalistBriefProvider', () => {
  it('sends the expected request shape: system instruction, schema, and only the real collected material', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })

    await provider.generateBrief(makeInput())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('test-key')

    const body = JSON.parse(init.body)
    expect(body.systemInstruction.parts[0].text).toContain('NEVER FABRICATE')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.required).toContain('confirmedFacts')
    expect(body.contents[0].parts[0].text).toContain('Severe Thunderstorm Warning')
    expect(body.contents[0].parts[0].text).toContain('nws-alerts')
  })

  it('respects a configured model override', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', model: 'gemini-2.0-flash', fetchImpl })
    await provider.generateBrief(makeInput())
    const [url] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent')
  })

  it('parses a well-formed response into a JournalistBrief', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })

    const brief = await provider.generateBrief(makeInput())
    expect(brief.summary).toContain('severe thunderstorm')
    expect(brief.entities.organizations).toEqual(['NWS'])
    expect(brief.confidence).toBe('high')
    expect(brief.editorialPriority).toBe('monitor')
    expect(brief.model).toBe('gemini-flash-latest')
    expect(brief.contradictions).toEqual([])
  })

  it('falls back to a conservative default rather than throwing on an out-of-enum confidence/priority/statementNature', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeGeminiResponse(fakeBrief({ confidence: 'extremely certain', editorialPriority: 'huge', statementNature: 'definitely true' })),
    )
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })
    const brief = await provider.generateBrief(makeInput())
    expect(brief.confidence).toBe('low')
    expect(brief.editorialPriority).toBe('monitor')
    expect(brief.statementNature).toBe('not_applicable')
  })

  it('classifies a government self-report correctly when the model returns statementNature', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief({ statementNature: 'government_announcement' })))
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })
    const brief = await provider.generateBrief(makeInput())
    expect(brief.statementNature).toBe('government_announcement')
  })

  it('throws with the response body when the HTTP response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' } as Response)
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.generateBrief(makeInput())).rejects.toThrow(/HTTP 429/)
  })

  it('throws when the response has no text content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [] }) } as Response)
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.generateBrief(makeInput())).rejects.toThrow(/did not include text content/)
  })

  it('throws a clear error when the model returns non-JSON text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
    } as Response)
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.generateBrief(makeInput())).rejects.toThrow(/not valid JSON/)
  })

  it('includes timeline entries in the prompt when present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeBrief()))
    const provider = new GeminiJournalistBriefProvider({ apiKey: 'test-key', fetchImpl })
    await provider.generateBrief(makeInput({ timeline: [{ at: '2026-08-07T21:00:00.000Z', label: 'Re-confirmed by NWS' }] }))
    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.contents[0].parts[0].text).toContain('Re-confirmed by NWS')
  })
})
