import { apiFetch } from './client'
import type { CategoryId } from '../categories'
import type { NormalizedEvent } from './types'

export interface CategoryCount {
  category: CategoryId
  count: number
}

export interface DashboardSummary {
  eventsTracked24h: number
  highPriorityAlerts24h: number
  countriesReporting: number
  sourcesReporting: number
  categoryBreakdown: CategoryCount[]
  highestSignalEvents: NormalizedEvent[]
  /** Real wall-clock time the Worker computed this summary — used for "Updated Xs ago," never a fabricated/optimistic timestamp. */
  generatedAt: string
}

/** GET {VITE_API_BASE_URL}/dashboard/summary — worker/src/api/dashboardApi.ts. Every field is a real aggregate over `normalized_events`, computed server-side (see that file's own doc comment for exactly how). */
export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/dashboard/summary')
}
