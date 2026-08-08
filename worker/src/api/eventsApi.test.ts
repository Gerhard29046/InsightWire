import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { getEventDetail, listEvents, parseListEventsQuery, BREAKING_PRIORITY_THRESHOLD } from './eventsApi'
import type { Repository } from '../pipeline/repository'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

interface QueryResult {
  data: unknown
  error: { message: string } | null
  count?: number | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    or: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

function makeFakeClient(result: QueryResult) {
  const chain = makeChain(result)
  const client = { from: vi.fn(() => chain) }
  return { client, chain }
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'nws-alerts:ev-1',
    title: 'Severe Thunderstorm Warning',
    description: 'A description.',
    summary: null,
    country: 'United States',
    city: 'Austin',
    lat: null,
    lng: null,
    category: 'weather',
    source: 'NWS Active Alerts',
    source_url: 'https://api.weather.gov/alerts/1',
    start_time: null,
    end_time: null,
    published_at: '2026-08-07T14:32:00.000Z',
    updated_at: '2026-08-07T14:48:00.000Z',
    importance: 'high',
    confidence: 0.95,
    verification_status: 'verified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    source_trust_score: 0.9,
    priority_score: 66,
    ...overrides,
  }
}

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseListEventsQuery', () => {
  it('parses the exact param shape fetchEventsViaApi sends', () => {
    const params = new URLSearchParams()
    params.set('sort', 'importance')
    params.set('pageSize', '10')
    params.set('cursor', '20')
    params.set('q', 'storm')
    params.set('verified', 'true')
    params.set('future', 'true')
    params.set('live', 'true')
    params.append('country', 'United States')
    params.append('category', 'weather')

    const query = parseListEventsQuery(params)
    expect(query).toMatchObject({
      sort: 'importance',
      pageSize: 10,
      cursor: '20',
      search: 'storm',
      verifiedOnly: true,
      futureOnly: true,
      liveOnly: true,
      countries: ['United States'],
      categories: ['weather'],
    })
  })

  it('defaults breakingOnly/minSourceTrust/minConfidence to absent when not provided', () => {
    const query = parseListEventsQuery(new URLSearchParams())
    expect(query.breakingOnly).toBe(false)
    expect(query.minSourceTrust).toBeUndefined()
    expect(query.minConfidence).toBeUndefined()
  })

  it('parses the new Phase 8 params', () => {
    const params = new URLSearchParams()
    params.set('breaking', 'true')
    params.set('minSourceTrust', '0.8')
    params.set('minConfidence', '0.5')
    params.append('city', 'Austin')

    const query = parseListEventsQuery(params)
    expect(query.breakingOnly).toBe(true)
    expect(query.minSourceTrust).toBe(0.8)
    expect(query.minConfidence).toBe(0.5)
    expect(query.cities).toEqual(['Austin'])
  })
})

describe('listEvents', () => {
  it('maps rows to NormalizedEvent and computes nextCursor when a full page comes back', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeRow({ id: `nws-alerts:ev-${i}` }))
    const { client } = makeFakeClient({ data: rows, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEvents(config, { pageSize: 25, cursor: null })
    expect(result.events).toHaveLength(25)
    expect(result.events[0]).toMatchObject({ id: 'nws-alerts:ev-0', title: 'Severe Thunderstorm Warning' })
    expect(result.nextCursor).toBe('25')
  })

  it('returns a null cursor on a partial (final) page', async () => {
    const rows = [makeRow()]
    const { client } = makeFakeClient({ data: rows, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEvents(config, { pageSize: 25, cursor: null })
    expect(result.nextCursor).toBeNull()
  })

  it('returns the exact total count from PostgREST, not the page length', async () => {
    const rows = [makeRow()]
    const { client } = makeFakeClient({ data: rows, error: null, count: 411 })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listEvents(config, { pageSize: 25, cursor: null })
    expect(result.totalCount).toBe(411)
  })

  it('applies breakingOnly as a priority_score threshold filter', async () => {
    const { client, chain } = makeFakeClient({ data: [], error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEvents(config, { breakingOnly: true })
    expect(chain.gte).toHaveBeenCalledWith('priority_score', BREAKING_PRIORITY_THRESHOLD)
  })

  it('applies minSourceTrust/minConfidence filters', async () => {
    const { client, chain } = makeFakeClient({ data: [], error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEvents(config, { minSourceTrust: 0.8, minConfidence: 0.5 })
    expect(chain.gte).toHaveBeenCalledWith('source_trust_score', 0.8)
    expect(chain.gte).toHaveBeenCalledWith('confidence', 0.5)
  })

  it('throws on a Supabase error rather than returning a partial result', async () => {
    const { client } = makeFakeClient({ data: null, error: { message: 'network error' } })
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(listEvents(config, {})).rejects.toThrow(/network error/)
  })

  it('does not apply any filter for region (documented no-op)', async () => {
    const { client, chain } = makeFakeClient({ data: [], error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listEvents(config, {})
    // 'region' has no corresponding column filter anywhere in listEvents —
    // asserting the query builder was never asked to filter on it.
    for (const call of (chain.eq as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toBe('region')
    }
  })
})

describe('getEventDetail', () => {
  function makeRepository(event: NormalizedEvent | undefined): Repository {
    return {
      upsertRawEvent: vi.fn(),
      upsertNormalizedEvent: vi.fn(),
      recordEventUpdate: vi.fn(),
      getEventUpdates: vi.fn().mockResolvedValue([{ at: '2026-08-07T14:41:00.000Z', label: 'Updated' }]),
      recordAiSummary: vi.fn(),
      recordEmbedding: vi.fn(),
      getNormalizedEvent: vi.fn().mockResolvedValue(event),
    }
  }

  const event: NormalizedEvent = {
    id: 'nws-alerts:ev-1',
    title: 'Severe Thunderstorm Warning',
    description: 'A description.',
    country: 'United States',
    city: 'Austin',
    category: 'weather',
    source: 'NWS Active Alerts',
    publishedAt: '2026-08-07T14:32:00.000Z',
    updatedAt: '2026-08-07T14:48:00.000Z',
    importance: 'high',
    confidence: 0.95,
    verificationStatus: 'verified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    confirmingSources: [{ connectorId: 'nws-alerts', reportedAt: '2026-08-07T14:32:00.000Z' }],
  }

  it('returns undefined when the event does not exist, without querying related events', async () => {
    const { client } = makeFakeClient({ data: [], error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    const repository = makeRepository(undefined)

    const detail = await getEventDetail(config, repository, 'missing')
    expect(detail).toBeUndefined()
    expect(client.from).not.toHaveBeenCalled()
  })

  it('combines the event, timeline, sources, and related events (excluding itself)', async () => {
    const relatedRow = makeRow({ id: 'nws-alerts:ev-2', title: 'Flash Flood Warning' })
    const { client, chain } = makeFakeClient({ data: [relatedRow], error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    const repository = makeRepository(event)

    const detail = await getEventDetail(config, repository, event.id)
    expect(detail?.event).toEqual(event)
    expect(detail?.timeline).toEqual([{ at: '2026-08-07T14:41:00.000Z', label: 'Updated' }])
    expect(detail?.sources).toEqual(event.confirmingSources)
    expect(detail?.relatedEvents).toHaveLength(1)
    expect(detail?.relatedEvents[0].id).toBe('nws-alerts:ev-2')
    expect(chain.eq).toHaveBeenCalledWith('category', 'weather')
    expect(chain.eq).toHaveBeenCalledWith('country', 'United States')
    expect(chain.neq).toHaveBeenCalledWith('id', event.id)
  })
})
