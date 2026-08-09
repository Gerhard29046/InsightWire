import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { WORKSPACE_USER_ID } from './workspaceApi'
import { addBookmark, listBookmarks, listCollections, removeBookmark, removeBookmarkByEvent, updateBookmark } from './bookmarksApi'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
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

function makeBookmarkRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'b-1',
    notes: null,
    tags: ['Cape Town', 'Transport'],
    priority: 'medium',
    collection: 'Investigations',
    read: false,
    created_at: '2026-08-09T08:00:00.000Z',
    updated_at: '2026-08-09T08:00:00.000Z',
    normalized_events: {
      id: 'evt-1',
      title: 'City announces new transport infrastructure plan',
      source: 'News24',
      category: 'government',
      importance: 'medium',
      status: 'live',
      published_at: '2026-08-09T06:00:00.000Z',
      source_url: 'https://news24.com/x',
    },
    ...overrides,
  }
}

describe('listBookmarks', () => {
  it('maps real joined rows into the flat BookmarkRecord shape', async () => {
    const { client } = makeFakeClient({ bookmarks: [{ data: [makeBookmarkRow()], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [bookmark] = await listBookmarks(config)
    expect(bookmark.event.title).toBe('City announces new transport infrastructure plan')
    expect(bookmark.tags).toEqual(['Cape Town', 'Transport'])
    expect(bookmark.collection).toBe('Investigations')
  })

  it('drops a row whose joined event is missing rather than returning a broken record', async () => {
    const { client } = makeFakeClient({ bookmarks: [{ data: [makeBookmarkRow({ normalized_events: null })], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await listBookmarks(config)
    expect(result).toEqual([])
  })

  it('applies collection/priority/unread filters and scopes to WORKSPACE_USER_ID', async () => {
    const { client, chains } = makeFakeClient({ bookmarks: [{ data: [], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await listBookmarks(config, { collection: 'Investigations', priority: 'high', unreadOnly: true })
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('user_id', WORKSPACE_USER_ID)
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('collection', 'Investigations')
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('priority', 'high')
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('read', false)
  })
})

describe('addBookmark', () => {
  it('upserts on (user_id, normalized_event_id) so re-bookmarking is idempotent', async () => {
    const { client, chains } = makeFakeClient({ bookmarks: [{ data: makeBookmarkRow(), error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const record = await addBookmark(config, { normalizedEventId: 'evt-1' })
    expect(record.event.id).toBe('evt-1')
    expect(chains.bookmarks[0].upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: WORKSPACE_USER_ID, normalized_event_id: 'evt-1', priority: 'medium', tags: [] }),
      { onConflict: 'user_id,normalized_event_id' },
    )
  })

  it('throws a clear error if the normalized event does not exist', async () => {
    const { client } = makeFakeClient({ bookmarks: [{ data: makeBookmarkRow({ normalized_events: null }), error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(addBookmark(config, { normalizedEventId: 'missing' })).rejects.toThrow(/not found/)
  })
})

describe('updateBookmark', () => {
  it('returns undefined when not found or not owned by this user', async () => {
    const { client } = makeFakeClient({ bookmarks: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await updateBookmark(config, 'missing', { read: true })
    expect(result).toBeUndefined()
  })

  it('bumps updated_at and scopes to WORKSPACE_USER_ID', async () => {
    const { client, chains } = makeFakeClient({ bookmarks: [{ data: makeBookmarkRow(), error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await updateBookmark(config, 'b-1', { notes: 'Follow up next week' })
    expect(chains.bookmarks[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Follow up next week', updated_at: expect.any(String) }),
    )
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('user_id', WORKSPACE_USER_ID)
  })
})

describe('removeBookmark / removeBookmarkByEvent', () => {
  it('removeBookmark scopes the delete to id + WORKSPACE_USER_ID', async () => {
    const { client, chains } = makeFakeClient({ bookmarks: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await removeBookmark(config, 'b-1')
    expect(chains.bookmarks[0].delete).toHaveBeenCalled()
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('id', 'b-1')
  })

  it('removeBookmarkByEvent scopes the delete to normalized_event_id + WORKSPACE_USER_ID (no bookmark row id needed)', async () => {
    const { client, chains } = makeFakeClient({ bookmarks: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    await removeBookmarkByEvent(config, 'evt-1')
    expect(chains.bookmarks[0].eq).toHaveBeenCalledWith('normalized_event_id', 'evt-1')
  })
})

describe('listCollections', () => {
  it('groups real rows into distinct collection names + counts, excluding uncategorized bookmarks', async () => {
    const { client } = makeFakeClient({
      bookmarks: [
        {
          data: [{ collection: 'Investigations' }, { collection: 'Investigations' }, { collection: 'Cape Town' }],
          error: null,
        },
      ],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const collections = await listCollections(config)
    expect(collections).toEqual([
      { name: 'Cape Town', count: 1 },
      { name: 'Investigations', count: 2 },
    ])
  })
})
