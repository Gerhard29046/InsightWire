import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { CATEGORY_IDS } from '@insightwire/shared'
import { getDashboardSummary } from './dashboardApi'
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
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

/**
 * getDashboardSummary issues 4 queries via Promise.all, in this exact
 * literal order: tracked, highPriority, diversity, top. Building the query
 * chains (chained `.select()`/`.neq()`/`.gte()` calls) happens synchronously
 * before any `await`, so `client.from()` is called in this same fixed order
 * every time — safe to rely on for a sequenced mock.
 */
function makeSequencedClient(results: QueryResult[]) {
  const chains = results.map(makeChain)
  let callIndex = 0
  const client = { from: vi.fn(() => chains[callIndex++]) }
  return { client, chains }
}

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

function diversityRow(country: string, source: string, category: string) {
  return { country, source, category }
}

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'nasa-news:ev-1',
    title: 'Real event',
    description: 'desc',
    summary: null,
    country: 'United States',
    city: null,
    lat: null,
    lng: null,
    category: 'science',
    source: 'NASA News',
    source_url: 'https://nasa.gov/1',
    start_time: null,
    end_time: null,
    published_at: '2026-08-08T10:00:00.000Z',
    updated_at: '2026-08-08T10:00:00.000Z',
    importance: 'high',
    confidence: 0.9,
    verification_status: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    source_trust_score: 0.9,
    priority_score: 75,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getDashboardSummary', () => {
  it('returns exact counts from PostgREST, not estimates', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 517 },
      { data: null, error: null, count: 12 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(summary.eventsTracked24h).toBe(517)
    expect(summary.highPriorityAlerts24h).toBe(12)
  })

  it('excludes status=scheduled on every one of the 4 queries', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getDashboardSummary(config)
    for (const chain of chains) {
      expect(chain.neq).toHaveBeenCalledWith('status', 'scheduled')
    }
  })

  it('excludes category=weather on every one of the 4 queries — InsightWire is not a weather platform', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getDashboardSummary(config)
    for (const chain of chains) {
      expect(chain.neq).toHaveBeenCalledWith('category', 'weather')
    }
  })

  it('filters the high-priority count using the same BREAKING_PRIORITY_THRESHOLD the Feed uses', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getDashboardSummary(config)
    expect(chains[1].gte).toHaveBeenCalledWith('priority_score', BREAKING_PRIORITY_THRESHOLD)
  })

  it('computes exact distinct country/source counts from every row in the window, not a capped sample', async () => {
    const diversityRows = [
      diversityRow('South Africa', 'south-africa-gov', 'government'),
      diversityRow('South Africa', 'south-africa-gov', 'government'),
      diversityRow('United States', 'nasa-news', 'science'),
      diversityRow('Kenya', 'nasa-news', 'science'),
    ]
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: diversityRows, error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(summary.countriesReporting).toBe(3)
    expect(summary.sourcesReporting).toBe(2)
  })

  it('zero-fills every real category, including ones with no events this window', async () => {
    const diversityRows = [diversityRow('South Africa', 'south-africa-gov', 'government')]
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: diversityRows, error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(summary.categoryBreakdown).toHaveLength(CATEGORY_IDS.length)
    expect(summary.categoryBreakdown).toContainEqual({ category: 'government', count: 1 })
    expect(summary.categoryBreakdown).toContainEqual({ category: 'conflicts', count: 0 })
    expect(summary.categoryBreakdown).toContainEqual({ category: 'courts', count: 0 })
  })

  it('never fabricates a category count above what the real rows contain', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(summary.categoryBreakdown.every((c) => c.count === 0)).toBe(true)
  })

  it('sorts highest-signal events by priority_score, the same column the Feed\'s "importance" sort uses', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [eventRow()], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(chains[3].order).toHaveBeenCalledWith('priority_score', { ascending: false, nullsFirst: false })
    expect(summary.highestSignalEvents).toHaveLength(1)
    expect(summary.highestSignalEvents[0]).toMatchObject({ id: 'nasa-news:ev-1', sourceUrl: 'https://nasa.gov/1' })
  })

  it('respects a custom reporting window in hours', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const before = Date.now()
    await getDashboardSummary(config, 6)
    const sinceArg = (chains[0].gte as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
    const sinceMs = new Date(sinceArg).getTime()
    expect(before - sinceMs).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000 - 1000)
    expect(before - sinceMs).toBeLessThanOrEqual(6 * 60 * 60 * 1000 + 5000)
  })

  it('includes a real generatedAt timestamp for the frontend\'s "updated Xs ago" display', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const before = Date.now()
    const summary = await getDashboardSummary(config)
    const generatedMs = new Date(summary.generatedAt).getTime()
    expect(generatedMs).toBeGreaterThanOrEqual(before)
    expect(generatedMs).toBeLessThanOrEqual(Date.now())
  })

  it('zero-fills every real region, including ones with no events this window', async () => {
    const diversityRows = [
      diversityRow('South Africa', 'south-africa-gov', 'government'),
      diversityRow('South Africa', 'south-africa-gov', 'government'),
      diversityRow('Japan', 'gdacs-alerts', 'natural_disasters'),
    ]
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: diversityRows, error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(summary.regionBreakdown).toContainEqual({ region: 'Africa', count: 2 })
    expect(summary.regionBreakdown).toContainEqual({ region: 'Asia-Pacific', count: 1 })
    expect(summary.regionBreakdown).toContainEqual({ region: 'Europe', count: 0 })
  })

  it('a real country with no mapped region (e.g. an unrecognized value) falls back to the Global bucket rather than being dropped', async () => {
    const diversityRows = [diversityRow('Global', 'nasa-news', 'science')]
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: diversityRows, error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const summary = await getDashboardSummary(config)
    expect(summary.regionBreakdown).toContainEqual({ region: 'Global', count: 1 })
  })

  it('applies a real country filter to all 4 queries when the caller (a region selection translated to countries) provides one', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getDashboardSummary(config, undefined, ['South Africa', 'Nigeria'])
    for (const chain of chains) {
      expect(chain.in).toHaveBeenCalledWith('country', ['South Africa', 'Nigeria'])
    }
  })

  it('does not call .in() at all when no countries are provided (no restriction)', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getDashboardSummary(config)
    for (const chain of chains) {
      expect(chain.in).not.toHaveBeenCalled()
    }
  })

  it('throws (rather than silently returning a partial summary) when any query errors', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: { message: 'connection reset' }, count: null },
      { data: null, error: null, count: 0 },
      { data: [], error: null },
      { data: [], error: null },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(getDashboardSummary(config)).rejects.toThrow(/connection reset/)
  })
})
