import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  WORKSPACE_USER_ID,
  createWatchlist,
  deleteWatchlist,
  getWorkspaceOverview,
  listAlerts,
  listNotifications,
  listWatchlists,
  markAlertRead,
  markAllAlertsRead,
  markAllNotificationsRead,
  markNotificationRead,
  refreshWatchlist,
  updateWatchlist,
} from './workspaceApi'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('./eventsApi', async () => {
  const actual = await vi.importActual<typeof import('./eventsApi')>('./eventsApi')
  return { ...actual, listEvents: vi.fn() }
})

import { listEvents } from './eventsApi'

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

/** Every real supabase-js query builder method used by workspaceApi.ts, chainable, with `single`/`maybeSingle`/`range` and a bare `await`/`then` all resolving to the same queued result — mirrors entitiesApi.test.ts's makeChain, extended with the write-path methods (insert/update/delete) this file's CRUD functions need. */
function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    or: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

/** Routes each `.from(table)` call to its own queued result, in call order. */
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

function makeWatchlistRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'w-1',
    name: 'Western Cape infrastructure',
    filters: { categories: ['government'] },
    active: true,
    notify: true,
    last_checked_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('listWatchlists', () => {
  it('maps rows and computes newResultsCount/lastActivityAt from real unread alerts', async () => {
    const { client } = makeFakeClient({
      watchlists: [{ data: [makeWatchlistRow()], error: null }],
      alerts: [
        {
          data: [
            { watchlist_id: 'w-1', triggered_at: '2026-08-09T10:00:00.000Z', read: false },
            { watchlist_id: 'w-1', triggered_at: '2026-08-08T00:00:00.000Z', read: true },
          ],
          error: null,
        },
      ],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listWatchlists(config)
    expect(result).toHaveLength(1)
    expect(result[0].newResultsCount).toBe(1)
    expect(result[0].lastActivityAt).toBe('2026-08-09T10:00:00.000Z')
  })

  it('flags a watchlist quiet only once checked and stale beyond the threshold', async () => {
    const staleRow = makeWatchlistRow({ id: 'w-quiet', last_checked_at: '2026-08-09T00:00:00.000Z' })
    const { client } = makeFakeClient({
      watchlists: [{ data: [staleRow], error: null }],
      alerts: [{ data: [{ watchlist_id: 'w-quiet', triggered_at: '2026-08-01T00:00:00.000Z', read: true }], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [record] = await listWatchlists(config)
    expect(record.quiet).toBe(true)
  })

  it('never flags an unchecked watchlist as quiet', async () => {
    const neverChecked = makeWatchlistRow({ id: 'w-new', last_checked_at: null })
    const { client } = makeFakeClient({
      watchlists: [{ data: [neverChecked], error: null }],
      alerts: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [record] = await listWatchlists(config)
    expect(record.quiet).toBe(false)
  })
})

describe('createWatchlist', () => {
  it('inserts scoped to WORKSPACE_USER_ID and returns the new record', async () => {
    const { client, chains } = makeFakeClient({
      watchlists: [{ data: makeWatchlistRow({ id: 'w-new' }), error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const record = await createWatchlist(config, { name: 'Western Cape infrastructure', filters: { categories: ['government'] } })
    expect(record.id).toBe('w-new')
    expect(chains.watchlists[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: WORKSPACE_USER_ID, name: 'Western Cape infrastructure' }),
    )
  })
})

describe('updateWatchlist', () => {
  it('returns undefined when the row does not exist (or is not owned by this user)', async () => {
    const { client } = makeFakeClient({ watchlists: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await updateWatchlist(config, 'missing', { active: false })
    expect(result).toBeUndefined()
  })

  it('scopes the update to both id and WORKSPACE_USER_ID', async () => {
    const { client, chains } = makeFakeClient({
      watchlists: [{ data: makeWatchlistRow({ active: false }), error: null }],
      alerts: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    await updateWatchlist(config, 'w-1', { active: false })
    expect(chains.watchlists[0].eq).toHaveBeenCalledWith('user_id', WORKSPACE_USER_ID)
  })
})

describe('deleteWatchlist', () => {
  it('scopes the delete to both id and WORKSPACE_USER_ID', async () => {
    const { client, chains } = makeFakeClient({ watchlists: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await deleteWatchlist(config, 'w-1')
    expect(chains.watchlists[0].delete).toHaveBeenCalled()
    expect(chains.watchlists[0].eq).toHaveBeenCalledWith('user_id', WORKSPACE_USER_ID)
  })
})

describe('refreshWatchlist', () => {
  it('returns undefined for a watchlist that does not exist', async () => {
    const { client } = makeFakeClient({ watchlists: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await refreshWatchlist(config, 'missing')
    expect(result).toBeUndefined()
    expect(listEvents).not.toHaveBeenCalled()
  })

  it('only materializes genuinely new matches, never re-inserting an already-materialized alert', async () => {
    vi.mocked(listEvents).mockResolvedValue({
      events: [
        { id: 'evt-1', title: 'Old match' } as never,
        { id: 'evt-2', title: 'New match' } as never,
      ],
      nextCursor: null,
      totalCount: 2,
    })
    const { client, chains } = makeFakeClient({
      watchlists: [{ data: makeWatchlistRow(), error: null }, { data: null, error: null }],
      alerts: [{ data: [{ normalized_event_id: 'evt-1' }], error: null }, { data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await refreshWatchlist(config, 'w-1')
    expect(result?.insertedCount).toBe(1)
    expect(chains.alerts[1].insert).toHaveBeenCalledWith([{ watchlist_id: 'w-1', normalized_event_id: 'evt-2' }])
    expect(chains.watchlists[1].update).toHaveBeenCalledWith(expect.objectContaining({ last_checked_at: expect.any(String) }))
  })

  it('inserts nothing when every live match is already materialized', async () => {
    vi.mocked(listEvents).mockResolvedValue({ events: [{ id: 'evt-1' } as never], nextCursor: null, totalCount: 1 })
    const { client, chains } = makeFakeClient({
      watchlists: [{ data: makeWatchlistRow(), error: null }, { data: null, error: null }],
      alerts: [{ data: [{ normalized_event_id: 'evt-1' }], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await refreshWatchlist(config, 'w-1')
    expect(result?.insertedCount).toBe(0)
    expect(chains.alerts[1]?.insert).not.toHaveBeenCalled()
  })
})

describe('listAlerts', () => {
  function makeAlertJoinRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'a-1',
      triggered_at: '2026-08-09T10:00:00.000Z',
      read: false,
      watchlists: { id: 'w-1', name: 'Western Cape infrastructure', user_id: WORKSPACE_USER_ID },
      normalized_events: {
        id: 'evt-1',
        title: 'Flooding in the Western Cape',
        source: 'SANews',
        category: 'natural_disasters',
        importance: 'critical',
        status: 'live',
        published_at: '2026-08-09T09:00:00.000Z',
        source_url: null,
      },
      ...overrides,
    }
  }

  it('tags an alert breaking when importance is high/critical and the event is still live/developing', async () => {
    const { client } = makeFakeClient({ alerts: [{ data: [makeAlertJoinRow()], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [alert] = await listAlerts(config)
    expect(alert.breaking).toBe(true)
  })

  it('does not tag a resolved, low-importance match as breaking', async () => {
    const row = makeAlertJoinRow({
      normalized_events: {
        id: 'evt-2',
        title: 'Routine council meeting',
        source: 'SANews',
        category: 'government',
        importance: 'low',
        status: 'resolved',
        published_at: '2026-08-09T09:00:00.000Z',
        source_url: null,
      },
    })
    const { client } = makeFakeClient({ alerts: [{ data: [row], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [alert] = await listAlerts(config)
    expect(alert.breaking).toBe(false)
  })

  it('scopes to the owning user via the joined watchlist', async () => {
    const { client, chains } = makeFakeClient({ alerts: [{ data: [], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listAlerts(config)
    expect(chains.alerts[0].eq).toHaveBeenCalledWith('watchlists.user_id', WORKSPACE_USER_ID)
  })
})

describe('markAlertRead / markAllAlertsRead', () => {
  it('marks a single alert read', async () => {
    const { client, chains } = makeFakeClient({ alerts: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await markAlertRead(config, 'a-1')
    expect(chains.alerts[0].update).toHaveBeenCalledWith({ read: true })
    expect(chains.alerts[0].eq).toHaveBeenCalledWith('id', 'a-1')
  })

  it('marks all alerts read only for watchlists this user owns', async () => {
    const { client, chains } = makeFakeClient({
      watchlists: [{ data: [makeWatchlistRow({ id: 'w-1' }), makeWatchlistRow({ id: 'w-2' })], error: null }],
      alerts: [{ data: [{ id: 'a-1' }, { id: 'a-2' }], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const count = await markAllAlertsRead(config)
    expect(count).toBe(2)
    expect(chains.alerts[0].in).toHaveBeenCalledWith('watchlist_id', ['w-1', 'w-2'])
  })
})

describe('notifications', () => {
  it('lists notifications scoped to WORKSPACE_USER_ID', async () => {
    const { client, chains } = makeFakeClient({
      notifications: [{ data: [{ id: 'n-1', type: 'digest', payload: {}, read: false, created_at: '2026-08-09T00:00:00.000Z' }], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [notification] = await listNotifications(config)
    expect(notification.id).toBe('n-1')
    expect(chains.notifications[0].eq).toHaveBeenCalledWith('user_id', WORKSPACE_USER_ID)
  })

  it('marks a single notification read, scoped to the owner', async () => {
    const { client, chains } = makeFakeClient({ notifications: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await markNotificationRead(config, 'n-1')
    expect(chains.notifications[0].update).toHaveBeenCalledWith({ read: true })
  })

  it('marks all unread notifications read and reports how many changed', async () => {
    const { client } = makeFakeClient({ notifications: [{ data: [{ id: 'n-1' }, { id: 'n-2' }], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const count = await markAllNotificationsRead(config)
    expect(count).toBe(2)
  })
})

describe('getWorkspaceOverview', () => {
  it('returns a real, honestly-empty overview when nothing exists yet — no fabricated attention items', async () => {
    const { client } = makeFakeClient({
      watchlists: [{ data: [], error: null }],
      bookmarks: [{ data: [], error: null }],
      notifications: [{ data: [], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const overview = await getWorkspaceOverview(config)
    expect(overview.counts).toEqual({ savedSearches: 0, activeMonitoring: 0, bookmarks: 0, unreadAlerts: 0, recentlyUpdated: 0 })
    expect(overview.attention).toEqual([])
    expect(overview.quietSearches).toEqual([])
    expect(overview.topSources).toEqual([])
  })
})
