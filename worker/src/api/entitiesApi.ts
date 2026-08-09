import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import type { EntityType, RelationshipType } from '../pipeline/entityGraph'
import type { EntityRelationshipType } from '../pipeline/ai/entityExtractionProvider'
import { fromNormalizedEventRow, type NormalizedEventRow } from '../pipeline/supabaseRepository'
import { BREAKING_PRIORITY_THRESHOLD, SELECT_COLUMNS } from './eventsApi'

export interface EntitiesApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: EntitiesApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * `topic` entities (tag-derived — see processMessage.ts's populateEntityGraph)
 * are real, but they're not the "who/what" entities a journalist investigates
 * here — excluded from the default listing/search the same way `listEvents`
 * excludes `status='scheduled'` by default: a real category, just not this
 * view's concern unless explicitly asked for via `types`.
 */
const DEFAULT_EXCLUDED_TYPE: EntityType = 'topic'

export interface EntityRecord {
  id: string
  type: EntityType
  name: string
  country: string | null
  firstSeenAt: string
  lastSeenAt: string
  /**
   * Real count of this entity's entity_event_links rows (all-time, all
   * statuses — a structural mention count, not the same as
   * EntityDetail.stats.totalEvents, which excludes scheduled events for
   * activity-reporting purposes). Optional and only populated by
   * `listEntities` (Entity Explorer's list/summary views) — the existing
   * `getEntityDetail` call sites (computeConnectedEntities,
   * fetchRelationshipEvidence) are untouched and don't set it, since that
   * page already has its own real, more precise activity numbers.
   */
  mentionCount?: number
}

interface EntityRow {
  id: string
  entity_type: EntityType
  name: string
  country: string | null
  first_seen_at: string
  last_seen_at: string
}

function fromEntityRow(row: EntityRow, mentionCount?: number): EntityRecord {
  return { id: row.id, type: row.entity_type, name: row.name, country: row.country, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, mentionCount }
}

export type ListEntitiesSort = 'recent' | 'active' | 'name'

export interface ListEntitiesQuery {
  search?: string
  types?: EntityType[]
  countries?: string[]
  cursor?: string | null
  pageSize?: number
  sort?: ListEntitiesSort
  /** ISO timestamp — only entities with last_seen_at >= this are returned. Real column, already maintained by SupabaseEntityGraphStore for every entity; not a new concept, just newly exposed as a filter. */
  activeSince?: string
}

export interface ListEntitiesResult {
  entities: EntityRecord[]
  nextCursor: string | null
  totalCount: number | null
}

function isListEntitiesSort(value: string | null): value is ListEntitiesSort {
  return value === 'recent' || value === 'active' || value === 'name'
}

export function parseListEntitiesQuery(searchParams: URLSearchParams): ListEntitiesQuery {
  const pageSizeRaw = searchParams.get('pageSize')
  const sortRaw = searchParams.get('sort')
  return {
    search: searchParams.get('q') ?? undefined,
    types: searchParams.getAll('type') as EntityType[],
    countries: searchParams.getAll('country'),
    cursor: searchParams.get('cursor'),
    pageSize: pageSizeRaw ? Number(pageSizeRaw) : 25,
    sort: isListEntitiesSort(sortRaw) ? sortRaw : 'recent',
    activeSince: searchParams.get('activeSince') ?? undefined,
  }
}

/**
 * Real cap on how many entities feed a "most active" ranking. There is no
 * stored activity/mention-count column on `entities` (adding one is a schema
 * change, out of scope for a frontend redesign) — a real ranking requires a
 * real count, computed here over a bounded, most-recently-active candidate
 * pool rather than the full table. Honest and exact at today's real scale
 * (a few hundred entities); a documented limitation at much larger scale,
 * the same trade-off already accepted for COOCCURRENCE_EVENT_WINDOW below.
 */
const ACTIVE_SORT_CANDIDATE_POOL = 300

/**
 * One real exact `count` query per entity (same `count: 'exact', head: true`
 * technique already used by getEntityDetail's own stats, run in parallel) —
 * not a single row-dump query counted client-side. That approach was tried
 * first and found live to be silently wrong: PostgREST/Postgres impose their
 * own server-side row ceiling on a plain `.select()` regardless of a
 * requested `.limit()`, so a batch whose combined real row count exceeded
 * that ceiling produced an arbitrary, order-dependent *undercount* for
 * whichever high-volume entities happened to sort later in the untruncated
 * response (found via a real live discrepancy: "United States" reported 493
 * mentions in a 5-entity batch and only 105 in a 30-entity batch). A `head:
 * true` count query has no such row-return ceiling since no rows are
 * actually returned — this is the same reason getEntityDetail's own stats
 * already use this pattern instead of counting fetched rows.
 */
async function fetchMentionCounts(supabase: SupabaseClient, entityIds: string[]): Promise<Map<string, number>> {
  if (entityIds.length === 0) return new Map()
  // InsightWire is not a weather platform — an entity whose only real
  // mentions are routine weather events (e.g. a US state linked from
  // hundreds of now-disabled NWS alerts) must not keep showing an inflated
  // mention count or dominate "most active" sort. The join+exclusion is
  // needed (not just disabling ingestion) because this counts *already-
  // stored* links, which don't disappear on their own.
  const results = await Promise.all(
    entityIds.map((id) =>
      supabase
        .from('entity_event_links')
        .select('*, normalized_events!inner(category)', { count: 'exact', head: true })
        .eq('entity_id', id)
        .neq('normalized_events.category', 'weather'),
    ),
  )
  const counts = new Map<string, number>()
  results.forEach((res, i) => {
    if (res.error) throw new Error(`fetchMentionCounts failed for entity ${entityIds[i]}: ${res.error.message}`)
    counts.set(entityIds[i], res.count ?? 0)
  })
  return counts
}

export async function listEntities(config: EntitiesApiConfig, query: ListEntitiesQuery): Promise<ListEntitiesResult> {
  const supabase = client(config)
  const pageSize = query.pageSize ?? 25
  const offset = query.cursor ? Number(query.cursor) : 0
  const sort = query.sort ?? 'recent'

  if (sort === 'active') {
    let poolQuery = supabase.from('entities').select('id, entity_type, name, country, first_seen_at, last_seen_at', { count: 'exact' }).order('last_seen_at', { ascending: false })
    if (query.types?.length) poolQuery = poolQuery.in('entity_type', query.types)
    else poolQuery = poolQuery.neq('entity_type', DEFAULT_EXCLUDED_TYPE)
    if (query.countries?.length) poolQuery = poolQuery.in('country', query.countries)
    if (query.search) poolQuery = poolQuery.ilike('name', `%${query.search}%`)
    if (query.activeSince) poolQuery = poolQuery.gte('last_seen_at', query.activeSince)

    const { data, error, count } = await poolQuery.limit(ACTIVE_SORT_CANDIDATE_POOL)
    if (error) throw new Error(`listEntities(active) query failed: ${error.message}`)

    const pool = (data ?? []) as EntityRow[]
    const mentionCounts = await fetchMentionCounts(supabase, pool.map((row) => row.id))
    const sorted = pool.map((row) => fromEntityRow(row, mentionCounts.get(row.id) ?? 0)).sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0))

    const entities = sorted.slice(offset, offset + pageSize)
    const nextCursor = offset + pageSize < sorted.length ? String(offset + pageSize) : null
    return { entities, nextCursor, totalCount: count ?? null }
  }

  let q = supabase.from('entities').select('id, entity_type, name, country, first_seen_at, last_seen_at', { count: 'exact' })
  q = sort === 'name' ? q.order('name', { ascending: true }) : q.order('last_seen_at', { ascending: false })

  if (query.types?.length) q = q.in('entity_type', query.types)
  else q = q.neq('entity_type', DEFAULT_EXCLUDED_TYPE)
  if (query.countries?.length) q = q.in('country', query.countries)
  // Matches any alias-free name substring — real search over the one real
  // name column this table has today; entities.aliases (per-name variants
  // like "Ramaphosa" / "President Ramaphosa") is future work, see the final
  // report's limitations section.
  if (query.search) q = q.ilike('name', `%${query.search}%`)
  if (query.activeSince) q = q.gte('last_seen_at', query.activeSince)

  const { data, error, count } = await q.range(offset, offset + pageSize - 1)
  if (error) throw new Error(`listEntities query failed: ${error.message}`)

  const rows = (data ?? []) as EntityRow[]
  const mentionCounts = await fetchMentionCounts(supabase, rows.map((row) => row.id))
  const entities = rows.map((row) => fromEntityRow(row, mentionCounts.get(row.id) ?? 0))
  const nextCursor = rows.length === pageSize ? String(offset + pageSize) : null
  return { entities, nextCursor, totalCount: count ?? null }
}

