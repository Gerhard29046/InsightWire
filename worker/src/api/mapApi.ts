import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BREAKING_PRIORITY_THRESHOLD } from './eventsApi'

export interface MapApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: MapApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface GeoReadiness {
  /** Real, exact count of currently-stored events with real lat/lng (GDACS/NASA-style connectors set this in normalize() — see supabaseRepository.ts). */
  withCoordinates: number
  /** Real, exact count of stored events with no coordinates yet — most text-only news connectors (SAnews, gov.za, WHO, UN) don't report a single point location. */
  withoutCoordinates: number
}

/**
 * Deliberately all-time, not windowed like the Dashboard summary — this
 * answers "is there enough real geo data to build a map at all," which is a
 * property of the whole dataset, not of the last 24 hours. Feeds the World
 * Map placeholder (Phase 5: prepare the component boundary and data
 * contract, do not build the map itself yet) so it's honest about readiness
 * instead of a generic "coming soon."
 */
export async function getGeoReadiness(config: MapApiConfig): Promise<GeoReadiness> {
  const supabase = client(config)

  const [withCoords, withoutCoords] = await Promise.all([
    supabase.from('normalized_events').select('*', { count: 'exact', head: true }).neq('status', 'scheduled').neq('category', 'weather').not('lat', 'is', null),
    supabase.from('normalized_events').select('*', { count: 'exact', head: true }).neq('status', 'scheduled').neq('category', 'weather').is('lat', null),
  ])

  if (withCoords.error) throw new Error(`getGeoReadiness(withCoordinates) failed: ${withCoords.error.message}`)
  if (withoutCoords.error) throw new Error(`getGeoReadiness(withoutCoordinates) failed: ${withoutCoords.error.message}`)

  return {
    withCoordinates: withCoords.count ?? 0,
    withoutCoordinates: withoutCoords.count ?? 0,
  }
}

/** "Recent," not all-time — matches the Dashboard's "no data firehose" default; an all-time view would let old routine events accumulate in country totals forever. Configurable via the `?hours=` param, same convention as GET /dashboard/summary. */
export const DEFAULT_MAP_WINDOW_HOURS = 24 * 7

/** Capped so a country with hundreds of routine coordinate-bearing weather alerts can't crowd the map with markers — see the priority_score-descending order below, which keeps the cap's slots going to breaking/significant events first. */
export const MAP_MARKER_LIMIT = 300

export interface CountryAggregate {
  country: string
  total: number
  breaking: number
  significant: number
  routine: number
}

export interface MapMarker {
  /** The event's real country value (may be 'Global' — a marker only needs coordinates, not a country, e.g. a GDACS item with geo:Point but no gdacs:country). */
  country: string
  importance: string
  priorityScore: number | null
  lat: number
  lng: number
}

export interface MapSummary {
  countries: CountryAggregate[]
  markers: MapMarker[]
  /**
   * Real count of rows with neither a usable country (`'Global'` or empty)
   * nor coordinates — reported for honesty (so the map can say "N events
   * have no known location" rather than silently omitting them) but never
   * plotted anywhere, exact-coordinate or country-shaded.
   */
  unknownCount: number
  windowHours: number
}

interface MapEventRow {
  country: string
  importance: string
  priority_score: number | null
  lat: number | null
  lng: number | null
}

/**
 * The Geographic Intelligence Map's one aggregation query — real per-country
 * totals plus a capped, priority-ordered set of exact-coordinate markers.
 * Follows GET /dashboard/summary's shape (narrow-column select, aggregate in
 * JS, every real bucket present) rather than getGeoReadiness's `head:true`
 * count-only style, because this needs the actual rows to bucket by
 * significance, not just a count.
 *
 * Country aggregation deliberately excludes `country === 'Global'` (not a
 * real place — see resolveEventGeography in @insightwire/shared) so it's
 * never shown as a shaded "country" on the map. The marker list is the
 * opposite: it includes every row with real coordinates *regardless* of
 * country value, because a marker only needs a real point, not a country
 * name (e.g. a GDACS item with geo:Point but no gdacs:country still has a
 * real, exact location worth plotting).
 *
 * breaking/significant/routine reuse existing, already-computed signals —
 * no new scoring system: `breaking` is the same `priority_score >=
 * BREAKING_PRIORITY_THRESHOLD` definition GET /dashboard/summary already
 * uses; `significant` is the existing `importance` field (`high`/`critical`)
 * for events not already counted breaking. The three are checked in that
 * order (breaking first) so they're mutually exclusive and always sum to
 * `total` per country.
 */
export async function getMapSummary(config: MapApiConfig, windowHours: number = DEFAULT_MAP_WINDOW_HOURS): Promise<MapSummary> {
  const supabase = client(config)
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('normalized_events')
    .select('country, importance, priority_score, lat, lng')
    .neq('status', 'scheduled')
    .neq('category', 'weather')
    .gte('published_at', since)

  if (error) throw new Error(`getMapSummary query failed: ${error.message}`)

  const rows = (data ?? []) as MapEventRow[]

  const countryTotals = new Map<string, CountryAggregate>()
  let unknownCount = 0

  for (const row of rows) {
    const hasCoordinates = row.lat != null && row.lng != null
    const hasCountry = !!row.country && row.country !== 'Global'

    if (!hasCountry && !hasCoordinates) {
      unknownCount += 1
    }

    if (!hasCountry) continue

    const isBreaking = (row.priority_score ?? 0) >= BREAKING_PRIORITY_THRESHOLD
    const isSignificant = !isBreaking && (row.importance === 'high' || row.importance === 'critical')

    const existing = countryTotals.get(row.country) ?? { country: row.country, total: 0, breaking: 0, significant: 0, routine: 0 }
    existing.total += 1
    if (isBreaking) existing.breaking += 1
    else if (isSignificant) existing.significant += 1
    else existing.routine += 1
    countryTotals.set(row.country, existing)
  }

  const markers = rows
    .filter((row): row is MapEventRow & { lat: number; lng: number } => row.lat != null && row.lng != null)
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    .slice(0, MAP_MARKER_LIMIT)
    .map((row) => ({ country: row.country, importance: row.importance, priorityScore: row.priority_score, lat: row.lat, lng: row.lng }))

  return {
    countries: [...countryTotals.values()],
    markers,
    unknownCount,
    windowHours,
  }
}
