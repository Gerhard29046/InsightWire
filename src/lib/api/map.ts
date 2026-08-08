import { apiFetch } from './client'

export interface GeoReadiness {
  withCoordinates: number
  withoutCoordinates: number
}

/** GET {VITE_API_BASE_URL}/map/geo-readiness — worker/src/api/mapApi.ts. Real, exact, all-time counts — feeds the World Map placeholder's readiness note, not a map itself. */
export function fetchGeoReadiness(): Promise<GeoReadiness> {
  return apiFetch<GeoReadiness>('/map/geo-readiness')
}
