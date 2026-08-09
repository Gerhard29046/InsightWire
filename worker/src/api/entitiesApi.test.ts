import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getEntityDetail, listEntities, parseListEntitiesQuery } from './entitiesApi'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

interface QueryResult {
  data: unknown
  error: { message: string; code?: string } | null
  count?: number | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    or: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

/** Routes each `.from(table)` call to its own queued result, in call order — mirrors the multi-query shape getEntityDetail actually performs (entity row, mentions, recent events, connected-entity links, event dates). */
function makeFakeClient(resultsByTable: Record<string, QueryResult[]>) {
  const callIndex: Record<string, number> = {}
  const chains: Record<string, ReturnType<typeof makeChain>[]> = {}
  const client = {
    from: vi.fn((table: string) => {
      const i = callIndex[table] ?? 0
      callIndex[table] = i + 1
      const results = resultsByTable[table] ?? []
      const chain = makeChain(results[i] ?? results[results.length - 1] ?? { data: [], error: null })
      chains[table] = [...(chains[table] ?? []), chain]
      return chain
    }),
  }
  return { client, chains }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseListEntitiesQuery', () => {
  it('parses search/type/country/cursor/pageSize', () => {
    const params = new URLSearchParams()
    params.set('q', 'Ramaphosa')
    params.append('type', 'person')
    params.append('country', 'South Africa')
    params.set('cursor', '25')
    params.set('pageSize', '10')

    const query = parseListEntitiesQuery(params)
    expect(query).toEqual({ search: 'Ramaphosa', types: ['person'], countries: ['South Africa'], cursor: '25', pageSize: 10, sort: 'recent', activeSince: undefined })
  })

  it('defaults pageSize to 25, sort to "recent", and leaves types/countries empty when absent', () => {
    const query = parseListEntitiesQuery(new URLSearchParams())
    expect(query.pageSize).toBe(25)
    expect(query.types).toEqual([])
    expect(query.countries).toEqual([])
    expect(query.sort).toBe('recent')
  })

  it('parses an explicit sort and activeSince', () => {
    const params = new URLSearchParams()
    params.set('sort', 'active')
    params.set('activeSince', '2026-08-01T00:00:00.000Z')
    const query = parseListEntitiesQuery(params)
    expect(query.sort).toBe('active')
    expect(query.activeSince).toBe('2026-08-01T00:00:00.000Z')
  })

  it('falls back to "recent" for an invalid sort value rather than throwing', () => {
    const params = new URLSearchParams()
    params.set('sort', 'not-a-real-sort')
    expect(parseListEntitiesQuery(params).sort).toBe('recent')
  })
})

function makeEntityRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'e-1',
    entity_type: 'country',
    name: 'South Africa',
    country: null,
    first_seen_at: '2026-08-01T00:00:00.000Z',
    last_seen_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('listEntities', () => {
  it('excludes "topic" entities by default', async () => {
    const { client, chains } = makeFakeClient({ entities: [{ data: [], error: null, count: 0 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, {})
    expect(chains.entities[0].neq).toHaveBeenCalledWith('entity_type', 'topic')
  })

  it('does not exclude topic when explicitly requested via types', async () => {
    const { client, chains } = makeFakeClient({ entities: [{ data: [], error: null, count: 0 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, { types: ['topic'] })
    expect(chains.entities[0].in).toHaveBeenCalledWith('entity_type', ['topic'])
    for (const call of (chains.entities[0].neq as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call).not.toEqual(['entity_type', 'topic'])
    }
  })

  it('maps real rows and computes nextCursor/totalCount from the exact PostgREST count', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeEntityRow({ id: `e-${i}` }))
    const { client } = makeFakeClient({ entities: [{ data: rows, error: null, count: 411 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEntities(config, { pageSize: 25 })
    expect(result.entities).toHaveLength(25)
    expect(result.nextCursor).toBe('25')
    expect(result.totalCount).toBe(411)
  })

  it('applies search as an ilike filter on name', async () => {
    const { client, chains } = makeFakeClient({ entities: [{ data: [], error: null, count: 0 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, { search: 'Ramaphosa' })
    expect(chains.entities[0].ilike).toHaveBeenCalledWith('name', '%Ramaphosa%')
  })

  it('throws on a Supabase error rather than returning a partial result', async () => {
    const { client } = makeFakeClient({ entities: [{ data: null, error: { message: 'network error' } }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(listEntities(config, {})).rejects.toThrow(/network error/)
  })

  it('defaults to sorting by last_seen_at desc ("recent")', async () => {
    const { client, chains } = makeFakeClient({ entities: [{ data: [], error: null, count: 0 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, {})
    expect(chains.entities[0].order).toHaveBeenCalledWith('last_seen_at', { ascending: false })
  })

  it('sorts by name ascending when sort="name"', async () => {
    const { client, chains } = makeFakeClient({ entities: [{ data: [], error: null, count: 0 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, { sort: 'name' })
    expect(chains.entities[0].order).toHaveBeenCalledWith('name', { ascending: true })
  })

  it('applies activeSince as a real gte filter on last_seen_at', async () => {
    const { client, chains } = makeFakeClient({ entities: [{ data: [], error: null, count: 0 }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, { activeSince: '2026-08-01T00:00:00.000Z' })
    expect(chains.entities[0].gte).toHaveBeenCalledWith('last_seen_at', '2026-08-01T00:00:00.000Z')
  })

  it('computes a real mentionCount per entity from entity_event_links via a real exact count per entity, never fabricated', async () => {
    const rows = [makeEntityRow({ id: 'e-1', name: 'South Africa' }), makeEntityRow({ id: 'e-2', name: 'Zimbabwe' })]
    const { client } = makeFakeClient({
      entities: [{ data: rows, error: null, count: 2 }],
      // One real exact-count query per entity, in entity order (see fetchMentionCounts's own doc comment for why this replaced a single batched row-dump query).
      entity_event_links: [
        { data: null, error: null, count: 3 }, // e-1
        { data: null, error: null, count: 1 }, // e-2
      ],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEntities(config, {})
    expect(result.entities.find((e) => e.id === 'e-1')?.mentionCount).toBe(3)
    expect(result.entities.find((e) => e.id === 'e-2')?.mentionCount).toBe(1)
  })

  it('returns mentionCount 0 (not undefined/fabricated) for an entity with zero real mentions', async () => {
    const rows = [makeEntityRow({ id: 'e-1' })]
    const { client } = makeFakeClient({
      entities: [{ data: rows, error: null, count: 1 }],
      entity_event_links: [{ data: null, error: null, count: 0 }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEntities(config, {})
    expect(result.entities[0].mentionCount).toBe(0)
  })

  it('computes each entity\'s real exact count independently, so one high-volume entity can never distort another\'s number (the real bug this replaced)', async () => {
    // Found live: a single batched "fetch rows, count in JS" query silently
    // undercounted a high-volume entity once the combined batch exceeded
    // PostgREST's own row-return ceiling. Real per-entity count queries have
    // no such shared ceiling — a very large count for one entity must not
    // affect another's.
    const rows = [makeEntityRow({ id: 'e-huge', name: 'United States' }), makeEntityRow({ id: 'e-tiny', name: 'Small Town' })]
    const { client } = makeFakeClient({
      entities: [{ data: rows, error: null, count: 2 }],
      entity_event_links: [
        { data: null, error: null, count: 493 }, // e-huge
        { data: null, error: null, count: 1 }, // e-tiny
      ],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEntities(config, {})
    expect(result.entities.find((e) => e.id === 'e-huge')?.mentionCount).toBe(493)
    expect(result.entities.find((e) => e.id === 'e-tiny')?.mentionCount).toBe(1)
  })

  it('excludes weather when computing mentionCount — an entity must not stay inflated by already-stored weather links', async () => {
    const rows = [makeEntityRow({ id: 'e-1', name: 'United States' })]
    const { client, chains } = makeFakeClient({
      entities: [{ data: rows, error: null, count: 1 }],
      entity_event_links: [{ data: null, error: null, count: 5 }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEntities(config, {})
    expect(chains.entity_event_links[0].neq).toHaveBeenCalledWith('normalized_events.category', 'weather')
  })

  it('sort="active" ranks a bounded candidate pool by real mentionCount desc, not last_seen_at', async () => {
    const rows = [
      makeEntityRow({ id: 'e-low', name: 'Low Activity' }),
      makeEntityRow({ id: 'e-high', name: 'High Activity' }),
    ]
    const { client, chains } = makeFakeClient({
      entities: [{ data: rows, error: null, count: 2 }],
      entity_event_links: [
        { data: null, error: null, count: 1 }, // e-low
        { data: null, error: null, count: 3 }, // e-high
      ],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEntities(config, { sort: 'active', pageSize: 10 })
    expect(result.entities.map((e) => e.id)).toEqual(['e-high', 'e-low'])
    expect(result.entities[0].mentionCount).toBe(3)
    // The candidate pool itself is still selected via the real, existing last_seen_at ordering — only the final page ordering changes.
    expect(chains.entities[0].order).toHaveBeenCalledWith('last_seen_at', { ascending: false })
  })

  it('sort="active" paginates the real sorted candidate list rather than re-querying the database per page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeEntityRow({ id: `e-${i}`, name: `Entity ${i}` }))
    const { client } = makeFakeClient({
      entities: [{ data: rows, error: null, count: 5 }],
      entity_event_links: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEntities(config, { sort: 'active', pageSize: 2 })
    expect(result.entities).toHaveLength(2)
    expect(result.nextCursor).toBe('2')
  })
})

function makeFullEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sanews:ev-1',
    title: 'Government urges nation to support Banyana Banyana',
    description: 'A description.',
    summary: null,
    country: 'South Africa',
    city: null,
    lat: null,
    lng: null,
    category: 'government',
    source: 'SAnews',
    source_url: 'https://www.sanews.gov.za/x',
    start_time: null,
    end_time: null,
    published_at: '2026-08-08T07:45:45.000Z',
    updated_at: '2026-08-08T07:45:45.000Z',
    importance: 'medium',
    confidence: 0.6,
    verification_status: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
    source_trust_score: 0.9,
    priority_score: 40,
    ...overrides,
  }
}

describe('getEntityDetail', () => {
  it('returns undefined when the entity does not exist', async () => {
    const { client } = makeFakeClient({ entities: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    expect(await getEntityDetail(config, 'missing')).toBeUndefined()
  })

  it("computes real stats/countries/sources from the entity's non-scheduled mentions via real count queries, and excludes scheduled events", async () => {
    const entityRow = makeEntityRow({ id: 'e-1', entity_type: 'country', name: 'South Africa' })
    const now = Date.now()
    const recentIso = new Date(now - 60_000).toISOString()
    const oldIso = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString()

    // Call order inside getEntityDetail's Promise.all: total, last24h, last7d, last30d, breakdown, recent, cooccurrenceIds, breaking, upcoming — then computeConnectedEntities's own query, then fetchRelationshipEvidence's own query.
    const { client, chains } = makeFakeClient({
      entities: [{ data: entityRow, error: null }],
      entity_event_links: [
        { data: null, error: null, count: 2 }, // total
        { data: null, error: null, count: 1 }, // last24h
        { data: null, error: null, count: 1 }, // last7d
        { data: null, error: null, count: 1 }, // last30d
        {
          data: [
            { normalized_events: { country: 'South Africa', source: 'SAnews' } },
            { normalized_events: { country: 'South Africa', source: 'SAnews' } },
          ],
          error: null,
        }, // breakdown
        { data: [{ normalized_events: makeFullEventRow() }], error: null }, // recentEvents
        {
          data: [
            { event_id: 'sanews:ev-1', normalized_events: { published_at: recentIso } },
            { event_id: 'sanews:ev-2', normalized_events: { published_at: oldIso } },
          ],
          error: null,
        }, // cooccurrenceIds
        { data: [], error: null }, // breaking
        { data: [], error: null }, // upcoming
        { data: [], error: null }, // computeConnectedEntities's own query
      ],
      entity_relationships: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const detail = await getEntityDetail(config, 'e-1')
    expect(detail?.entity).toMatchObject({ id: 'e-1', type: 'country', name: 'South Africa' })
    expect(detail?.stats).toEqual({ totalEvents: 2, eventsLast24h: 1, eventsLast7d: 1, eventsLast30d: 1 })
    expect(detail?.countries).toEqual([{ label: 'South Africa', count: 2 }])
    expect(detail?.sources).toEqual([{ label: 'SAnews', count: 2 }])
    expect(detail?.recentEvents).toHaveLength(1)
    expect(detail?.recentEvents[0]).toMatchObject({ id: 'sanews:ev-1', source: 'SAnews' })
    expect(detail?.breakingEvents).toEqual([])
    expect(detail?.upcomingEvents).toEqual([])
    expect(detail?.relationships).toEqual([])

    // Every real query here must exclude scheduled events server-side, matching listEvents/getDashboardSummary (upcoming deliberately queries FOR scheduled instead, checked separately).
    for (const chain of chains.entity_event_links.slice(0, 8)) {
      expect(chain.neq).toHaveBeenCalledWith('normalized_events.status', 'scheduled')
    }
    expect(chains.entity_event_links[8].eq).toHaveBeenCalledWith('normalized_events.status', 'scheduled')
    // computeConnectedEntities must also exclude "topic" entities — real but not journalist-facing (see DEFAULT_EXCLUDED_TYPE), and the frontend has no rendering for that type.
    expect(chains.entity_event_links[9].neq).toHaveBeenCalledWith('entities.entity_type', 'topic')
    // Every one of these 9 real queries must also exclude weather — InsightWire is not a weather platform, and an entity's stats/lists must not stay inflated by already-stored weather links.
    for (const chain of chains.entity_event_links.slice(0, 9)) {
      expect(chain.neq).toHaveBeenCalledWith('normalized_events.category', 'weather')
    }
  })

  it('caps co-occurrence to a bounded recent-event window rather than an unbounded id list (the real fix for the "United States"-scale 520 bug)', async () => {
    const entityRow = makeEntityRow({ id: 'e-us', entity_type: 'country', name: 'United States' })
    const manyEventRows = Array.from({ length: 100 }, (_, i) => ({ event_id: `nws-alerts:ev-${i}`, normalized_events: { published_at: '2026-08-08T00:00:00.000Z' } }))

    const { client, chains } = makeFakeClient({
      entities: [{ data: entityRow, error: null }],
      entity_event_links: [
        { data: null, error: null, count: 700 },
        { data: null, error: null, count: 5 },
        { data: null, error: null, count: 40 },
        { data: null, error: null, count: 200 },
        { data: [], error: null },
        { data: [], error: null },
        { data: manyEventRows, error: null }, // exactly the COOCCURRENCE_EVENT_WINDOW cap
        { data: [], error: null }, // breaking
        { data: [], error: null }, // upcoming
        { data: [], error: null }, // computeConnectedEntities's own query
      ],
      entity_relationships: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const detail = await getEntityDetail(config, 'e-us')
    expect(detail?.stats.totalEvents).toBe(700)
    // computeConnectedEntities's own call must have been given at most 100 ids, not all 700 real mentions.
    const cooccurrenceCall = chains.entity_event_links[9]
    const inCallArgs = (cooccurrenceCall.in as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(inCallArgs[1]).toHaveLength(100)
  })

  it('returns empty connectedEntities and recentEvents when the entity has no non-scheduled mentions', async () => {
    const entityRow = makeEntityRow({ id: 'e-2', entity_type: 'person', name: 'Someone' })
    const { client } = makeFakeClient({
      entities: [{ data: entityRow, error: null }],
      entity_event_links: [
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null }, // breaking
        { data: [], error: null }, // upcoming
      ],
      entity_relationships: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const detail = await getEntityDetail(config, 'e-2')
    expect(detail?.stats.totalEvents).toBe(0)
    expect(detail?.recentEvents).toEqual([])
    expect(detail?.connectedEntities).toEqual([])
    expect(detail?.breakingEvents).toEqual([])
    expect(detail?.upcomingEvents).toEqual([])
  })

  it('fetches real relationship evidence (both directions) and links each to its real supporting entity and event', async () => {
    const entityRow = makeEntityRow({ id: 'e-1', entity_type: 'person', name: 'Ramaphosa' })
    const otherEntityRow = makeEntityRow({ id: 'e-germany', entity_type: 'country', name: 'Germany' })

    const { client } = makeFakeClient({
      // First result is the main entity lookup (.maybeSingle(), a single object); second is fetchRelationshipEvidence's "other entity" lookup (.in(), an array).
      entities: [{ data: entityRow, error: null }, { data: [otherEntityRow], error: null }],
      entity_event_links: [
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null }, // breaking
        { data: [], error: null }, // upcoming
      ],
      entity_relationships: [
        {
          data: [
            {
              entity_id: 'e-1',
              related_entity_id: 'e-germany',
              relationship_type: 'mentioned_with',
              confidence: 0.8,
              evidence_snippet: 'held talks with the German Chancellor',
              evidence_event_id: 'sanews:ev-1',
            },
          ],
          error: null,
        },
      ],
      normalized_events: [{ data: [{ id: 'sanews:ev-1', title: 'A headline', source_url: 'https://www.sanews.gov.za/x', published_at: '2026-08-08T00:00:00.000Z' }], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const detail = await getEntityDetail(config, 'e-1')
    expect(detail?.relationships).toHaveLength(1)
    expect(detail?.relationships[0]).toMatchObject({
      relationshipType: 'mentioned_with',
      direction: 'outgoing',
      confidence: 0.8,
      evidenceSnippet: 'held talks with the German Chancellor',
      evidenceEvent: { id: 'sanews:ev-1', sourceUrl: 'https://www.sanews.gov.za/x' },
    })
  })

  it('excludes weather from relationship evidence-event lookups — a relationship whose only evidence is a weather event is dropped, not shown', async () => {
    const entityRow = makeEntityRow({ id: 'e-1', entity_type: 'person', name: 'Ramaphosa' })
    const otherEntityRow = makeEntityRow({ id: 'e-germany', entity_type: 'country', name: 'Germany' })

    const { client, chains } = makeFakeClient({
      entities: [{ data: entityRow, error: null }, { data: [otherEntityRow], error: null }],
      entity_event_links: [
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: null, error: null, count: 0 },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      entity_relationships: [
        {
          data: [
            {
              entity_id: 'e-1',
              related_entity_id: 'e-germany',
              relationship_type: 'mentioned_with',
              confidence: 0.8,
              evidence_snippet: 'held talks with the German Chancellor',
              evidence_event_id: 'nws-alerts:ev-1',
            },
          ],
          error: null,
        },
      ],
      // The evidence event is excluded by the query's own weather filter (empty result), simulating a real weather-only-evidence relationship.
      normalized_events: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const detail = await getEntityDetail(config, 'e-1')
    expect(detail?.relationships).toEqual([])
    expect(chains.normalized_events[0].neq).toHaveBeenCalledWith('category', 'weather')
  })
})
