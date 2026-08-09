import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveEventGeography, resolveTopologyName, type NormalizedEvent } from '@insightwire/shared'
import { getGeoReadiness, getMapSummary, MAP_MARKER_LIMIT } from './mapApi'
import { BREAKING_PRIORITY_THRESHOLD } from './eventsApi'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

interface QueryResult {
  data: unknown
  error: { message: string } | null
  count?: number | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    not: vi.fn(() => chain),
    is: vi.fn(() => chain),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

function makeSequencedClient(results: QueryResult[]) {
  const chains = results.map(makeChain)
  let callIndex = 0
  const client = { from: vi.fn(() => chains[callIndex++]) }
  return { client, chains }
}

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getGeoReadiness', () => {
  it('returns exact counts of events with vs. without coordinates', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 823 },
      { data: null, error: null, count: 4102 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const readiness = await getGeoReadiness(config)
    expect(readiness.withCoordinates).toBe(823)
    expect(readiness.withoutCoordinates).toBe(4102)
  })

  it('queries with .not(lat, is, null) for the with-coordinates count and .is(lat, null) for the other', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getGeoReadiness(config)
    expect(chains[0].not).toHaveBeenCalledWith('lat', 'is', null)
    expect(chains[1].is).toHaveBeenCalledWith('lat', null)
  })

  it('excludes scheduled events from both counts, same as every other real-time query', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getGeoReadiness(config)
    for (const chain of chains) {
      expect(chain.neq).toHaveBeenCalledWith('status', 'scheduled')
    }
  })

  it('excludes weather from both counts — InsightWire is not a weather platform', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getGeoReadiness(config)
    for (const chain of chains) {
      expect(chain.neq).toHaveBeenCalledWith('category', 'weather')
    }
  })

  it('throws rather than silently returning a partial result when a query errors', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: { message: 'connection reset' }, count: null },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(getGeoReadiness(config)).rejects.toThrow(/connection reset/)
  })
})

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    country: 'South Africa',
    importance: 'medium',
    priority_score: 30,
    lat: null,
    lng: null,
    ...overrides,
  }
}

