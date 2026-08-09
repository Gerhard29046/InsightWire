import { useSyncExternalStore } from 'react'
import { bookmarkStore } from '../lib/bookmarkStore'
import type { AddBookmarkInput, BookmarkRecord, UpdateBookmarkPatch } from '../lib/api/bookmarks'
import type { BookmarkStoreStatus } from '../lib/bookmarkStore'

export type BookmarksStatus = BookmarkStoreStatus | 'empty'

export interface UseBookmarksResult {
  bookmarks: BookmarkRecord[]
  status: BookmarksStatus
  error: unknown
  refresh: () => void
  addBookmark: (input: AddBookmarkInput) => Promise<BookmarkRecord>
  updateBookmark: (id: string, patch: UpdateBookmarkPatch) => Promise<BookmarkRecord>
  removeBookmark: (id: string) => Promise<void>
}

/**
 * Reads from the same shared `bookmarkStore` `EventCard`/`EventDetail`'s
 * bookmark button uses (see bookmarkStore.ts's own doc comment) — the
 * Workspace's BookmarksPanel and every other bookmark button in the app are
 * therefore always looking at the same real data, not independent caches
 * that can drift apart.
 */
export function useBookmarks(): UseBookmarksResult {
  const snapshot = useSyncExternalStore(bookmarkStore.subscribe, bookmarkStore.getSnapshot)
  const status: BookmarksStatus = snapshot.status === 'ready' && snapshot.records.length === 0 ? 'empty' : snapshot.status

  return {
    bookmarks: snapshot.records,
    status,
    error: snapshot.error,
    refresh: () => bookmarkStore.refresh(),
    addBookmark: (input) => bookmarkStore.add(input),
    updateBookmark: (id, patch) => bookmarkStore.update(id, patch),
    removeBookmark: (id) => bookmarkStore.remove(id),
  }
}
