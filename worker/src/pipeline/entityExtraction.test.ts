import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { evidenceAppearsInSource, extractEntitiesForEvent, hasCurrentExtraction, runEntityExtractionBatch, selectEventsNeedingExtraction } from './entityExtraction'
import { InMemoryEntityGraphStore } from './entityGraph'
import type { EntityExtractionProvider, EntityExtractionResult } from './ai/entityExtractionProvider'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sanews:ev-1',
    title: 'President Ramaphosa meets German Chancellor in Berlin',
    description: 'President Cyril Ramaphosa held talks with the German Chancellor in Berlin on Thursday.',
    country: 'South Africa',
    category: 'government',
    source: 'SAnews',
    publishedAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.6,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    ...overrides,
  }
}

function fakeProvider(result: EntityExtractionResult | (() => Promise<EntityExtractionResult>)): EntityExtractionProvider {
  return {
    name: 'fake',
    extractEntities: async () => (typeof result === 'function' ? result() : result),
  }
}

interface InsertCall {
  table: string
  payload: unknown
}

function makeSupabaseMock() {
  const inserts: InsertCall[] = []
  const chain: Record<string, unknown> = {
    insert: vi.fn((payload: unknown) => {
      inserts.push({ table: currentTable, payload })
      return Promise.resolve({ data: null, error: null })
    }),
    upsert: vi.fn((payload: unknown) => {
      inserts.push({ table: currentTable, payload })
      return Promise.resolve({ data: null, error: null })
    }),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }
  let currentTable = ''
  const client = {
    from: vi.fn((table: string) => {
      currentTable = table
      return chain
    }),
  }
  return { client, inserts, chain }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('evidenceAppearsInSource', () => {
  it('accepts a verbatim (case-insensitive) substring match', () => {
    expect(evidenceAppearsInSource('President Cyril Ramaphosa held talks', 'president cyril ramaphosa')).toBe(true)
  })

  it('rejects a quote that does not appear in the source text', () => {
    expect(evidenceAppearsInSource('President Cyril Ramaphosa held talks', 'President Ramaphosa announced sanctions')).toBe(false)
  })

  it('rejects an empty/whitespace-only snippet', () => {
    expect(evidenceAppearsInSource('some real text', '   ')).toBe(false)
  })
})

describe('extractEntitiesForEvent', () => {
  it('accepts a high-confidence entity with a real evidence snippet, and links it in the entity graph', async () => {
    const { client, inserts } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()
    const event = makeEvent()

    const provider = fakeProvider({
      entities: [{ type: 'person', name: 'Ramaphosa', confidence: 0.9, evidenceSnippet: 'President Cyril Ramaphosa held talks' }],
      relationships: [],
      model: 'gemini-flash-latest',
    })

    const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
    expect(result).toEqual({ acceptedEntities: 1, rejectedEntities: 0, acceptedRelationships: 0, rejectedRelationships: 0 })

    const extractionInsert = inserts.find((i) => i.table === 'entity_extractions')
    expect(extractionInsert?.payload).toMatchObject({ extracted_name: 'Ramaphosa', accepted: true, entity_type: 'person' })

    const entity = await entityGraphStore.findOrCreateEntity('person', 'Ramaphosa')
    const relationships = await entityGraphStore.getRelationships(entity.id)
    expect(relationships.some((r) => r.type === 'mentions')).toBe(true)
  })

  it('rejects a low-confidence entity — logs it to the ledger but never creates a real entity or link', async () => {
    const { client, inserts } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()
    const event = makeEvent()

    const provider = fakeProvider({
      entities: [{ type: 'person', name: 'Ramaphosa', confidence: 0.3, evidenceSnippet: 'President Cyril Ramaphosa held talks' }],
      relationships: [],
      model: 'gemini-flash-latest',
    })

    const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
    expect(result.acceptedEntities).toBe(0)
    expect(result.rejectedEntities).toBe(1)

    const extractionInsert = inserts.find((i) => i.table === 'entity_extractions')
    expect(extractionInsert?.payload).toMatchObject({ accepted: false })

    // findOrCreateEntity here creates a brand-new entity (it was never created during the rejected extraction) — a fresh entity with zero relationships proves no event->entity "mentions" link was ever made for the rejected candidate.
    const entity = await entityGraphStore.findOrCreateEntity('person', 'Ramaphosa')
    const relationships = await entityGraphStore.getRelationships(entity.id)
    expect(relationships).toHaveLength(0)
  })

  it('rejects a high-confidence entity whose evidenceSnippet does not actually appear in the source text (fabricated quote)', async () => {
    const { client, inserts } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()
    const event = makeEvent()

    const provider = fakeProvider({
      entities: [{ type: 'person', name: 'Someone Else', confidence: 0.95, evidenceSnippet: 'This exact phrase is not in the source' }],
      relationships: [],
      model: 'gemini-flash-latest',
    })

    const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
    expect(result.acceptedEntities).toBe(0)
    expect(result.rejectedEntities).toBe(1)
    expect(inserts.find((i) => i.table === 'entity_extractions')?.payload).toMatchObject({ accepted: false })
  })

  it('a provider failure is caught and produces zero side effects — never propagates to the caller', async () => {
    const { client, inserts } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()
    const event = makeEvent()
    const provider = fakeProvider(() => Promise.reject(new Error('Gemini is down')))

    const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
    expect(result).toEqual({ acceptedEntities: 0, rejectedEntities: 0, acceptedRelationships: 0, rejectedRelationships: 0 })
    expect(inserts).toHaveLength(0)
  })

  it('accepts a relationship only when both subject and object were themselves accepted entities in the same call', async () => {
    const { client, inserts } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()
    const event = makeEvent()

    const provider = fakeProvider({
      entities: [
        { type: 'person', name: 'Ramaphosa', confidence: 0.9, evidenceSnippet: 'President Cyril Ramaphosa held talks' },
        { type: 'country', name: 'Germany', confidence: 0.85, evidenceSnippet: 'German Chancellor in Berlin' },
      ],
      relationships: [
        {
          subjectName: 'Ramaphosa',
          relationshipType: 'mentioned_with',
          objectName: 'Germany',
          confidence: 0.8,
          evidenceSnippet: 'held talks with the German Chancellor in Berlin',
        },
      ],
      model: 'gemini-flash-latest',
    })

    const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
    expect(result.acceptedRelationships).toBe(1)
    expect(inserts.find((i) => i.table === 'entity_relationships')?.payload).toMatchObject({ relationship_type: 'mentioned_with' })
  })

  it('rejects a relationship whose subject was itself rejected (low confidence)', async () => {
    const { client, inserts } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()
    const event = makeEvent()

    const provider = fakeProvider({
      entities: [
        { type: 'person', name: 'Ramaphosa', confidence: 0.2, evidenceSnippet: 'President Cyril Ramaphosa held talks' },
        { type: 'country', name: 'Germany', confidence: 0.85, evidenceSnippet: 'German Chancellor in Berlin' },
      ],
      relationships: [
        {
          subjectName: 'Ramaphosa',
          relationshipType: 'mentioned_with',
          objectName: 'Germany',
          confidence: 0.9,
          evidenceSnippet: 'held talks with the German Chancellor in Berlin',
        },
      ],
      model: 'gemini-flash-latest',
    })

    const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
    expect(result.acceptedRelationships).toBe(0)
    expect(result.rejectedRelationships).toBe(1)
    expect(inserts.find((i) => i.table === 'entity_relationships')).toBeUndefined()
  })
})

describe('hasCurrentExtraction', () => {
  it('returns true when a matching row exists', async () => {
    const { client, chain } = makeSupabaseMock()
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'x' }, error: null }))
    vi.mocked(createClient).mockReturnValue(client as never)

    expect(await hasCurrentExtraction(config, 'sanews:ev-1', 'abc123')).toBe(true)
  })

  it('returns false when no matching row exists', async () => {
    const { client, chain } = makeSupabaseMock()
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    vi.mocked(createClient).mockReturnValue(client as never)

    expect(await hasCurrentExtraction(config, 'sanews:ev-1', 'abc123')).toBe(false)
  })

  it('throws on a real query error rather than treating it as "not extracted"', async () => {
    const { client, chain } = makeSupabaseMock()
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: 'network error' } }))
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(hasCurrentExtraction(config, 'sanews:ev-1', 'abc123')).rejects.toThrow(/network error/)
  })
})

function makeEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sanews:ev-1',
    title: 'A headline',
    description: 'A description.',
    summary: null,
    country: 'South Africa',
    city: null,
    lat: null,
    lng: null,
    category: 'government',
    source: 'SAnews',
    source_url: null,
    start_time: null,
    end_time: null,
    published_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.6,
    verification_status: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    source_trust_score: null,
    priority_score: null,
    ...overrides,
  }
}

describe('selectEventsNeedingExtraction', () => {
  it('skips events that already have a current extraction and returns the rest, capped at batchSize', async () => {
    const rows = [makeEventRow({ id: 'sanews:ev-1' }), makeEventRow({ id: 'sanews:ev-2' }), makeEventRow({ id: 'sanews:ev-3' })]
    let extractionCheckCount = 0
    const tables: Record<string, unknown> = {
      normalized_events: {
        select: vi.fn(function (this: unknown) {
          return this
        }),
        neq: vi.fn(function (this: unknown) {
          return this
        }),
        order: vi.fn(function (this: unknown) {
          return this
        }),
        limit: vi.fn(function (this: unknown) {
          return this
        }),
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(onFulfilled),
      },
      entity_extractions: {
        select: vi.fn(function (this: unknown) {
          return this
        }),
        eq: vi.fn(function (this: unknown) {
          return this
        }),
        limit: vi.fn(function (this: unknown) {
          return this
        }),
        maybeSingle: vi.fn(() => {
          extractionCheckCount += 1
          // ev-1 already has a current extraction; ev-2 and ev-3 don't.
          const alreadyExtracted = extractionCheckCount === 1
          return Promise.resolve({ data: alreadyExtracted ? { id: 'x' } : null, error: null })
        }),
      },
    }
    const client = { from: vi.fn((table: string) => tables[table]) }
    vi.mocked(createClient).mockReturnValue(client as never)

    const selected = await selectEventsNeedingExtraction(config, 2)
    expect(selected.map((e) => e.id)).toEqual(['sanews:ev-2', 'sanews:ev-3'])
  })

  it('throws on a real query error rather than returning an empty/partial batch silently', async () => {
    const tables: Record<string, unknown> = {
      normalized_events: {
        select: vi.fn(function (this: unknown) {
          return this
        }),
        neq: vi.fn(function (this: unknown) {
          return this
        }),
        order: vi.fn(function (this: unknown) {
          return this
        }),
        limit: vi.fn(function (this: unknown) {
          return this
        }),
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'network error' } }).then(onFulfilled),
      },
    }
    const client = { from: vi.fn((table: string) => tables[table]) }
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(selectEventsNeedingExtraction(config, 2)).rejects.toThrow(/network error/)
  })
})