describe('getMapSummary', () => {
  it('aggregates real per-country totals, excluding the Global sentinel from country rows', async () => {
    const { client } = makeSequencedClient([
      {
        data: [
          row({ country: 'South Africa' }),
          row({ country: 'South Africa' }),
          row({ country: 'Nigeria' }),
          row({ country: 'Global' }),
        ],
        error: null,
      },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getMapSummary(config)
    const sa = summary.countries.find((c) => c.country === 'South Africa')
    const nigeria = summary.countries.find((c) => c.country === 'Nigeria')
    expect(sa?.total).toBe(2)
    expect(nigeria?.total).toBe(1)
    expect(summary.countries.find((c) => c.country === 'Global')).toBeUndefined()
  })

  it('breaking/significant/routine are mutually exclusive and always sum to the country total', async () => {
    const { client } = makeSequencedClient([
      {
        data: [
          row({ country: 'Japan', priority_score: BREAKING_PRIORITY_THRESHOLD, importance: 'low' }), // breaking (priority wins even with low importance)
          row({ country: 'Japan', priority_score: 10, importance: 'critical' }), // significant
          row({ country: 'Japan', priority_score: 10, importance: 'medium' }), // routine
        ],
        error: null,
      },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getMapSummary(config)
    const japan = summary.countries.find((c) => c.country === 'Japan')!
    expect(japan.breaking).toBe(1)
    expect(japan.significant).toBe(1)
    expect(japan.routine).toBe(1)
    expect(japan.breaking + japan.significant + japan.routine).toBe(japan.total)
  })

  it('includes a coordinate-bearing marker even when its country is the Global sentinel', async () => {
    const { client } = makeSequencedClient([
      { data: [row({ country: 'Global', lat: 7.16, lng: 80.57 })], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getMapSummary(config)
    expect(summary.countries).toHaveLength(0)
    expect(summary.markers).toHaveLength(1)
    expect(summary.markers[0]).toMatchObject({ country: 'Global', lat: 7.16, lng: 80.57 })
  })

  it('caps markers and prioritizes the highest priority_score first, so breaking events are never crowded out', async () => {
    const rows = Array.from({ length: MAP_MARKER_LIMIT + 10 }, (_, i) =>
      row({ country: 'Japan', lat: i, lng: i, priority_score: i }),
    )
    const { client } = makeSequencedClient([{ data: rows, error: null }])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getMapSummary(config)
    expect(summary.markers).toHaveLength(MAP_MARKER_LIMIT)
    expect(summary.markers[0].priorityScore).toBe(MAP_MARKER_LIMIT + 9)
    expect(summary.markers[summary.markers.length - 1].priorityScore).toBe(10)
  })

  it('counts unknownCount for rows with neither a real country nor coordinates, and never plots them', async () => {
    const { client } = makeSequencedClient([
      {
        data: [row({ country: 'Global', lat: null, lng: null }), row({ country: 'South Africa' })],
        error: null,
      },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getMapSummary(config)
    expect(summary.unknownCount).toBe(1)
    expect(summary.markers).toHaveLength(0)
  })

  it('defaults to a 7-day window and reports it back', async () => {
    const { client, chains } = makeSequencedClient([{ data: [], error: null }])
    vi.mocked(createClient).mockReturnValue(client as never)

    const before = Date.now()
    const summary = await getMapSummary(config)
    expect(summary.windowHours).toBe(24 * 7)
    const sinceArg = (chains[0].gte as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
    const sinceMs = new Date(sinceArg).getTime()
    expect(before - sinceMs).toBeGreaterThanOrEqual(24 * 7 * 60 * 60 * 1000 - 1000)
  })

  it('respects a custom window', async () => {
    const { client } = makeSequencedClient([{ data: [], error: null }])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getMapSummary(config, 24)
    expect(summary.windowHours).toBe(24)
  })

  it('excludes scheduled events', async () => {
    const { client, chains } = makeSequencedClient([{ data: [], error: null }])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getMapSummary(config)
    expect(chains[0].neq).toHaveBeenCalledWith('status', 'scheduled')
  })

  it('excludes weather — InsightWire is not a weather platform', async () => {
    const { client, chains } = makeSequencedClient([{ data: [], error: null }])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getMapSummary(config)
    expect(chains[0].neq).toHaveBeenCalledWith('category', 'weather')
  })

  it('throws rather than silently returning a partial summary when the query errors', async () => {
    const { client } = makeSequencedClient([{ data: null, error: { message: 'connection reset' } }])
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(getMapSummary(config)).rejects.toThrow(/connection reset/)
  })
})

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'x:1',
    title: 'Test',
    description: 'desc',
    country: 'South Africa',
    category: 'government',
    source: 'Test',
    publishedAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.5,
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

// packages/shared has no test runner of its own (confirmed — regions.ts, added in
// the prior phase, is untested at the shared-package level too); these pure
// functions are exercised here, from the one real consumer's test suite.
describe('resolveEventGeography (from @insightwire/shared)', () => {
  it('resolves exact precision when coordinates are present', () => {
    const geo = resolveEventGeography(makeEvent({ coordinates: { lat: 1, lng: 2 } }))
    expect(geo.precision).toBe('exact')
  })

  it('resolves country precision when a real, non-Global country is present with no coordinates', () => {
    const geo = resolveEventGeography(makeEvent({ country: 'Nigeria' }))
    expect(geo).toEqual({ precision: 'country', country: 'Nigeria' })
  })

  it('resolves unknown precision for the Global sentinel with no coordinates', () => {
    const geo = resolveEventGeography(makeEvent({ country: 'Global' }))
    expect(geo).toEqual({ precision: 'unknown', country: null })
  })
})

describe('resolveTopologyName (from @insightwire/shared)', () => {
  it('passes through a country name that already matches world-atlas exactly', () => {
    expect(resolveTopologyName('South Africa')).toBe('South Africa')
  })

  it('translates a known alias to world-atlas naming', () => {
    expect(resolveTopologyName('United States')).toBe('United States of America')
    expect(resolveTopologyName('Democratic Republic of the Congo')).toBe('Dem. Rep. Congo')
  })

  it('returns undefined for the Global sentinel and empty values', () => {
    expect(resolveTopologyName('Global')).toBeUndefined()
    expect(resolveTopologyName(null)).toBeUndefined()
    expect(resolveTopologyName(undefined)).toBeUndefined()
  })
})
