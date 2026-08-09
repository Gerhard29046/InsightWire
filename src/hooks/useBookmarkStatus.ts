import { useCallback, useSyncExternalStore } from 'react'
import { bookmarkStore } from '../lib/bookmarkStore'

export interface UseBookmarkStatusResult {
  bookmarked: boolean
  toggle: () => void
}

/** Backs the Bookmark button on both `EventCard.tsx` (Feed/Dashboard/Alerts/Entity Detail) and `EventDetail.tsx` — the same hook, the same shared `bookmarkStore`, so there is exactly one bookmark implementation, not one per surface. */
export function useBookmarkStatus(normalizedEventId: string): UseBookmarkStatusResult {
  const snapshot = useSyncExternalStore(bookmarkStore.subscribe, bookmarkStore.getSnapshot)

  const toggle = useCallback(() => {
    bookmarkStore.toggle(normalizedEventId).catch(() => {
      // Reverted inside bookmarkStore itself — nothing further to do here;
      // a failed toggle simply leaves the button showing its real state.
    })
  }, [normalizedEventId])

  return { bookmarked: snapshot.records.some((r) => r.event.id === normalizedEventId), toggle }
}
