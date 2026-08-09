import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDefaultRegistry } from '../index'
import { createDefaultTrustRegistry, type SourceCategory } from '../pipeline/trust'

export interface AdminApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: AdminApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * The real, static registry of every connector this Worker knows about
 * (id/name/type/refreshIntervalMs/supportedCountries/supportedCategories) —
 * cheap to construct (just instantiates connector classes, no I/O), same
 * "construct fresh, don't pool" reasoning already used for
 * repository/entityGraphStore selection elsewhere in this codebase.
 */
function registry() {
  return createDefaultRegistry()
}

const trustRegistry = createDefaultTrustRegistry()

// ---------------------------------------------------------------------------
// Audit log — written by every real admin mutation in this file and in
// configApi.ts/moderationApi.ts/legalApi.ts. Never backfilled with
// fabricated history (see migration's own doc comment).
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string
  actor: string
  action: string
  resourceType: string
  resourceId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

interface AuditLogRow {
  id: string
  actor: string
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/** Called by every real mutation below (and by configApi.ts/moderationApi.ts/legalApi.ts) — the one place a row is ever written, so the log can never drift from what actually happened. `actor` is WORKSPACE_USER_ID today (see workspaceApi.ts) since no real auth exists yet — swapped for a real authenticated actor id the moment it does. */
export async function recordAuditEntry(
  config: AdminApiConfig,
  entry: { actor: string; action: string; resourceType: string; resourceId?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase.from('admin_audit_log').insert({
    actor: entry.actor,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
  })
  if (error) throw new Error(`recordAuditEntry failed: ${error.message}`)
}

const AUDIT_LOG_LIMIT = 200

export async function listAuditLog(config: AdminApiConfig): Promise<AuditLogEntry[]> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, actor, action, resource_type, resource_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(AUDIT_LOG_LIMIT)
  if (error) throw new Error(`listAuditLog failed: ${error.message}`)
  return ((data ?? []) as AuditLogRow[]).map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    metadata: r.metadata,
    createdAt: r.created_at,
  }))
}

// ---------------------------------------------------------------------------
// Sources — real rows from `sources`, joined with real event counts
// (normalized_events) and real run history (connector_runs). Enable/disable
// actually changes ingestion behavior — see ConnectorManager.collectDue's
// `disabledIds` parameter and worker.ts's scheduled() handler, which is what
// this function's write path is really gating.
// ---------------------------------------------------------------------------

interface SourceRow {
  id: string
  name: string
  description: string
  type: string
  version: string
  refresh_interval_ms: number
  enabled: boolean
  country: string | null
  category: string | null
  language: string
  feed_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SourceRecord {
  id: string
  name: string
  description: string
  type: string
  version: string
  refreshIntervalMs: number
  enabled: boolean
  country: string | null
  category: string | null
  language: string
  feedUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  eventCount: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastStatus: 'success' | 'partial' | 'failed' | null
  lastError: string | null
  /** Real, existing signal from the Priority Engine's Source Trust Registry (worker/src/pipeline/trust.ts) — never a newly-invented score. */
  trustCategory: SourceCategory
  trustScore: number
}

interface ConnectorRunSummaryRow {
  source_id: string
  status: string
  started_at: string
  sample_errors: string[]
}

const RUN_HISTORY_SCAN_LIMIT = 2000

async function fetchRunSummaries(supabase: SupabaseClient): Promise<Map<string, { lastSuccessAt: string | null; lastFailureAt: string | null; lastStatus: string | null; lastError: string | null; lastAt: string | null }>> {
  const { data, error } = await supabase
    .from('connector_runs')
    .select('source_id, status, started_at, sample_errors')
    .order('started_at', { ascending: false })
    .limit(RUN_HISTORY_SCAN_LIMIT)
  if (error) throw new Error(`fetchRunSummaries failed: ${error.message}`)

  const result = new Map<string, { lastSuccessAt: string | null; lastFailureAt: string | null; lastStatus: string | null; lastError: string | null; lastAt: string | null }>()
  for (const row of (data ?? []) as ConnectorRunSummaryRow[]) {
    const existing = result.get(row.source_id) ?? { lastSuccessAt: null, lastFailureAt: null, lastStatus: null, lastError: null, lastAt: null }
    if (!existing.lastAt) {
      existing.lastAt = row.started_at
      existing.lastStatus = row.status
      if (row.status === 'failed') existing.lastError = row.sample_errors[0] ?? null
    }
    if ((row.status === 'success' || row.status === 'partial') && !existing.lastSuccessAt) existing.lastSuccessAt = row.started_at
    if (row.status === 'failed' && !existing.lastFailureAt) {
      existing.lastFailureAt = row.started_at
      if (!existing.lastError) existing.lastError = row.sample_errors[0] ?? null
    }
    result.set(row.source_id, existing)
  }
  return result
}

async function fetchEventCounts(supabase: SupabaseClient, sourceIds: string[]): Promise<Map<string, number>> {
  const counts = await Promise.all(
    sourceIds.map((id) => supabase.from('normalized_events').select('*', { count: 'exact', head: true }).eq('source_id', id)),
  )
  const map = new Map<string, number>()
  counts.forEach((res, i) => {
    if (res.error) throw new Error(`fetchEventCounts failed for "${sourceIds[i]}": ${res.error.message}`)
    map.set(sourceIds[i], res.count ?? 0)
  })
  return map
}

export async function listSources(config: AdminApiConfig): Promise<SourceRecord[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('sources').select('*').order('id')
  if (error) throw new Error(`listSources failed: ${error.message}`)
  const rows = (data ?? []) as SourceRow[]

  const [runSummaries, eventCounts] = await Promise.all([
    fetchRunSummaries(supabase),
    fetchEventCounts(supabase, rows.map((r) => r.id)),
  ])

  return rows.map((row): SourceRecord => {
    const runs = runSummaries.get(row.id)
    const trust = trustRegistry.getProfile(row.id)
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      version: row.version,
      refreshIntervalMs: row.refresh_interval_ms,
      enabled: row.enabled,
      country: row.country,
      category: row.category,
      language: row.language,
      feedUrl: row.feed_url,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      eventCount: eventCounts.get(row.id) ?? 0,
      lastSuccessAt: runs?.lastSuccessAt ?? null,
      lastFailureAt: runs?.lastFailureAt ?? null,
      lastStatus: (runs?.lastStatus as SourceRecord['lastStatus']) ?? null,
      lastError: runs?.lastError ?? null,
      trustCategory: trust.category,
      trustScore: trust.trustScore,
    }
  })
}

