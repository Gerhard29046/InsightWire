import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { fromNormalizedEventRow, type ConfirmingSourceRow, type NormalizedEventRow } from '../pipeline/supabaseRepository'
import type { Repository } from '../pipeline/repository'
import { getTimeline } from '../pipeline/timeline'

/**
 * The read side of the Intelligence API — deliberately separate from
 * `Repository` (worker/src/pipeline/repository.ts), which is scoped to the
 * ingestion pipeline's write/get-by-id needs and whose interface Phase 7
 * explicitly required stay unchanged. Rich filtering/pagination/sorting for
 * a public list endpoint is a different concern with a different shape;
 * bolting it onto `Repository` would blur what that interface is for.
 * Uses the same row type/mapper as `SupabaseRepository` (imported, not
 * duplicated) so both stay in sync with the schema automatically.
 */
export interface EventsApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: EventsApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

const SELECT_COLUMNS =
  'id, title, description, summary, country, city, lat, lng, category, source, source_url, start_time, end_time, published_at, updated_at, importance, confidence, verification_status, language, people, organizations, keywords, tags, status, source_trust_score, priority_score'

export type EventSortMode = 'latest' | 'importance' | 'trending' | 'confidence' | 'recently-updated' | 'upcoming'

/**
 * "Breaking/emerging" has no dedicated column — defined here as
 * priority_score >= 60 (the Priority Engine already folds freshness,
 * source trust, and confirming-source count into that one number; see
 * docs/decisions/0006-intelligence-quality.md). A documented operational
 * definition, not a fabricated new signal.
 */
export const BREAKING_PRIORITY_THRESHOLD = 60

export interface ListEventsQuery {
  search?: string
  countries?: string[]
  cities?: string[]
  categories?: string[]
  importance?: string[]
  languages?: string[]
  sources?: string[]
  statuses?: string[]
  verifiedOnly?: boolean
  liveOnly?: boolean
  futureOnly?: boolean
  breakingOnly?: boolean
  minSourceTrust?: number
  minConfidence?: number
  dateFrom?: string
  dateTo?: string
  timeRange?: 'any' | '1h' | '24h' | '7d' | '30d'
  sort?: EventSortMode
  cursor?: string | null
  pageSize?: number
}

export interface ListEventsResult {
  events: NormalizedEvent[]
  nextCursor: string | null
  /** Exact count of rows matching the filters (not just this page) — real, from PostgREST's `count: 'exact'`, never estimated or guessed. */
  totalCount: number | null
}

/** Parses the exact query-string shape src/lib/api/events.ts's fetchEventsViaApi sends, plus the new Phase 8 params. */
export function parseListEventsQuery(searchParams: URLSearchParams): ListEventsQuery {
  const pageSizeRaw = searchParams.get('pageSize')
  const minSourceTrustRaw = searchParams.get('minSourceTrust')
  const minConfidenceRaw = searchParams.get('minConfidence')
  return {
    search: searchParams.get('q') ?? undefined,
    countries: searchParams.getAll('country'),
    cities: searchParams.getAll('city'),
    categories: searchParams.getAll('category'),
    importance: searchParams.getAll('importance'),
    languages: searchParams.getAll('language'),
    sources: searchParams.getAll('source'),
    statuses: searchParams.getAll('status'),
    verifiedOnly: searchParams.get('verified') === 'true',
    liveOnly: searchParams.get('live') === 'true',
    futureOnly: searchParams.get('future') === 'true',
    breakingOnly: searchParams.get('breaking') === 'true',
    minSourceTrust: minSourceTrustRaw ? Number(minSourceTrustRaw) : undefined,
    minConfidence: minConfidenceRaw ? Number(minConfidenceRaw) : undefined,
    dateFrom: searchParams.get('from') ?? undefined,
    dateTo: searchParams.get('to') ?? undefined,
    timeRange: (searchParams.get('timeRange') as ListEventsQuery['timeRange']) ?? 'any',
    sort: (searchParams.get('sort') as EventSortMode) ?? 'latest',
    cursor: searchParams.get('cursor'),
    pageSize: pageSizeRaw ? Number(pageSizeRaw) : 25,
  }
}

function sortColumn(sort: EventSortMode = 'latest'): { column: string; ascending: boolean } {
  switch (sort) {
    case 'importance':
    // No real "trending"/velocity signal exists yet — priority_score is the
    // closest honest proxy rather than inventing one (see BREAKING_PRIORITY_THRESHOLD).
    case 'trending':
      return { column: 'priority_score', ascending: false }
    case 'confidence':
      return { column: 'confidence', ascending: false }
    case 'recently-updated':
      return { column: 'updated_at', ascending: false }
    // Calendar's natural order: soonest scheduled event first, not most recently published.
    case 'upcoming':
      return { column: 'start_time', ascending: true }
    case 'latest':
    default:
      return { column: 'published_at', ascending: false }
  }
}

