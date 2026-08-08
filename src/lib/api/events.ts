import { apiFetch } from './client'
import type { EventFiltersState, EventSortMode, EventUpdate, NormalizedEvent } from './types'

export interface FetchEventsParams {
  filters: EventFiltersState
  sort: EventSortMode
  cursor?: string | null
  pageSize?: number
}

export interface FetchEventsResult {
  events: NormalizedEvent[]
  nextCursor: string | null
  /** Exact count matching the filters, from the real API's PostgREST `count: 'exact'` — undefined on the Supabase-direct fallback path, which doesn't request one. */
  totalCount?: number | null
}

export interface EventDetail {
  event: NormalizedEvent
  timeline: EventUpdate[]
  sources: NormalizedEvent['confirmingSources']
  relatedEvents: NormalizedEvent[]
}

/**
 * GET {VITE_API_BASE_URL}/events — the Intelligence API (Phase 8,
 * worker/src/api/router.ts). The Worker holds the service-role key
 * server-side; the frontend needs no Supabase credentials at all anymore —
 * an earlier phase (docs/decisions/0008-frontend-preview.md) queried
 * Supabase directly with the anon key as a stopgap before this API existed;
 * that path (and the anon-read RLS policy it needed) has been removed now
 * that a real server-side API exists — see docs/decisions/0009-intelligence-api.md.
 */
export function fetchEvents(params: FetchEventsParams): Promise<FetchEventsResult> {
  return fetchEventsViaApi(params)
}

/** GET {VITE_API_BASE_URL}/events/:id */
export function fetchEventDetail(id: string): Promise<EventDetail> {
  return apiFetch<EventDetail>(`/events/${encodeURIComponent(id)}`)
}

function fetchEventsViaApi({ filters, sort, cursor, pageSize = 25 }: FetchEventsParams): Promise<FetchEventsResult> {
  const params = new URLSearchParams()
  params.set('sort', sort)
  params.set('pageSize', String(pageSize))
  if (cursor) params.set('cursor', cursor)
  if (filters.search) params.set('q', filters.search)
  if (filters.verifiedOnly) params.set('verified', 'true')
  if (filters.futureOnly) params.set('future', 'true')
  if (filters.liveOnly) params.set('live', 'true')
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  if (filters.timeRange !== 'any') params.set('timeRange', filters.timeRange)
  filters.countries.forEach((v) => params.append('country', v))
  filters.regions.forEach((v) => params.append('region', v))
  filters.categories.forEach((v) => params.append('category', v))
  filters.importance.forEach((v) => params.append('importance', v))
  filters.languages.forEach((v) => params.append('language', v))
  filters.sources.forEach((v) => params.append('source', v))

  return apiFetch<FetchEventsResult>(`/events?${params.toString()}`)
}
