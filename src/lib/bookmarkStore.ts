import {
  addBookmark,
  fetchBookmarks,
  removeBookmark,
  removeBookmarkByEvent,
  updateBookmark,
  type AddBookmarkInput,
  type BookmarkRecord,
  type UpdateBookmarkPatch,
} from './api/bookmarks'
import { ApiNotConfiguredError } from './api/client'

/**
 * The ONE source of truth for bookmark state across the whole app —
 * EventCard (Feed/Dashboard/Alerts/Entity Detail), EventDetail, and the
 * Journalist Workspace's BookmarksPanel all read from and write through this
 * single module-level store (subscribed to via `useSyncExternalStore`)
 * instead of each keeping their own fetch/cache.
 *
 * This replaces an earlier design where `useBookmarkStatus` (a Set of
 * bookmarked event ids, for the card button) and `useBookmarks` (the
 * Workspace's own independent `fetchBookmarks()` call, for the rich panel)
 * were two separate caches — a real bug, found live: removing a bookmark
 * from Workspace never told the card-button cache anything had changed, so
 * the Feed kept showing it bookmarked until a full reload. A single shared
 * cache makes that class of bug structurally impossible: every mutation
 * updates the one cache every reader shares — there is no second cache to
 * remember to invalidate.
 */
export type BookmarkStoreStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface BookmarkStoreSnapshot {
  records: BookmarkRecord[]
  status: BookmarkStoreStatus
  error: unknown
}

type Listener = () => void

class BookmarkStore {
  private snapshot: BookmarkStoreSnapshot = { records: [], status: 'loading', error: null }
  private listeners = new Set<Listener>()
  private loaded = false
  private loadPromise: Promise<void> | null = null

  private emit() {
    for (const listener of this.listeners) listener()
  }

  private setSnapshot(next: BookmarkStoreSnapshot) {
    this.snapshot = next
    this.emit()
  }

  private setRecords(records: BookmarkRecord[]) {
    this.setSnapshot({ records, status: 'ready', error: null })
  }

  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve()
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = fetchBookmarks()
      .then((bookmarks) => {
        this.loaded = true
        this.setRecords(bookmarks)
      })
      .catch((err: unknown) => {
        this.loadPromise = null
        this.setSnapshot({ records: [], status: err instanceof ApiNotConfiguredError ? 'not-configured' : 'error', error: err })
      })
    return this.loadPromise
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    void this.ensureLoaded()
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): BookmarkStoreSnapshot => this.snapshot

  /** Forces the next read to re-fetch — an escape hatch for drift (e.g. another browser tab), not needed by any mutation path below since each of those updates the shared cache directly. */
  refresh(): void {
    this.loaded = false
    this.loadPromise = null
    this.setSnapshot({ ...this.snapshot, status: 'loading' })
    void this.ensureLoaded()
  }

  async add(input: AddBookmarkInput): Promise<BookmarkRecord> {
    const record = await addBookmark(input)
    // Upsert server-side (see bookmarksApi.ts) — replace any existing record for this event rather than assuming it's always new.
    this.setRecords([record, ...this.snapshot.records.filter((r) => r.event.id !== record.event.id)])
    return record
  }

  async update(id: string, patch: UpdateBookmarkPatch): Promise<BookmarkRecord> {
    const record = await updateBookmark(id, patch)
    this.setRecords(this.snapshot.records.map((r) => (r.id === id ? record : r)))
    return record
  }

  async remove(id: string): Promise<void> {
    await removeBookmark(id)
    this.setRecords(this.snapshot.records.filter((r) => r.id !== id))
  }

  async removeByEvent(normalizedEventId: string): Promise<void> {
    await removeBookmarkByEvent(normalizedEventId)
    this.setRecords(this.snapshot.records.filter((r) => r.event.id !== normalizedEventId))
  }

  isBookmarked(normalizedEventId: string): boolean {
    return this.snapshot.records.some((r) => r.event.id === normalizedEventId)
  }

  /** Backs `EventCard`/`EventDetail`'s single Bookmark button — optimistic, with rollback on failure. */
  async toggle(normalizedEventId: string): Promise<void> {
    const existing = this.snapshot.records.find((r) => r.event.id === normalizedEventId)
    if (existing) {
      const previous = this.snapshot.records
      this.setRecords(previous.filter((r) => r.event.id !== normalizedEventId))
      try {
        await removeBookmarkByEvent(normalizedEventId)
      } catch (err) {
        this.setRecords(previous)
        throw err
      }
    } else {
      // add() only updates the cache after the API call resolves, so a
      // failure here leaves the cache untouched already — nothing to roll
      // back, just let the error propagate to the caller.
      await this.add({ normalizedEventId })
    }
  }
}

export const bookmarkStore = new BookmarkStore()
