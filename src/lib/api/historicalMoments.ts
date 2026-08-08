import { apiFetch } from './client'
import type { CategoryId } from '../categories'

export type Significance = 'major' | 'notable'

export interface HistoricalMoment {
  id: string
  title: string
  summary: string
  startDate: string
  endDate: string | null
  significance: Significance
  category: CategoryId | null
  region: string | null
  countries: string[]
  sourceUrls: string[]
  createdAt: string
}

/** GET {VITE_API_BASE_URL}/historical-moments — worker/src/api/historicalMomentsApi.ts. Real, curated rows only; an empty array is the honest, expected result until a real curation workflow populates the table (see the migration's own comment). */
export function fetchHistoricalMoments(): Promise<HistoricalMoment[]> {
  return apiFetch<{ moments: HistoricalMoment[] }>('/historical-moments').then((res) => res.moments)
}

/** GET {VITE_API_BASE_URL}/historical-moments/:id */
export function fetchHistoricalMomentDetail(id: string): Promise<HistoricalMoment> {
  return apiFetch<HistoricalMoment>(`/historical-moments/${encodeURIComponent(id)}`)
}