describe('runEntityExtractionBatch', () => {
  it('is a complete no-op when GEMINI_API_KEY is absent — no Supabase calls at all', async () => {
    const client = { from: vi.fn() }
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()

    const summary = await runEntityExtractionBatch(config, undefined, entityGraphStore)
    expect(summary).toEqual({ eventsProcessed: 0, acceptedEntities: 0, rejectedEntities: 0, acceptedRelationships: 0, rejectedRelationships: 0 })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('returns an empty summary (not a throw) when the selection query itself fails', async () => {
    const tables: Record<string, unknown> = {
      normalized_events: {
        select: vi.fn(function (this: unknown) {
          return this
        }),
        neq: vi.fn(function (this: unknown) {
          return this
        }),
        order: vi.fn(function (this: unknown) {
          return this
        }),
        limit: vi.fn(function (this: unknown) {
          return this
        }),
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'network error' } }).then(onFulfilled),
      },
    }
    const client = { from: vi.fn((table: string) => tables[table]) }
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()

    const summary = await runEntityExtractionBatch(config, 'fake-gemini-key', entityGraphStore)
    expect(summary.eventsProcessed).toBe(0)
  })

  it('runs the real provider against selected events and aggregates results, isolating one event\'s failure from the rest', async () => {
    const eventRows = [makeEventRow({ id: 'sanews:ev-1' }), makeEventRow({ id: 'sanews:ev-2' })]
    const tables: Record<string, unknown> = {
      normalized_events: {
        select: vi.fn(function (this: unknown) {
          return this
        }),
        neq: vi.fn(function (this: unknown) {
          return this
        }),
        order: vi.fn(function (this: unknown) {
          return this
        }),
        limit: vi.fn(function (this: unknown) {
          return this
        }),
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: eventRows, error: null }).then(onFulfilled),
      },
      entity_extractions: {
        select: vi.fn(function (this: unknown) {
          return this
        }),
        eq: vi.fn(function (this: unknown) {
          return this
        }),
        limit: vi.fn(function (this: unknown) {
          return this
        }),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })), // neither event has a current extraction yet
        insert: vi.fn((payload: { event_id: string }) => {
          // ev-1's ledger write fails (simulates a real infra error) — must not stop ev-2 from being processed.
          if (payload.event_id === 'sanews:ev-1') return Promise.resolve({ data: null, error: { message: 'insert failed' } })
          return Promise.resolve({ data: null, error: null })
        }),
      },
    }
    const client = { from: vi.fn((table: string) => tables[table]) }
    vi.mocked(createClient).mockReturnValue(client as never)
    const entityGraphStore = new InMemoryEntityGraphStore()

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    entities: [{ type: 'person', name: 'Someone', confidence: 0.9, evidenceSnippet: 'A description.' }],
                    relationships: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchImpl)

    const summary = await runEntityExtractionBatch(config, 'fake-gemini-key', entityGraphStore)
    // ev-1 throws on the entity_extractions insert (caught by runEntityExtractionBatch's own per-event try/catch);
    // ev-2 succeeds — the batch as a whole reflects only the one real success, not a total failure.
    expect(summary.eventsProcessed).toBe(1)
    expect(summary.acceptedEntities).toBe(1)

    vi.unstubAllGlobals()
  })
})
