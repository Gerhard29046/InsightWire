/**
 * Recent navbar search terms — a different concept from `recentActivity.ts`
 * (which logs *what you opened*, not *what you typed*). Same localStorage
 * precedent/reasoning as that file: no server-side search-history table
 * exists or is worth building for this, a small client-local bounded list
 * is honest and proportionate.
 */
const STORAGE_KEY = 'insightwire.recentSearches'
const MAX_ENTRIES = 8

function readAll(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeAll(entries: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function logRecentSearch(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  const existing = readAll().filter((q) => q.toLowerCase() !== trimmed.toLowerCase())
  writeAll([trimmed, ...existing])
}

export function getRecentSearches(): string[] {
  return readAll()
}

export function clearRecentSearches(): void {
  writeAll([])
}
