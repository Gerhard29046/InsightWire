import { apiFetch } from './client'
import { countriesForRegions } from '../regions'
import type { CategoryId } from '../categories'
import type { RegionLabel } from '@insightwire/shared'
import type { NormalizedEvent } from './types'

export interface CategoryCount {
  category: CategoryId
  count: number
}

export interface RegionCount {
  region: RegionLabel
  count: number
}

export interface DashboardSummary {
  eventsTracked24h: number
  highPriorityAlerts24h: number
  countriesReporting: number
  sourcesReporting: number
  categoryBreakdown: CategoryCount[]
  regionBreakdown: RegionCount[]
  highestSignalEvents: NormalizedEvent[]
  /** Real wall-clock time the Worker computed this summary — used for "Updated Xs ago," never a fabricated/optimistic timestamp. */
  generatedAt: string
}

/**
 * GET {VITE_API_BASE_URL}/dashboard/summary — worker/src/api/dashboardApi.ts.
 * Every field is a real aggregate over `normalized_events`, computed
 * server-side (see that file's own doc comment for exactly how).
 * `regions` (Africa/Middle East/etc.) is translated to real `country` values
 * before the request is sent, same as the Events Feed — the backend has no
 * region column (see src/lib/regions.ts's own doc comment).
 */
export function fetchDashboardSummary(regions: RegionLabel[] = []): Promise<DashboardSummary> {
  const isGlobalSelected = regions.length === 0 || regions.includes('Global')
  const params = new URLSearchParams()
  if (!isGlobalSelected) {
    countriesForRegions(regions).forEach((country) => params.append('country', country))
  }
  const query = params.toString()
  return apiFetch<DashboardSummary>(`/dashboard/summary${query ? `?${query}` : ''}`)
}
