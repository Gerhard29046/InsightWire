import { apiFetch } from './client'

export type BookmarkPriority = 'low' | 'medium' | 'high'

export interface BookmarkEvent {
  id: string
  title: string
  source: string
  category: string
  importance: string
  status: string
  publishedAt: string
  sourceUrl: string | null
}

export interface BookmarkRecord {
  id: string
  event: BookmarkEvent
  notes: string | null
  tags: string[]
  priority: BookmarkPriority
  collection: string | null
  read: boolean
  createdAt: string
  updatedAt: string
}

export interface CollectionSummary {
  name: string
  count: number
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export interface ListBookmarksParams {
  collection?: string
  priority?: BookmarkPriority
  unreadOnly?: boolean
}

export function fetchBookmarks(params: ListBookmarksParams = {}): Promise<BookmarkRecord[]> {
  const search = new URLSearchParams()
  if (params.collection) search.set('collection', params.collection)
  if (params.priority) search.set('priority', params.priority)
  if (params.unreadOnly) search.set('unreadOnly', 'true')
  const qs = search.toString()
  return apiFetch<{ bookmarks: BookmarkRecord[] }>(`/bookmarks${qs ? `?${qs}` : ''}`).then((r) => r.bookmarks)
}

export interface AddBookmarkInput {
  normalizedEventId: string
  notes?: string
  tags?: string[]
  priority?: BookmarkPriority
  collection?: string
}

/** POST {VITE_API_BASE_URL}/bookmarks — upserted server-side, so calling this on an already-bookmarked event is safe (see worker/src/api/bookmarksApi.ts's own doc comment). */
export function addBookmark(input: AddBookmarkInput): Promise<BookmarkRecord> {
  return apiFetch<BookmarkRecord>('/bookmarks', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) })
}

export interface UpdateBookmarkPatch {
  notes?: string | null
  tags?: string[]
  priority?: BookmarkPriority
  collection?: string | null
  read?: boolean
}

export function updateBookmark(id: string, patch: UpdateBookmarkPatch): Promise<BookmarkRecord> {
  return apiFetch<BookmarkRecord>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) })
}

export function removeBookmark(id: string): Promise<void> {
  return apiFetch<{ success: true }>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined)
}

/** Un-bookmarking from `EventCard.tsx`, which only ever has the event id, not a bookmark row id. */
export function removeBookmarkByEvent(normalizedEventId: string): Promise<void> {
  return apiFetch<{ success: true }>(`/bookmarks?eventId=${encodeURIComponent(normalizedEventId)}`, { method: 'DELETE' }).then(() => undefined)
}

export function fetchCollections(): Promise<CollectionSummary[]> {
  return apiFetch<{ collections: CollectionSummary[] }>('/bookmarks/collections').then((r) => r.collections)
}