export interface EntityCount {
  label: string
  count: number
}

export interface ConnectedEntity {
  entity: EntityRecord
  /** Always "Appeared together" in spirit — see relationshipType's doc comment. Never a claimed formal relationship (met_with/works_for/...) without real evidence for that specific semantic, which this system does not yet have. */
  sharedEventCount: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface RelationshipEvidence {
  relatedEntity: EntityRecord
  relationshipType: EntityRelationshipType
  /** "outgoing" = this entity is the subject (entity_id) of the stored relationship; "incoming" = it's the object (related_entity_id). Both are shown — a relationship is real regardless of which side you're looking from. */
  direction: 'outgoing' | 'incoming'
  confidence: number
  evidenceSnippet: string
  evidenceEvent: { id: string; title: string; sourceUrl: string | null; publishedAt: string }
}

export interface EntityDetail {
  entity: EntityRecord
  stats: {
    totalEvents: number
    eventsLast24h: number
    eventsLast7d: number
    eventsLast30d: number
  }
  recentEvents: NormalizedEvent[]
  recentEventsNextCursor: string | null
  /** Real recent events with priority_score >= BREAKING_PRIORITY_THRESHOLD — a subset of what recentEvents could contain, fetched separately so a breaking event outside the first page of recentEvents is never missed. */
  breakingEvents: NormalizedEvent[]
  /** Real status='scheduled' events mentioning this entity — deliberately its own field, never merged into recentEvents/stats (see this function's own doc comment on why scheduled events must never inflate "activity"). */
  upcomingEvents: NormalizedEvent[]
  connectedEntities: ConnectedEntity[]
  /** Evidence-backed entity-to-entity relationships (entity_relationships) — distinct from connectedEntities (event co-occurrence only). Empty until the Gemini extraction batch has actually found and validated one; never fabricated to fill this list. */
  relationships: RelationshipEvidence[]
  countries: EntityCount[]
  sources: EntityCount[]
}

const RECENT_EVENTS_PAGE_SIZE = 20
const BREAKING_EVENTS_LIMIT = 5
const UPCOMING_EVENTS_LIMIT = 10
const RELATIONSHIPS_LIMIT = 50
const CONNECTED_ENTITIES_LIMIT = 20
/**
 * Real cap on how many of this entity's *most recent* tracked events feed
 * the "connected entities" co-occurrence computation. An earlier version of
 * this endpoint fetched every mention (no cap on the id list passed into a
 * second query's `.in()`) — for a real high-volume entity (e.g. "United
 * States", linked from hundreds of NWS alerts) that produced a request URL
 * long enough for Cloudflare/PostgREST to reject outright (HTTP 520), a real
 * bug caught by testing this exact entity live, not a hypothetical. Scoping
 * co-occurrence to the most recent N events is an honest, recency-weighted
 * simplification — still 100% real data, just windowed for the same reason
 * the Dashboard windows to 24h rather than all-time.
 */
const COOCCURRENCE_EVENT_WINDOW = 100
/** Cap on rows fetched for the countries/sources breakdown — two narrow text columns per row stays cheap at this size; a real ceiling for extreme-volume entities (see COOCCURRENCE_EVENT_WINDOW's doc comment), not a sample used to compute stats.totalEvents (that's a real exact `count` query below, unaffected by this cap). */
const BREAKDOWN_ROW_LIMIT = 3000

interface EmbeddedEventRow {
  normalized_events: NormalizedEventRow | null
}

interface BreakdownRow {
  normalized_events: { country: string; source: string } | null
}

interface CooccurrenceEventIdRow {
  event_id: string
  normalized_events: { published_at: string } | null
}

function isoSince(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

/**
 * Every stat/list here is scoped to non-`scheduled` events — the same rule
 * `listEvents`/`getDashboardSummary` already apply (see eventsApi.ts's own
 * doc comment) — asserted directly here too, since this endpoint does its
 * own queries rather than calling either of those. A scheduled event
 * mentioning an important person must never inflate that person's "recent
 * activity" the way a live/developing/resolved event legitimately does.
 *
 * `stats` come from real exact-count queries (never estimated, never derived
 * from a capped row fetch) so they stay correct even for an entity with
 * thousands of real mentions — only `countries`/`sources` (a cheap two-column
 * fetch, capped at BREAKDOWN_ROW_LIMIT) and `connectedEntities` (capped at
 * COOCCURRENCE_EVENT_WINDOW's most recent events) have a real ceiling at
 * extreme scale, both documented above.
 */
export async function getEntityDetail(
  config: EntitiesApiConfig,
  id: string,
  opts: { eventsCursor?: string | null; eventsPageSize?: number } = {},
): Promise<EntityDetail | undefined> {
  const supabase = client(config)

  const { data: entityRow, error: entityError } = await supabase
    .from('entities')
    .select('id, entity_type, name, country, first_seen_at, last_seen_at')
    .eq('id', id)
    .maybeSingle()
  if (entityError) throw new Error(`getEntityDetail(entity) failed: ${entityError.message}`)
  if (!entityRow) return undefined
  const entity = fromEntityRow(entityRow as EntityRow)

  const eventsPageSize = opts.eventsPageSize ?? RECENT_EVENTS_PAGE_SIZE
  const eventsOffset = opts.eventsCursor ? Number(opts.eventsCursor) : 0

  // Every one of these 9 queries also excludes category='weather', same
  // reasoning/placement as the status='scheduled' exclusion right next to
  // each — InsightWire is not a weather platform, and an entity's stats/
  // lists must not stay inflated by already-stored weather links (see
  // docs/decisions/0014-remove-weather-keep-natural-disasters.md).
  const mentionsBase = () =>
    supabase
      .from('entity_event_links')
      .select('*, normalized_events!inner(status, category)', { count: 'exact', head: true })
      .eq('entity_id', id)
      .neq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
  const mentionsSince = (ms: number) =>
    supabase
      .from('entity_event_links')
      .select('*, normalized_events!inner(status, published_at, category)', { count: 'exact', head: true })
      .eq('entity_id', id)
      .neq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
      .gte('normalized_events.published_at', isoSince(ms))

  const [total, last24h, last7d, last30d, breakdown, recent, cooccurrenceIds, breaking, upcoming] = await Promise.all([
    mentionsBase(),
    mentionsSince(24 * 60 * 60 * 1000),
    mentionsSince(7 * 24 * 60 * 60 * 1000),
    mentionsSince(30 * 24 * 60 * 60 * 1000),
    supabase
      .from('entity_event_links')
      .select('normalized_events!inner(country, source, status, category)')
      .eq('entity_id', id)
      .neq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
      .limit(BREAKDOWN_ROW_LIMIT),
    supabase
      .from('entity_event_links')
      .select(`normalized_events!inner(${SELECT_COLUMNS}, status)`)
      .eq('entity_id', id)
      .neq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
      .order('published_at', { foreignTable: 'normalized_events', ascending: false })
      .range(eventsOffset, eventsOffset + eventsPageSize - 1),
    supabase
      .from('entity_event_links')
      .select('event_id, normalized_events!inner(published_at, status, category)')
      .eq('entity_id', id)
      .neq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
      .order('published_at', { foreignTable: 'normalized_events', ascending: false })
      .limit(COOCCURRENCE_EVENT_WINDOW),
    supabase
      .from('entity_event_links')
      .select(`normalized_events!inner(${SELECT_COLUMNS}, status)`)
      .eq('entity_id', id)
      .neq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
      .gte('normalized_events.priority_score', BREAKING_PRIORITY_THRESHOLD)
      .order('priority_score', { foreignTable: 'normalized_events', ascending: false })
      .limit(BREAKING_EVENTS_LIMIT),
    supabase
      .from('entity_event_links')
      .select(`normalized_events!inner(${SELECT_COLUMNS}, status)`)
      .eq('entity_id', id)
      .eq('normalized_events.status', 'scheduled')
      .neq('normalized_events.category', 'weather')
      .order('start_time', { foreignTable: 'normalized_events', ascending: true })
      .limit(UPCOMING_EVENTS_LIMIT),
  ])

  if (total.error) throw new Error(`getEntityDetail(total) failed: ${total.error.message}`)
  if (last24h.error) throw new Error(`getEntityDetail(last24h) failed: ${last24h.error.message}`)
  if (last7d.error) throw new Error(`getEntityDetail(last7d) failed: ${last7d.error.message}`)
  if (last30d.error) throw new Error(`getEntityDetail(last30d) failed: ${last30d.error.message}`)
  if (breakdown.error) throw new Error(`getEntityDetail(breakdown) failed: ${breakdown.error.message}`)
  if (recent.error) throw new Error(`getEntityDetail(recentEvents) failed: ${recent.error.message}`)
  if (cooccurrenceIds.error) throw new Error(`getEntityDetail(cooccurrenceIds) failed: ${cooccurrenceIds.error.message}`)
  if (breaking.error) throw new Error(`getEntityDetail(breakingEvents) failed: ${breaking.error.message}`)
  if (upcoming.error) throw new Error(`getEntityDetail(upcomingEvents) failed: ${upcoming.error.message}`)

  const countryCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()
  for (const row of (breakdown.data ?? []) as unknown as BreakdownRow[]) {
    if (!row.normalized_events) continue
    countryCounts.set(row.normalized_events.country, (countryCounts.get(row.normalized_events.country) ?? 0) + 1)
    sourceCounts.set(row.normalized_events.source, (sourceCounts.get(row.normalized_events.source) ?? 0) + 1)
  }
  const toSortedCounts = (map: Map<string, number>): EntityCount[] =>
    [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)

  const recentEvents = ((recent.data ?? []) as unknown as EmbeddedEventRow[])
    .map((row) => row.normalized_events)
    .filter((row): row is NormalizedEventRow => row !== null)
    .map((row) => fromNormalizedEventRow(row, []))
  const recentEventsNextCursor = recentEvents.length === eventsPageSize ? String(eventsOffset + eventsPageSize) : null

  const cooccurrenceRows = (cooccurrenceIds.data ?? []) as unknown as CooccurrenceEventIdRow[]
  const publishedAtByEventId = new Map<string, string>(cooccurrenceRows.filter((r) => r.normalized_events).map((r) => [r.event_id, r.normalized_events!.published_at]))
  const connectedEntities = await computeConnectedEntities(supabase, id, [...publishedAtByEventId.keys()], publishedAtByEventId)
  const relationships = await fetchRelationshipEvidence(supabase, id)

  const mapEmbedded = (rows: unknown): NormalizedEvent[] =>
    (rows as EmbeddedEventRow[])
      .map((row) => row.normalized_events)
      .filter((row): row is NormalizedEventRow => row !== null)
      .map((row) => fromNormalizedEventRow(row, []))

  return {
    entity,
    stats: { totalEvents: total.count ?? 0, eventsLast24h: last24h.count ?? 0, eventsLast7d: last7d.count ?? 0, eventsLast30d: last30d.count ?? 0 },
    recentEvents,
    recentEventsNextCursor,
    breakingEvents: mapEmbedded(breaking.data ?? []),
    upcomingEvents: mapEmbedded(upcoming.data ?? []),
    connectedEntities,
    relationships,
    countries: toSortedCounts(countryCounts),
    sources: toSortedCounts(sourceCounts),
  }
}

interface OtherLinkRow {
  entity_id: string
  event_id: string
  entities: { id: string; entity_type: EntityType; name: string; country: string | null; first_seen_at: string; last_seen_at: string } | null
}

/**
 * "Connected entities" = other real entities that share at least one of this
 * entity's `COOCCURRENCE_EVENT_WINDOW` most-recent real, non-scheduled events
 * — computed fresh from `entity_event_links` every call (see the migration's
 * own doc comment for why there's no separately-maintained relationship
 * table to go stale). `sharedEventCount`/`firstSeenAt`/`lastSeenAt` are all
 * derived from the actual shared events' own real `published_at` values
 * (passed in via `publishedAtByEventId`, already fetched by the caller —
 * never a second round trip for dates only, and never fabricated/estimated).
 */
async function computeConnectedEntities(
  supabase: SupabaseClient,
  entityId: string,
  eventIds: string[],
  publishedAtByEventId: Map<string, string>,
): Promise<ConnectedEntity[]> {
  // No separate category filter needed here: `eventIds` comes from the
  // caller's `cooccurrenceIds` query, which already excludes weather — a
  // weather-linked event can never appear in this list to begin with.
  if (eventIds.length === 0) return []

  const { data, error } = await supabase
    .from('entity_event_links')
    .select('entity_id, event_id, entities!inner(id, entity_type, name, country, first_seen_at, last_seen_at)')
    .in('event_id', eventIds)
    .neq('entity_id', entityId)
    // Same exclusion as the default /entities listing (DEFAULT_EXCLUDED_TYPE) —
    // tag-derived topics are real, but they're not "who/what" entities a
    // journalist investigates, and the frontend's entity-type metadata has no
    // rendering for them (a real bug this filter also prevents, found live
    // against "United States", whose most-recent events are dominated by NWS
    // alert-type topics like "Heat Advisory").
    .neq('entities.entity_type', DEFAULT_EXCLUDED_TYPE)
  if (error) throw new Error(`computeConnectedEntities failed: ${error.message}`)

  const rows = (data ?? []) as unknown as OtherLinkRow[]
  const byEntity = new Map<string, { entity: EntityRecord; eventIds: Set<string> }>()
  for (const row of rows) {
    if (!row.entities) continue
    const existing = byEntity.get(row.entity_id)
    if (existing) existing.eventIds.add(row.event_id)
    else byEntity.set(row.entity_id, { entity: fromEntityRow(row.entities), eventIds: new Set([row.event_id]) })
  }

  return [...byEntity.values()]
    .map(({ entity, eventIds: sharedIds }) => {
      const dates = [...sharedIds].map((id) => publishedAtByEventId.get(id)).filter((d): d is string => Boolean(d))
      const sorted = dates.sort()
      return {
        entity,
        sharedEventCount: sharedIds.size,
        firstSeenAt: sorted[0] ?? entity.firstSeenAt,
        lastSeenAt: sorted[sorted.length - 1] ?? entity.lastSeenAt,
      }
    })
    .sort((a, b) => b.sharedEventCount - a.sharedEventCount)
    .slice(0, CONNECTED_ENTITIES_LIMIT)
}

interface EntityRelationshipRow {
  entity_id: string
  related_entity_id: string
  relationship_type: EntityRelationshipType
  confidence: number
  evidence_snippet: string
  evidence_event_id: string
}

/**
 * Real evidence-backed entity-to-entity relationships (`entity_relationships`
 * — distinct from co-occurrence-only `connectedEntities` above). Two extra
 * lookups (the "other" entity on each row, and each row's real supporting
 * event) rather than a single embedded-join query: `entity_relationships`
 * has two foreign keys into `entities` (`entity_id`/`related_entity_id`),
 * and PostgREST needs an explicit FK-name hint to embed through either
 * ambiguously-named one — two plain `.in()` lookups avoid that complexity
 * entirely and are cheap at the row counts this table has today.
 */
async function fetchRelationshipEvidence(supabase: SupabaseClient, id: string): Promise<RelationshipEvidence[]> {
  const { data, error } = await supabase
    .from('entity_relationships')
    .select('entity_id, related_entity_id, relationship_type, confidence, evidence_snippet, evidence_event_id')
    .or(`entity_id.eq.${id},related_entity_id.eq.${id}`)
    .order('confidence', { ascending: false })
    .limit(RELATIONSHIPS_LIMIT)
  if (error) throw new Error(`fetchRelationshipEvidence failed: ${error.message}`)

  const rows = (data ?? []) as EntityRelationshipRow[]
  if (rows.length === 0) return []

  const otherEntityIds = [...new Set(rows.map((r) => (r.entity_id === id ? r.related_entity_id : r.entity_id)))]
  const evidenceEventIds = [...new Set(rows.map((r) => r.evidence_event_id))]

  const [otherEntities, evidenceEvents] = await Promise.all([
    supabase.from('entities').select('id, entity_type, name, country, first_seen_at, last_seen_at').in('id', otherEntityIds),
    // Excluding weather here means a relationship whose only evidence is a
    // weather event naturally drops out below (evidenceEvent lookup misses,
    // and the final .filter() already discards rows with no evidence event)
    // — no separate branch needed for "this relationship is weather-tainted."
    supabase.from('normalized_events').select('id, title, source_url, published_at').neq('category', 'weather').in('id', evidenceEventIds),
  ])
  if (otherEntities.error) throw new Error(`fetchRelationshipEvidence(entities) failed: ${otherEntities.error.message}`)
  if (evidenceEvents.error) throw new Error(`fetchRelationshipEvidence(events) failed: ${evidenceEvents.error.message}`)

  const entityById = new Map<string, EntityRecord>(((otherEntities.data ?? []) as EntityRow[]).map((r) => [r.id, fromEntityRow(r)]))
  const eventById = new Map<string, { id: string; title: string; sourceUrl: string | null; publishedAt: string }>(
    ((evidenceEvents.data ?? []) as { id: string; title: string; source_url: string | null; published_at: string }[]).map((r) => [
      r.id,
      { id: r.id, title: r.title, sourceUrl: r.source_url, publishedAt: r.published_at },
    ]),
  )

  return rows
    .map((row): RelationshipEvidence | null => {
      const otherId = row.entity_id === id ? row.related_entity_id : row.entity_id
      const relatedEntity = entityById.get(otherId)
      const evidenceEvent = eventById.get(row.evidence_event_id)
      if (!relatedEntity || !evidenceEvent) return null
      return {
        relatedEntity,
        relationshipType: row.relationship_type,
        direction: row.entity_id === id ? 'outgoing' : 'incoming',
        confidence: row.confidence,
        evidenceSnippet: row.evidence_snippet,
        evidenceEvent,
      }
    })
    .filter((r): r is RelationshipEvidence => r !== null)
}

export type { EntityType, RelationshipType }
