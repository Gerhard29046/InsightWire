import { describe, expect, it, vi } from 'vitest'
import { GeminiEntityExtractionProvider, type EntityExtractionInput } from './entityExtractionProvider'

function makeInput(overrides: Partial<EntityExtractionInput['event']> = {}): EntityExtractionInput {
  return {
    event: {
      title: 'President Ramaphosa meets German Chancellor in Berlin',
      description: 'President Cyril Ramaphosa held talks with German Chancellor in Berlin on Thursday.',
      source: 'SAnews',
      country: 'South Africa',
      ...overrides,
    },
  }
}

function fakeExtraction(overrides: Record<string, unknown> = {}) {
  return {
    entities: [
      { type: 'person', name: 'Ramaphosa', confidence: 0.9, evidenceSnippet: 'President Cyril Ramaphosa held talks' },
      { type: 'country', name: 'Germany', confidence: 0.8, evidenceSnippet: 'German Chancellor in Berlin' },
    ],
    relationships: [
      {
        subjectName: 'Ramaphosa',
        relationshipType: 'mentioned_with',
        objectName: 'Germany',
        confidence: 0.7,
        evidenceSnippet: 'held talks with German Chancellor in Berlin',
      },
    ],
    ...overrides,
  }
}

function fakeGeminiResponse(result: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }),
  } as Response
}

describe('GeminiEntityExtractionProvider', () => {
  it('sends the expected request shape: system instruction, schema, and only the real event text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeExtraction()))
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })

    await provider.extractEntities(makeInput())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('test-key')

    const body = JSON.parse(init.body)
    expect(body.systemInstruction.parts[0].text).toContain('VERBATIM')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.required).toEqual(['entities', 'relationships'])
    expect(body.contents[0].parts[0].text).toContain('President Ramaphosa meets German Chancellor')
    expect(body.contents[0].parts[0].text).toContain('SAnews')
    // Only title/source/description are sent — event.country (a structural field the deterministic pass already handles) is deliberately not part of the prompt.
    expect(body.contents[0].parts[0].text).not.toContain('South Africa')
  })

  it('parses a well-formed response into entities/relationships', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeExtraction()))
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })

    const result = await provider.extractEntities(makeInput())
    expect(result.entities).toHaveLength(2)
    expect(result.entities[0]).toEqual({ type: 'person', name: 'Ramaphosa', confidence: 0.9, evidenceSnippet: 'President Cyril Ramaphosa held talks' })
    expect(result.relationships).toHaveLength(1)
    expect(result.relationships[0].relationshipType).toBe('mentioned_with')
    expect(result.model).toBe('gemini-flash-latest')
  })

  it('drops an entity with an out-of-enum type rather than throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeGeminiResponse(fakeExtraction({ entities: [{ type: 'made_up_type', name: 'X', confidence: 0.9, evidenceSnippet: 'X' }] })),
    )
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    const result = await provider.extractEntities(makeInput())
    expect(result.entities).toEqual([])
  })

  it('drops an entity missing a real evidenceSnippet rather than keeping it unsupported', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeGeminiResponse(fakeExtraction({ entities: [{ type: 'person', name: 'Someone', confidence: 0.9, evidenceSnippet: '' }] })),
    )
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    const result = await provider.extractEntities(makeInput())
    expect(result.entities).toEqual([])
  })

  it('drops a relationship with an out-of-enum relationshipType rather than throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeGeminiResponse(
        fakeExtraction({ relationships: [{ subjectName: 'A', relationshipType: 'best_friends_forever', objectName: 'B', confidence: 0.9, evidenceSnippet: 'x' }] }),
      ),
    )
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    const result = await provider.extractEntities(makeInput())
    expect(result.relationships).toEqual([])
  })

  it('clamps an out-of-range confidence into [0, 1] rather than trusting the model verbatim', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeGeminiResponse(fakeExtraction({ entities: [{ type: 'person', name: 'X', confidence: 5, evidenceSnippet: 'X' }] })),
    )
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    const result = await provider.extractEntities(makeInput())
    expect(result.entities[0].confidence).toBe(1)
  })

  it('returns empty arrays rather than throwing when the model finds nothing extractable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse({ entities: [], relationships: [] }))
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    const result = await provider.extractEntities(makeInput())
    expect(result).toEqual({ entities: [], relationships: [], model: 'gemini-flash-latest' })
  })

  it('respects a configured model override', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeGeminiResponse(fakeExtraction()))
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', model: 'gemini-2.0-flash', fetchImpl })
    await provider.extractEntities(makeInput())
    const [url] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent')
  })

  it('throws with the response body when the HTTP response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' } as Response)
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.extractEntities(makeInput())).rejects.toThrow(/HTTP 429/)
  })

  it('throws when the response has no text content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [] }) } as Response)
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.extractEntities(makeInput())).rejects.toThrow(/did not include text content/)
  })

  it('throws a clear error when the model returns non-JSON text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
    } as Response)
    const provider = new GeminiEntityExtractionProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.extractEntities(makeInput())).rejects.toThrow(/not valid JSON/)
  })
})
