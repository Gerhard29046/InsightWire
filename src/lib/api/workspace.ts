import { apiFetch } from './client'
import { countriesForRegions } from '../regions'
import { createEmptyFilters, type EventFiltersState } from './types'

/**
 * Mirrors worker/src/api/workspaceApi.ts's `WatchlistFilters` — minus
 * `regions`, which has no backend column (same reason `fetchEvents` never
 * sends one, see events.ts's own doc comment). `toWatchlistFilters` below
 * does the same region→country translation `fetchEvents` already performs,
 * so a saved search behaves identically to running the same filters in the
 * Feed right now.
 */
export interface WatchlistFilters {
  search?: string
  countries?: string[]
  categories?: string[]
  importance?: string[]
  languages?: string[]
  sources?: string[]
  statuses?: string[]
  verifiedOnly?: boolean
  futureOnly?: boolean
  liveOnly?: boolean
  breakingOnly?: boolean
  dateFrom?: string | null
  dateTo?: string | null
  timeRange?: 'any' | '1h' | '24h' | '7d' | '30d'
}

/** For the "edit criteria" flow, which reuses `EventFilters.tsx` directly. */
export function toWatchlistFilters(filters: EventFiltersState): WatchlistFilters {
  const regionCountries = countriesForRegions(filters.regions)
  const isGlobalSelected = filters.regions.includes('Global')
  const countries = isGlobalSelected ? filters.countries : [...new Set([...filters.countries, ...regionCountries])]
  return {
    search: filters.search || undefined,
    countries: countries.length > 0 ? countries : undefined,
    categories: filters.categories.length > 0 ? filters.categories : undefined,
    importance: filters.importance.length > 0 ? filters.importance : undefined,
    languages: filters.languages.length > 0 ? filters.languages : undefined,
    sources: filters.sources.length > 0 ? filters.sources : undefined,
    statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
    verifiedOnly: filters.verifiedOnly || undefined,
    futureOnly: filters.futureOnly || undefined,
    liveOnly: filters.liveOnly || undefined,
    breakingOnly: filters.breakingOnly || undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    timeRange: filters.timeRange !== 'any' ? filters.timeRange : undefined,
  }
}

/** The inverse, for loading a stored watchlist back into `EventFilters.tsx`. `regions` can't be recovered (never stored — see the type's own doc comment) and is left at its default ("Global"); the resolved `countries` list is preserved either way, so the effective filter is unchanged, only the region chips' visual state resets. */
export function fromWatchlistFilters(filters: WatchlistFilters): EventFiltersState {
  return {
    ...createEmptyFilters(),
    search: filters.search ?? '',
    countries: filters.countries ?? [],
    categories: (filters.categories ?? []) as EventFiltersState['categories'],
    importance: (filters.importance ?? []) as EventFiltersState['importance'],
    languages: filters.languages ?? [],
    sources: filters.sources ?? [],
    statuses: (filters.statuses ?? []) as EventFiltersState['statuses'],
    verifiedOnly: filters.verifiedOnly ?? false,
    futureOnly: filters.futureOnly ?? false,
    liveOnly: filters.liveOnly ?? false,
    breakingOnly: filters.breakingOnly ?? false,
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    timeRange: filters.timeRange ?? 'any',
  }
}

export interface WatchlistRecord {
  id: string
  name: string
  filters: WatchlistFilters
  active: boolean
  notify: boolean
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
  newResultsCount: number
  lastActivityAt: string | null
  quiet: boolean
}

export interface RefreshWatchlistResult {
  watchlist: WatchlistRecord
  insertedCount: number
}

export interface AlertEvent {
  id: string
  title: string
  source: string
  category: string
  importance: string
  status: string
  publishedAt: string
  sourceUrl: string | null
}

export interface AlertRecord {
  id: string
  watchlistId: string
  watchlistName: string
  event: AlertEvent
  triggeredAt: string
  read: boolean
  breaking: boolean
}

export interface NotificationRecord {
  id: string
  type: string
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

export interface AttentionItem {
  id: string
  kind: 'new_matches' | 'developing_spike' | 'bookmark_updated' | 'unread_notification'
  title: string
  description: string
  timestamp: string
  actionLabel: string
  actionHref: string
}

export interface WorkspaceOverview {
  counts: {
    savedSearches: number
    activeMonitoring: number
    bookmarks: number
    unreadAlerts: number
    recentlyUpdated: number
  }
  attention: AttentionItem[]
  quietSearches: { id: string; name: string; lastActivityAt: string | null }[]
  topSources: { source: string; count: number }[]
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** GET {VITE_API_BASE_URL}/workspace/overview — the one aggregating call the Workspace page loads on open (worker/src/api/workspaceApi.ts's getWorkspaceOverview). */
export function fetchWorkspaceOverview(): Promise<WorkspaceOverview> {
  return apiFetch<WorkspaceOverview>('/workspace/overview')
}

export function fetchWatchlists(): Promise<WatchlistRecord[]> {
  return apiFetch<{ watchlists: WatchlistRecord[] }>('/watchlists').then((r) => r.watchlists)
}

export function createWatchlist(input: { name: string; filters: WatchlistFilters }): Promise<WatchlistRecord> {
  return apiFetch<WatchlistRecord>('/watchlists', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) })
}

export interface UpdateWatchlistPatch {
  name?: string
  filters?: WatchlistFilters
  active?: boolean
  notify?: boolean
}

export function updateWatchlist(id: string, patch: UpdateWatchlistPatch): Promise<WatchlistRecord> {
  return apiFetch<WatchlistRecord>(`/watchlists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  })
}

export function deleteWatchlist(id: string): Promise<void> {
  return apiFetch<{ success: true }>(`/watchlists/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined)
}

export function refreshWatchlist(id: string): Promise<RefreshWatchlistResult> {
  return apiFetch<RefreshWatchlistResult>(`/watchlists/${encodeURIComponent(id)}/refresh`, { method: 'POST' })
}

export function fetchAlerts(opts: { watchlistId?: string; unreadOnly?: boolean } = {}): Promise<AlertRecord[]> {
  const params = new URLSearchParams()
  if (opts.watchlistId) params.set('watchlistId', opts.watchlistId)
  if (opts.unreadOnly) params.set('unreadOnly', 'true')
  const qs = params.toString()
  return apiFetch<{ alerts: AlertRecord[] }>(`/alerts${qs ? `?${qs}` : ''}`).then((r) => r.alerts)
}

export function markAlertRead(id: string): Promise<void> {
  return apiFetch<{ success: true }>(`/alerts/${encodeURIComponent(id)}`, { method: 'PATCH' }).then(() => undefined)
}

export function markAllAlertsRead(watchlistId?: string): Promise<number> {
  const qs = watchlistId ? `?watchlistId=${encodeURIComponent(watchlistId)}` : ''
  return apiFetch<{ updated: number }>(`/alerts/read-all${qs}`, { method: 'POST' }).then((r) => r.updated)
}

export function fetchNotifications(): Promise<NotificationRecord[]> {
  return apiFetch<{ notifications: NotificationRecord[] }>('/notifications').then((r) => r.notifications)
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<{ success: true }>(`/notifications/${encodeURIComponent(id)}`, { method: 'PATCH' }).then(() => undefined)
}

export function markAllNotificationsRead(): Promise<number> {
  return apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }).then((r) => r.updated)
}
