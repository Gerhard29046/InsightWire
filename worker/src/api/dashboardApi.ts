import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_IDS, type CategoryId, type NormalizedEvent } from '@insightwire/shared'
import { fromNormalizedEventRow, type NormalizedEventRow } from '../pipeline/supabaseRepository'
import { BREAKING_PRIORITY_THRESHOLD, SELECT_COLUMNS } from './eventsApi'

export interface DashboardApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: DashboardApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Default reporting window — "last 24 hours," matching the labeling on every Dashboard stat card. */
export const DEFAULT_WINDOW_HOURS = 24
const HIGHEST_SIGNAL_LIMIT = 6

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
  /** Real wall-clock time this summary was computed — the frontend's "Updated Xs ago" is derived from this, never a fabricated/optimistic timestamp. */
  generatedAt: string
}

interface DiversityRow {
  country: string
  source: string
  category: string
}

/**
 * The Dashboard's one real aggregation query set — every number here is
 * computed directly from `normalized_events`, the same table and the same
 * deduplicated/merged rows `GET /events` (eventsApi.ts) reads. Nothing here
 * is sampled or approximated: `eventsTracked24h`/`highPriorityAlerts24h` are
 * exact PostgREST `count: 'exact'` results, and `countriesReporting`/
 * `sourcesReporting`/`categoryBreakdown` are computed from every matching
 * row's `country`/`source`/`category` in the window (not a capped sample —
 * an earlier version of the Dashboard capped this at 200 rows, which could
 * undercount diversity once the real dataset grew past that; fetching only
 * three narrow columns for the window keeps this cheap even at real scale).
 *
 * Every query explicitly excludes `status = 'scheduled'` — the Dashboard is
 * a live-intelligence overview ("what's happening"), never a preview of the
 * Calendar's future-dated events, matching the same exclusion `listEvents`
 * already applies by default (see docs/decisions/0012's "Correction"
 * section) — asserted here directly rather than relied on implicitly, since
 * this endpoint does its own queries rather than calling `listEvents`.
 */
export async function getDashboardSummary(
  config: DashboardApiConfig,
  windowHours: number = DEFAULT_WINDOW_HOURS,
): Promise<DashboardSummary> {
  const supabase = client(config)
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  const [tracked, highPriority, diversity, top] = await Promise.all([
    supabase.from('normalized_events').select('*', { count: 'exact', head: true }).neq('status', 'scheduled').gte('published_at', since),
    supabase
      .from('normalized_events')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'scheduled')
      .gte('published_at', since)
      .gte('priority_score', BREAKING_PRIORITY_THRESHOLD),
    supabase.from('normalized_events').select('country, source, category').neq('status', 'scheduled').gte('published_at', since),
    supabase
      .from('normalized_events')
      .select(SELECT_COLUMNS)
      .neq('status', 'scheduled')
      .gte('published_at', since)
      .order('priority_score', { ascending: false, nullsFirst: false })
      .limit(HIGHEST_SIGNAL_LIMIT),
  ])

  if (tracked.error) throw new Error(`getDashboardSummary(eventsTracked24h) failed: ${tracked.error.message}`)
  if (highPriority.error) throw new Error(`getDashboardSummary(highPriorityAlerts24h) failed: ${highPriority.error.message}`)
  if (diversity.error) throw new Error(`getDashboardSummary(diversity) failed: ${diversity.error.message}`)
  if (top.error) throw new Error(`getDashboardSummary(highestSignalEvents) failed: ${top.error.message}`)

  const diversityRows = (diversity.data ?? []) as DiversityRow[]
  const countriesReporting = new Set(diversityRows.map((r) => r.country)).size
  const sourcesReporting = new Set(diversityRows.map((r) => r.source)).size

  // Every real category starts at 0 — a category with no real events this
  // window stays at 0 rather than being silently omitted, so "Signal by
  // category" never implies a category wasn't checked.
  const counts = new Map<CategoryId, number>(CATEGORY_IDS.map((c) => [c, 0]))
  for (const row of diversityRows) {
    const category = row.category as CategoryId
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const categoryBreakdown: CategoryCount[] = CATEGORY_IDS.map((category) => ({ category, count: counts.get(category) ?? 0 }))

  const topRows = (top.data ?? []) as NormalizedEventRow[]
  const highestSignalEvents = topRows.map((row) => fromNormalizedEventRow(row, []))

  return {
    eventsTracked24h: tracked.count ?? 0,
    highPriorityAlerts24h: highPriority.count ?? 0,
    countriesReporting,
    sourcesReporting,
    categoryBreakdown,
    highestSignalEvents,
    generatedAt: new Date().toISOString(),
  }
}
