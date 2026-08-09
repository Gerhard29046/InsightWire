import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { WORKSPACE_USER_ID } from './workspaceApi'

export interface BookmarksApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: BookmarksApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type BookmarkPriority = 'low' | 'medium' | 'high'

interface BookmarkEventRow {
  id: string
  title: string
  source: string
  category: string
  importance: string
  status: string
  published_at: string
  source_url: string | null
}

interface BookmarkRow {
  id: string
  notes: string | null
  tags: string[]
  priority: BookmarkPriority
  collection: string | null
  read: boolean
  created_at: string
  updated_at: string
  normalized_events: BookmarkEventRow | null
}

export interface BookmarkRecord {
  id: string
  event: {
    id: string
    title: string
    source: string
    category: string
    importance: string
    status: string
    publishedAt: string
    sourceUrl: string | null
  }
  notes: string | null
  tags: string[]
  priority: BookmarkPriority
  collection: string | null
  read: boolean
  createdAt: string
  updatedAt: string
}

const BOOKMARK_SELECT =
  'id, notes, tags, priority, collection, read, created_at, updated_at, normalized_events!inner(id, title, source, category, importance, status, published_at, source_url)'

function toBookmarkRecord(row: BookmarkRow): BookmarkRecord | undefined {
  if (!row.normalized_events) return undefined
  const event = row.normalized_events
  return {
    id: row.id,
    event: {
      id: event.id,
      title: event.title,
      source: event.source,
      category: event.category,
      importance: event.importance,
      status: event.status,
      publishedAt: event.published_at,
      sourceUrl: event.source_url,
    },
    notes: row.notes,
    tags: row.tags,
    priority: row.priority,
    collection: row.collection,
    read: row.read,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ListBookmarksQuery {
  collection?: string
  priority?: BookmarkPriority
  unreadOnly?: boolean
}

export async function listBookmarks(config: BookmarksApiConfig, query: ListBookmarksQuery = {}): Promise<BookmarkRecord[]> {
  const supabase = client(config)
  let q = supabase.from('bookmarks').select(BOOKMARK_SELECT).eq('user_id', WORKSPACE_USER_ID).order('created_at', { ascending: false })
  if (query.collection) q = q.eq('collection', query.collection)
  if (query.priority) q = q.eq('priority', query.priority)
  if (query.unreadOnly) q = q.eq('read', false)

  const { data, error } = await q
  if (error) throw new Error(`listBookmarks failed: ${error.message}`)
  return ((data ?? []) as unknown as BookmarkRow[]).map(toBookmarkRecord).filter((r): r is BookmarkRecord => r !== undefined)
}

export interface AddBookmarkInput {
  normalizedEventId: string
  notes?: string
  tags?: string[]
  priority?: BookmarkPriority
  collection?: string
}

/**
 * Upserted on `(user_id, normalized_event_id)` — the table's own real unique
 * constraint (Phase 6) — so re-bookmarking an already-saved event from a
 * second tab/click is idempotent rather than a 409, matching the toggle
 * behavior `EventCard.tsx`'s button already presents to the journalist.
 */
export async function addBookmark(config: BookmarksApiConfig, input: AddBookmarkInput): Promise<BookmarkRecord> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('bookmarks')
    .upsert(
      {
        user_id: WORKSPACE_USER_ID,
        normalized_event_id: input.normalizedEventId,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        priority: input.priority ?? 'medium',
        collection: input.collection ?? null,
      },
      { onConflict: 'user_id,normalized_event_id' },
    )
    .select(BOOKMARK_SELECT)
    .single()
  if (error) throw new Error(`addBookmark failed: ${error.message}`)
  const record = toBookmarkRecord(data as unknown as BookmarkRow)
  if (!record) throw new Error(`addBookmark: normalized event "${input.normalizedEventId}" was not found`)
  return record
}

export interface UpdateBookmarkPatch {
  notes?: string | null
  tags?: string[]
  priority?: BookmarkPriority
  collection?: string | null
  read?: boolean
}

export async function updateBookmark(
  config: BookmarksApiConfig,
  id: string,
  patch: UpdateBookmarkPatch,
): Promise<BookmarkRecord | undefined> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('bookmarks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', WORKSPACE_USER_ID)
    .select(BOOKMARK_SELECT)
    .maybeSingle()
  if (error) throw new Error(`updateBookmark failed: ${error.message}`)
  if (!data) return undefined
  return toBookmarkRecord(data as unknown as BookmarkRow)
}

export async function removeBookmark(config: BookmarksApiConfig, id: string): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase.from('bookmarks').delete().eq('id', id).eq('user_id', WORKSPACE_USER_ID)
  if (error) throw new Error(`removeBookmark failed: ${error.message}`)
}

/**
 * `EventCard.tsx`'s bookmark toggle only ever has the event id in hand (not
 * a bookmark row id) — this lets it un-bookmark without a lookup round trip.
 */
export async function removeBookmarkByEvent(config: BookmarksApiConfig, normalizedEventId: string): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('normalized_event_id', normalizedEventId)
    .eq('user_id', WORKSPACE_USER_ID)
  if (error) throw new Error(`removeBookmarkByEvent failed: ${error.message}`)
}

export interface CollectionSummary {
  name: string
  count: number
}

/**
 * No separate `collections` table — a collection is just whatever free text
 * a journalist typed into a bookmark's `collection` field. Distinct names +
 * counts are computed here from real rows, not maintained separately.
 */
export async function listCollections(config: BookmarksApiConfig): Promise<CollectionSummary[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('bookmarks').select('collection').eq('user_id', WORKSPACE_USER_ID).not('collection', 'is', null)
  if (error) throw new Error(`listCollections failed: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { collection: string | null }[]) {
    if (!row.collection) continue
    counts.set(row.collection, (counts.get(row.collection) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
}
