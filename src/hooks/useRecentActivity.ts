import { useCallback, useState } from 'react'
import { getRecentActivity, type RecentActivityEntry } from '../lib/recentActivity'

export interface UseRecentActivityResult {
  entries: RecentActivityEntry[]
  refresh: () => void
}

/** Re-reads on demand rather than subscribing to storage events — this is a single-tab SPA, and the only writers (EventDetail/EntityDetail/Workspace actions) all live in the same tab as any reader. */
export function useRecentActivity(): UseRecentActivityResult {
  const [entries, setEntries] = useState<RecentActivityEntry[]>(() => getRecentActivity())

  const refresh = useCallback(() => {
    setEntries(getRecentActivity())
  }, [])

  return { entries, refresh }
}
