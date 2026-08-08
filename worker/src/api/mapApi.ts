import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
    supabase.from('normalized_events').select('*', { count: 'exact', head: true }).neq('status', 'scheduled').not('lat', 'is', null),
    supabase.from('normalized_events').select('*', { count: 'exact', head: true }).neq('status', 'scheduled').is('lat', null),
  ])

  if (withCoords.error) throw new Error(`getGeoReadiness(withCoordinates) failed: ${withCoords.error.message}`)
  if (withoutCoords.error) throw new Error(`getGeoReadiness(withoutCoordinates) failed: ${withoutCoords.error.message}`)

  return {
    withCoordinates: withCoords.count ?? 0,
    withoutCoordinates: withoutCoords.count ?? 0,
  }
}
