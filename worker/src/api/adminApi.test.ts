import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const fakeConnector = {
  id: 'us-federal-reserve',
  healthCheck: vi.fn(),
}

vi.mock('../index', () => ({
  createDefaultRegistry: vi.fn(() => ({
    get: (id: string) => (id === fakeConnector.id ? fakeConnector : undefined),
    list: () => [fakeConnector, { id: 'us-white-house' }],
  })),
}))

import {
  fetchDisabledSourceIds,
  getDatabaseOverview,
  getOverview,
  listAuditLog,
  listSources,
  recordAuditEntry,
  testSource,
  updateSource,
} from './adminApi'

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

interface QueryResult {
  data: unknown
  error: { message: string } | null
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
    not: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

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

describe('recordAuditEntry / listAuditLog', () => {
  it('writes a real row with the given actor/action/resource', async () => {
    const { client, chains } = makeFakeClient({ admin_audit_log: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await recordAuditEntry(config, { actor: 'WORKSPACE_USER_ID', action: 'source.disabled', resourceType: 'source', resourceId: 'nasa-news' })
    expect(chains.admin_audit_log[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'WORKSPACE_USER_ID', action: 'source.disabled', resource_type: 'source', resource_id: 'nasa-news' }),
    )
  })

  it('returns "No audit activity" honestly — an empty table yields an empty array, not fabricated entries', async () => {
    const { client } = makeFakeClient({ admin_audit_log: [{ data: [], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const entries = await listAuditLog(config)
    expect(entries).toEqual([])
  })
})

describe('fetchDisabledSourceIds', () => {
  it('returns real disabled source ids from the sources table', async () => {
    const { client } = makeFakeClient({ sources: [{ data: [{ id: 'nasa-news' }, { id: 'nws-alerts' }], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const ids = await fetchDisabledSourceIds(config)
    expect(ids).toEqual(new Set(['nasa-news', 'nws-alerts']))
  })
})

function makeSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'us-federal-reserve',
    name: 'US Federal Reserve',
    description: 'desc',
    type: 'rss',
    version: '1.0.0',
    refresh_interval_ms: 1800000,
    enabled: true,
    country: 'United States',
    category: 'markets',
    language: 'en',
    feed_url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('listSources', () => {
  it('joins real event counts, run history, and the existing trust registry — never a fabricated reliability score', async () => {
    const { client } = makeFakeClient({
      sources: [{ data: [makeSourceRow()], error: null }],
      connector_runs: [
        {
          data: [
            { source_id: 'us-federal-reserve', status: 'success', started_at: '2026-08-09T10:00:00.000Z', sample_errors: [] },
            { source_id: 'us-federal-reserve', status: 'failed', started_at: '2026-08-08T10:00:00.000Z', sample_errors: ['HTTP 500'] },
          ],
          error: null,
        },
      ],
      normalized_events: [{ data: [], error: null, count: 20 }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [record] = await listSources(config)
    expect(record.eventCount).toBe(20)
    expect(record.lastSuccessAt).toBe('2026-08-09T10:00:00.000Z')
    expect(record.lastFailureAt).toBe('2026-08-08T10:00:00.000Z')
    expect(record.lastStatus).toBe('success')
    // Real, existing signal from trust.ts — 'official' tier for a central bank, not an invented score.
    expect(record.trustCategory).toBe('official')
    expect(record.trustScore).toBe(0.95)
  })
})

describe('updateSource', () => {
  it('writes the patch and records a real audit entry with the correct action for enable/disable', async () => {
    const { client, chains } = makeFakeClient({
      sources: [{ data: makeSourceRow({ enabled: false }), error: null }],
      admin_audit_log: [{ data: null, error: null }],
      connector_runs: [{ data: [], error: null }],
      normalized_events: [{ data: [], error: null, count: 0 }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const record = await updateSource(config, 'us-federal-reserve', { enabled: false }, 'WORKSPACE_USER_ID')
    expect(record?.enabled).toBe(false)
    expect(chains.sources[0].update).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(chains.admin_audit_log[0].insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'source.disabled' }))
  })

  it('returns undefined for an unknown source id without writing an audit entry', async () => {
    const { client, chains } = makeFakeClient({ sources: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await updateSource(config, 'missing', { enabled: false }, 'WORKSPACE_USER_ID')
    expect(result).toBeUndefined()
    expect(chains.admin_audit_log).toBeUndefined()
  })
})

describe('testSource', () => {
  it('delegates to the connector\'s own real healthCheck() — never a fabricated "OK"', async () => {
    fakeConnector.healthCheck.mockResolvedValue({ healthy: true, checkedAt: '2026-08-09T10:00:00.000Z' })
    const result = await testSource('us-federal-reserve')
    expect(result).toEqual({ connectorId: 'us-federal-reserve', healthy: true, message: undefined, checkedAt: '2026-08-09T10:00:00.000Z' })
  })

  it('returns undefined for a connector id not in the registry', async () => {
    const result = await testSource('does-not-exist')
    expect(result).toBeUndefined()
  })
})

describe('getDatabaseOverview', () => {
  it('reports a real count for every real table', async () => {
    const { client } = makeFakeClient({
      normalized_events: [{ data: [], error: null, count: 500 }],
      sources: [{ data: [], error: null, count: 18 }],
      event_updates: [{ data: [], error: null, count: 10 }],
      entities: [{ data: [], error: null, count: 200 }],
      countries: [{ data: [], error: null, count: 0 }],
      alerts: [{ data: [], error: null, count: 5 }],
      bookmarks: [{ data: [], error: null, count: 1 }, { data: [{ collection: 'Investigations' }], error: null }],
      watchlists: [{ data: [], error: null, count: 2 }],
      profiles: [{ data: [], error: null, count: 0 }],
      notifications: [{ data: [], error: null, count: 0 }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const metrics = await getDatabaseOverview(config)
    const byLabel = Object.fromEntries(metrics.map((m) => [m.label, m]))
    expect(byLabel['Events'].count).toBe(500)
    expect(byLabel['Users'].count).toBe(0)
    expect(byLabel['Collections'].count).toBe(1)
  })

  it('marks a metric unavailable (not a fabricated zero) when the query errors', async () => {
    const { client } = makeFakeClient({
      normalized_events: [{ data: [], error: { message: 'relation does not exist' } }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const metrics = await getDatabaseOverview(config)
    const events = metrics.find((m) => m.label === 'Events')
    expect(events?.count).toBeNull()
    expect(events?.unavailable).toBe(true)
  })
})

describe('getOverview', () => {
  it('reports pipeline stages honestly, including "not_monitored" where no real signal is tracked', async () => {
    const { client } = makeFakeClient({
      sources: [{ data: [{ id: 'us-federal-reserve', enabled: true }, { id: 'nws-alerts', enabled: false }], error: null }],
      connector_runs: [{ data: [], error: null }],
      normalized_events: [{ data: [], error: null, count: 0 }],
      entity_extractions: [{ data: [], error: null, count: 0 }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const overview = await getOverview(config, { geminiConfigured: true, anthropicConfigured: false })
    expect(overview.database.connected).toBe(true)
    expect(overview.ingestion.activeSources).toBe(1)
    expect(overview.ingestion.totalSources).toBe(2)

    const dedup = overview.pipeline.find((p) => p.stage === 'Deduplication')
    expect(dedup?.status).toBe('not_monitored')
    const ingestion = overview.pipeline.find((p) => p.stage === 'Ingestion')
    expect(ingestion?.status).toBe('not_monitored')
  })

  it('throws (surfaced by the router as a real 500, same as every other endpoint) when the database is genuinely unreachable — never a silently fabricated "healthy" overview', async () => {
    const { client } = makeFakeClient({
      sources: [{ data: null, error: { message: 'connection refused' } }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(getOverview(config, { geminiConfigured: false, anthropicConfigured: false })).rejects.toThrow(/connection refused/)
  })
})