export interface UpdateSourcePatch {
  enabled?: boolean
  country?: string | null
  category?: string | null
  language?: string
  notes?: string | null
}

export async function updateSource(config: AdminApiConfig, id: string, patch: UpdateSourcePatch, actor: string): Promise<SourceRecord | undefined> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('sources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`updateSource failed: ${error.message}`)
  if (!data) return undefined

  await recordAuditEntry(config, {
    actor,
    action: patch.enabled === true ? 'source.enabled' : patch.enabled === false ? 'source.disabled' : 'source.edited',
    resourceType: 'source',
    resourceId: id,
    metadata: patch as Record<string, unknown>,
  })

  const [sources, runSummaries, eventCounts] = await Promise.all([
    Promise.resolve([data as SourceRow]),
    fetchRunSummaries(supabase),
    fetchEventCounts(supabase, [id]),
  ])
  const row = sources[0]
  const runs = runSummaries.get(id)
  const trust = trustRegistry.getProfile(id)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    version: row.version,
    refreshIntervalMs: row.refresh_interval_ms,
    enabled: row.enabled,
    country: row.country,
    category: row.category,
    language: row.language,
    feedUrl: row.feed_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventCount: eventCounts.get(id) ?? 0,
    lastSuccessAt: runs?.lastSuccessAt ?? null,
    lastFailureAt: runs?.lastFailureAt ?? null,
    lastStatus: (runs?.lastStatus as SourceRecord['lastStatus']) ?? null,
    lastError: runs?.lastError ?? null,
    trustCategory: trust.category,
    trustScore: trust.trustScore,
  }
}

export interface SourceTestResult {
  connectorId: string
  healthy: boolean
  message?: string
  checkedAt: string
}

/** A real, live network health check against the source's actual feed URL — the same `healthCheck()` every connector already implements (HEAD-then-GET, see RssConnector.ts) — never a fabricated "OK". */
export async function testSource(id: string): Promise<SourceTestResult | undefined> {
  const connector = registry().get(id)
  if (!connector) return undefined
  const result = await connector.healthCheck()
  return { connectorId: id, healthy: result.healthy, message: result.message, checkedAt: result.checkedAt }
}

export async function fetchDisabledSourceIds(config: AdminApiConfig): Promise<Set<string>> {
  const supabase = client(config)
  const { data, error } = await supabase.from('sources').select('id').eq('enabled', false)
  if (error) throw new Error(`fetchDisabledSourceIds failed: ${error.message}`)
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}

