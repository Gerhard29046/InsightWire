import { apiFetch } from './client'

export interface GeoReadiness {
  withCoordinates: number
  withoutCoordinates: number
}

/** GET {VITE_API_BASE_URL}/map/geo-readiness — worker/src/api/mapApi.ts. Real, exact, all-time counts of coordinate coverage — a secondary readiness stat, not the map's headline metric (see MapSummary for that). */
export function fetchGeoReadiness(): Promise<GeoReadiness> {
  return apiFetch<GeoReadiness>('/map/geo-readiness')
}

export interface CountryAggregate {
  country: string
  total: number
  breaking: number
  significant: number
  routine: number
}

export interface MapMarker {
  country: string
  importance: string
  priorityScore: number | null
  lat: number
  lng: number
}

export interface MapSummary {
  countries: CountryAggregate[]
  markers: MapMarker[]
  unknownCount: number
  windowHours: number
}

/**
 * GET {VITE_API_BASE_URL}/map/summary — worker/src/api/mapApi.ts. The
 * Geographic Intelligence Map's real data: per-country aggregates (no
 * coordinates required — a country name alone is legitimate geography) plus
 * a capped, priority-ordered set of exact-coordinate markers. Defaults to
 * the worker's 7-day window; pass `hours` to override.
 */
export function fetchMapSummary(hours?: number): Promise<MapSummary> {
  const query = hours != null ? `?hours=${hours}` : ''
  return apiFetch<MapSummary>(`/map/summary${query}`)
}
