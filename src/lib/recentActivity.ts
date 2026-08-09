/**
 * "Pick up where you left off" for the Journalist Workspace. There is no
 * server-side view-history anywhere in this app (confirmed: the only other
 * localStorage usage at all is theme persistence, `src/lib/theme.tsx`) —
 * adding one would mean a new table plus instrumentation across every route,
 * for a "continuity" feature that's genuinely useful but not load-bearing.
 * A small bounded client-side log is honest (it only ever records what this
 * browser actually did) and proportionate to that.
 */
const STORAGE_KEY = 'insightwire.recentActivity'
const MAX_ENTRIES = 30

export type RecentActivityKind = 'viewed_event' | 'viewed_entity' | 'ran_search' | 'saved_bookmark' | 'opened_watchlist'

export interface RecentActivityEntry {
  kind: RecentActivityKind
  label: string
  href: string
  at: string
}

function readAll(): RecentActivityEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RecentActivityEntry[]) : []
  } catch {
    return []
  }
}

function writeAll(entries: RecentActivityEntry[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

/** De-dupes by (kind, href) so re-opening the same event repeatedly bumps it to the top instead of piling up duplicates. */
export function logRecentActivity(entry: Omit<RecentActivityEntry, 'at'>): void {
  const existing = readAll().filter((e) => !(e.kind === entry.kind && e.href === entry.href))
  writeAll([{ ...entry, at: new Date().toISOString() }, ...existing])
}

export function getRecentActivity(): RecentActivityEntry[] {
  return readAll()
}

export function clearRecentActivity(): void {
  writeAll([])
}