function timeRangeToFromDate(range: ListEventsQuery['timeRange']): string | null {
  if (!range || range === 'any') return null
  const hours = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[range]
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

/**
 * No filter is applied for "region" (a frontend-only geographic grouping —
 * NormalizedEvent has no region field and no country->region mapping table
 * exists) — an honest no-op, same gap already documented for the direct-
 * Supabase path this replaces (docs/decisions/0008-frontend-preview.md).
 */
export async function listEvents(config: EventsApiConfig, query: ListEventsQuery): Promise<ListEventsResult> {
  const supabase = client(config)
  const pageSize = query.pageSize ?? 25
  const offset = query.cursor ? Number(query.cursor) : 0
  const { column, ascending } = sortColumn(query.sort)

  let q = supabase
    .from('normalized_events')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .order(column, { ascending, nullsFirst: false })

  if (query.search) q = q.or(`title.ilike.%${query.search}%,description.ilike.%${query.search}%`)
  if (query.countries?.length) q = q.in('country', query.countries)
  if (query.cities?.length) q = q.in('city', query.cities)
  if (query.categories?.length) q = q.in('category', query.categories)
  if (query.importance?.length) q = q.in('importance', query.importance)
  if (query.languages?.length) q = q.in('language', query.languages)
  if (query.sources?.length) q = q.in('source', query.sources)
  // The Global Events Feed ("what's happening right now") and the Calendar
  // ("what's scheduled to happen") read the same table but must never blend:
  // a newly-discovered scheduled event has a recent published_at (it was
  // just ingested) even though the event itself is weeks away, so without
  // this it would sort to the top of "latest" looking like breaking news.
  // 'scheduled' rows are therefore excluded by default and only surfaced
  // when a caller explicitly asks for them via `statuses` (the Calendar's
  // own query always does).
  if (query.statuses?.length) q = q.in('status', query.statuses)
  else q = q.neq('status', 'scheduled')
  if (query.verifiedOnly) q = q.eq('verification_status', 'verified')
  if (query.liveOnly) q = q.eq('status', 'live')
  if (query.futureOnly) q = q.gt('start_time', new Date().toISOString())
  if (query.breakingOnly) q = q.gte('priority_score', BREAKING_PRIORITY_THRESHOLD)
  if (query.minSourceTrust != null && !Number.isNaN(query.minSourceTrust)) q = q.gte('source_trust_score', query.minSourceTrust)
  if (query.minConfidence != null && !Number.isNaN(query.minConfidence)) q = q.gte('confidence', query.minConfidence)
  if (query.dateFrom) q = q.gte('published_at', query.dateFrom)
  if (query.dateTo) q = q.lte('published_at', query.dateTo)
  const timeRangeFrom = timeRangeToFromDate(query.timeRange)
  if (timeRangeFrom) q = q.gte('published_at', timeRangeFrom)

  const { data, error, count } = await q.range(offset, offset + pageSize - 1)
  if (error) throw new Error(`listEvents query failed: ${error.message}`)

  const rows = (data ?? []) as NormalizedEventRow[]
  const events = rows.map((row) => fromNormalizedEventRow(row, []))
  const nextCursor = rows.length === pageSize ? String(offset + pageSize) : null

  return { events, nextCursor, totalCount: count ?? null }
}

const RELATED_EVENTS_LIMIT = 5

export interface EventDetail {
  event: NormalizedEvent
  timeline: { at: string; label: string }[]
  /** Same shape as event.confirmingSources — repeated here for a detail-page client that doesn't want to reach into the nested field. */
  sources: NormalizedEvent['confirmingSources']
  /**
   * "Same category + same country, excluding itself" — a deterministic,
   * documented heuristic, not a knowledge-graph feature. Real relationship
   * data (event_relationships table) doesn't exist yet (Phase 10, see
   * docs/decisions/0006-intelligence-quality.md) — this is a stand-in, not
   * a claim of curated relatedness.
   */
  relatedEvents: NormalizedEvent[]
}

export async function getEventDetail(config: EventsApiConfig, repository: Repository, id: string): Promise<EventDetail | undefined> {
  const event = await repository.getNormalizedEvent(id)
  if (!event) return undefined

  const timeline = await getTimeline(repository, id)

  const supabase = client(config)
  const { data, error } = await supabase
    .from('normalized_events')
    .select(SELECT_COLUMNS)
    .eq('category', event.category)
    .eq('country', event.country)
    .neq('id', id)
    .order('published_at', { ascending: false })
    .limit(RELATED_EVENTS_LIMIT)
  if (error) throw new Error(`getEventDetail related-events query failed: ${error.message}`)

  const relatedRows = (data ?? []) as NormalizedEventRow[]
  const relatedEvents = relatedRows.map((row) => fromNormalizedEventRow(row, [] as ConfirmingSourceRow[]))

  return { event, timeline, sources: event.confirmingSources, relatedEvents }
}