// ---------------------------------------------------------------------------
// Overview — system health, ingestion status, pipeline health. Every value
// either comes from a real query or is explicitly marked as not monitored;
// nothing here is a placeholder number.
// ---------------------------------------------------------------------------

export interface DatabaseStatus {
  connected: boolean
  error?: string
}

async function checkDatabaseConnection(supabase: SupabaseClient): Promise<DatabaseStatus> {
  const { error } = await supabase.from('sources').select('id', { count: 'exact', head: true })
  return error ? { connected: false, error: error.message } : { connected: true }
}

export interface PipelineStageHealth {
  stage: string
  status: 'healthy' | 'warning' | 'error' | 'not_monitored'
  detail: string
}

const STALE_INGESTION_THRESHOLD_MS = 6 * 60 * 60 * 1000

export interface AdminOverview {
  database: DatabaseStatus
  ingestion: {
    activeSources: number
    totalSources: number
    connectorsRegistered: number
    lastSuccessfulRunAt: string | null
    lastFailedRunAt: string | null
    lastError: string | null
    failedRunsLast24h: number
    eventsIngestedTotal: number
    eventsIngestedLast24h: number
  }
  services: {
    supabaseConfigured: boolean
    geminiConfigured: boolean
    anthropicConfigured: boolean
  }
  pipeline: PipelineStageHealth[]
}

export async function getOverview(config: AdminApiConfig, services: { geminiConfigured: boolean; anthropicConfigured: boolean }): Promise<AdminOverview> {
  const supabase = client(config)

  const [database, sourcesRes, runsRes, eventsTotalRes, events24hRes, entityExtractionsRes] = await Promise.all([
    checkDatabaseConnection(supabase),
    supabase.from('sources').select('id, enabled'),
    supabase.from('connector_runs').select('source_id, status, started_at, sample_errors').order('started_at', { ascending: false }).limit(RUN_HISTORY_SCAN_LIMIT),
    supabase.from('normalized_events').select('id', { count: 'exact', head: true }),
    supabase.from('normalized_events').select('id', { count: 'exact', head: true }).gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('entity_extractions').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  if (sourcesRes.error) throw new Error(`getOverview(sources) failed: ${sourcesRes.error.message}`)
  if (runsRes.error) throw new Error(`getOverview(runs) failed: ${runsRes.error.message}`)
  if (eventsTotalRes.error) throw new Error(`getOverview(eventsTotal) failed: ${eventsTotalRes.error.message}`)
  if (events24hRes.error) throw new Error(`getOverview(events24h) failed: ${events24hRes.error.message}`)

  const sources = (sourcesRes.data ?? []) as { id: string; enabled: boolean }[]
  const runs = (runsRes.data ?? []) as ConnectorRunSummaryRow[]

  const lastSuccess = runs.find((r) => r.status === 'success' || r.status === 'partial')
  const lastFailure = runs.find((r) => r.status === 'failed')
  const now = Date.now()
  const failedRunsLast24h = runs.filter((r) => r.status === 'failed' && now - new Date(r.started_at).getTime() <= 24 * 60 * 60 * 1000).length

  const registeredConnectors = registry().list().length

  const mostRecentRunAt = runs[0]?.started_at ?? null
  const ingestionStale = mostRecentRunAt !== null && now - new Date(mostRecentRunAt).getTime() > STALE_INGESTION_THRESHOLD_MS

  const pipeline: PipelineStageHealth[] = [
    {
      stage: 'Ingestion',
      status: !database.connected ? 'error' : mostRecentRunAt === null ? 'not_monitored' : ingestionStale ? 'warning' : failedRunsLast24h > 0 ? 'warning' : 'healthy',
      detail: mostRecentRunAt === null
        ? 'No connector runs recorded yet.'
        : ingestionStale
          ? `Most recent connector run was ${mostRecentRunAt} — over ${STALE_INGESTION_THRESHOLD_MS / 3_600_000}h ago.`
          : `${failedRunsLast24h} failed run(s) in the last 24h; most recent run ${mostRecentRunAt}.`,
    },
    {
      stage: 'Normalization & Classification',
      status: 'not_monitored',
      detail: 'Normalize/validate happen per-message in the queue consumer (processMessage.ts); no per-stage success/failure counter is persisted separately from the final stored event today.',
    },
    {
      stage: 'Entity extraction',
      status: entityExtractionsRes.error ? 'not_monitored' : (entityExtractionsRes.count ?? 0) > 0 ? 'healthy' : 'not_monitored',
      detail: entityExtractionsRes.error
        ? 'entity_extractions table not reachable.'
        : `${entityExtractionsRes.count ?? 0} extraction(s) recorded in the last 24h (Gemini-backed batch, runs every 5 minutes when configured).`,
    },
    {
      stage: 'Deduplication',
      status: 'not_monitored',
      detail: 'Dedup runs in-memory per Worker isolate (dedupe.ts) — no persisted counter of matches/near-matches exists yet to report a real rate here.',
    },
    {
      stage: 'Events',
      status: (eventsTotalRes.count ?? 0) > 0 ? 'healthy' : 'not_monitored',
      detail: `${eventsTotalRes.count ?? 0} real events stored; ${events24hRes.count ?? 0} published in the last 24h.`,
    },
  ]

  return {
    database,
    ingestion: {
      activeSources: sources.filter((s) => s.enabled).length,
      totalSources: sources.length,
      connectorsRegistered: registeredConnectors,
      lastSuccessfulRunAt: lastSuccess?.started_at ?? null,
      lastFailedRunAt: lastFailure?.started_at ?? null,
      lastError: lastFailure?.sample_errors[0] ?? null,
      failedRunsLast24h,
      eventsIngestedTotal: eventsTotalRes.count ?? 0,
      eventsIngestedLast24h: events24hRes.count ?? 0,
    },
    services: {
      supabaseConfigured: database.connected,
      geminiConfigured: services.geminiConfigured,
      anthropicConfigured: services.anthropicConfigured,
    },
    pipeline,
  }
}

// ---------------------------------------------------------------------------
// Database overview — real counts only. A table that doesn't exist or
// can't be queried is reported as unavailable, never a fabricated number.
// ---------------------------------------------------------------------------

export interface DatabaseMetric {
  label: string
  count: number | null
  /** Set only when the count could not be computed — the frontend renders "Not configured" rather than a fake zero. */
  unavailable?: boolean
}

// `select('*', ...)` rather than `select('id', ...)` — deliberate: not every
// table here uses `id` as its primary key (e.g. `countries` uses `code`),
// and with `head: true` no rows are actually returned regardless, so `*` is
// both always-valid and free (same pattern entitiesApi.ts's mention-count
// queries already use).
async function realCount(supabase: SupabaseClient, table: string): Promise<number | 'error'> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return error ? 'error' : (count ?? 0)
}

async function realTopicCount(supabase: SupabaseClient): Promise<number | 'error'> {
  const { count, error } = await supabase.from('entities').select('*', { count: 'exact', head: true }).eq('entity_type', 'topic')
  return error ? 'error' : (count ?? 0)
}

/** No `collections` table exists (see bookmarksApi.ts's own doc comment) — a collection is free text on a bookmark, so its "count" is the number of distinct real values in use, not a row count. */
async function realCollectionCount(supabase: SupabaseClient): Promise<number | 'error'> {
  const { data, error } = await supabase.from('bookmarks').select('collection').not('collection', 'is', null)
  if (error) return 'error'
  return new Set((data ?? []).map((b) => b.collection as string)).size
}

export async function getDatabaseOverview(config: AdminApiConfig): Promise<DatabaseMetric[]> {
  const supabase = client(config)

  const [events, sources, eventUpdates, entities, countries, alerts, bookmarks, watchlists, profiles, notifications, topics, collections] = await Promise.all([
    realCount(supabase, 'normalized_events'),
    realCount(supabase, 'sources'),
    realCount(supabase, 'event_updates'),
    realCount(supabase, 'entities'),
    realCount(supabase, 'countries'),
    realCount(supabase, 'alerts'),
    realCount(supabase, 'bookmarks'),
    realCount(supabase, 'watchlists'),
    realCount(supabase, 'profiles'),
    realCount(supabase, 'notifications'),
    realTopicCount(supabase),
    realCollectionCount(supabase),
  ])

  const toMetric = (label: string, value: number | 'error'): DatabaseMetric =>
    value === 'error' ? { label, count: null, unavailable: true } : { label, count: value }

  return [
    toMetric('Events', events),
    toMetric('Sources', sources),
    toMetric('Event updates', eventUpdates),
    toMetric('Entities', entities),
    toMetric('Countries', countries),
    toMetric('Topics', topics),
    toMetric('Alerts', alerts),
    toMetric('Bookmarks', bookmarks),
    toMetric('Saved searches', watchlists),
    toMetric('Collections', collections),
    toMetric('Users', profiles),
    toMetric('Notifications', notifications),
  ]
}
