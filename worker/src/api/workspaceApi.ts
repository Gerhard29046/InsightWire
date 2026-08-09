import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { listEvents, type ListEventsQuery } from './eventsApi'

/**
 * See docs/decisions/0015-workspace-single-user.md: there is no live auth
 * anywhere in this app (no Supabase Auth client in the frontend, no JWT
 * check in the Worker — every route already runs on the service-role key,
 * which bypasses RLS). This fixed UUID scopes every Workspace read/write to
 * a single implicit user rather than inventing a fake multi-tenant surface.
 * The moment real auth exists, every function below already takes a plain
 * `userId` string internally — swap this constant for a real one and
 * nothing else changes.
 */
export const WORKSPACE_USER_ID = '00000000-0000-0000-0000-000000000001'

export interface WorkspaceApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: WorkspaceApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Mirrors the frontend's `EventFiltersState` (src/lib/api/types.ts) minus
 * `regions` — "region" has no backend column (see eventsApi.ts's own doc
 * comment on this exact point); the frontend resolves a region selection
 * into real `countries` before a watchlist is ever saved, the same
 * translation it already performs before calling `fetchEvents`. Kept as its
 * own type (not imported) because the Worker doesn't depend on the
 * frontend — same precedent as EntityType being hand-duplicated between
 * `src/lib/api/entities.ts` and `worker/src/pipeline/entityGraph.ts`.
 */
export interface WatchlistFilters {
  search?: string
  countries?: string[]
  categories?: string[]
  importance?: string[]
  languages?: string[]
  sources?: string[]
  statuses?: string[]
  verifiedOnly?: boolean
  futureOnly?: boolean
  liveOnly?: boolean
  breakingOnly?: boolean
  dateFrom?: string | null
  dateTo?: string | null
  timeRange?: 'any' | '1h' | '24h' | '7d' | '30d'
}

interface WatchlistRow {
  id: string
  name: string
  filters: WatchlistFilters
  active: boolean
  notify: boolean
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface WatchlistRecord {
  id: string
  name: string
  filters: WatchlistFilters
  active: boolean
  notify: boolean
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
  /** Unread `alerts` rows for this watchlist — real materialized matches, see refreshWatchlist. */
  newResultsCount: number
  /** Most recent alert's `triggered_at`, or null if this watchlist has never matched anything. */
  lastActivityAt: string | null
  /** Active, has been checked at least once, and produced no match in QUIET_THRESHOLD_MS — a real, derived signal, not a stored flag. */
  quiet: boolean
}

interface AlertAggregate {
  unreadCount: number
  lastActivityAt: string | null
  recentCount: number
  priorCount: number
}

const QUIET_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000
const SPIKE_WINDOW_MS = 6 * 60 * 60 * 1000
/** Real cap on rows fetched to compute per-watchlist alert aggregates in JS — cheap at this single-tenant app's actual scale (a handful of watchlists, each with at most a few hundred real matches), same cost/precision trade-off already documented in entitiesApi.ts's BREAKDOWN_ROW_LIMIT. */
const ALERT_AGGREGATE_ROW_LIMIT = 5000
/** Real floor before a match-rate increase counts as a "developing" spike — avoids flagging noise like 1 match this window vs 0 last window. */
const SPIKE_MIN_RECENT = 3

async function fetchAlertAggregates(supabase: SupabaseClient, watchlistIds: string[]): Promise<Map<string, AlertAggregate>> {
  const result = new Map<string, AlertAggregate>()
  if (watchlistIds.length === 0) return result

  const { data, error } = await supabase
    .from('alerts')
    .select('watchlist_id, triggered_at, read')
    .in('watchlist_id', watchlistIds)
    .order('triggered_at', { ascending: false })
    .limit(ALERT_AGGREGATE_ROW_LIMIT)
  if (error) throw new Error(`fetchAlertAggregates failed: ${error.message}`)

  const now = Date.now()
  const rows = (data ?? []) as { watchlist_id: string; triggered_at: string; read: boolean }[]
  for (const id of watchlistIds) result.set(id, { unreadCount: 0, lastActivityAt: null, recentCount: 0, priorCount: 0 })

  for (const row of rows) {
    const agg = result.get(row.watchlist_id)
    if (!agg) continue
    if (!row.read) agg.unreadCount += 1
    if (!agg.lastActivityAt || row.triggered_at > agg.lastActivityAt) agg.lastActivityAt = row.triggered_at
    const age = now - new Date(row.triggered_at).getTime()
    if (age <= SPIKE_WINDOW_MS) agg.recentCount += 1
    else if (age <= SPIKE_WINDOW_MS * 2) agg.priorCount += 1
  }

  return result
}

function toWatchlistRecord(row: WatchlistRow, agg: AlertAggregate | undefined): WatchlistRecord {
  const stats = agg ?? { unreadCount: 0, lastActivityAt: null, recentCount: 0, priorCount: 0 }
  const quiet =
    row.active &&
    row.last_checked_at !== null &&
    (stats.lastActivityAt === null || Date.now() - new Date(stats.lastActivityAt).getTime() > QUIET_THRESHOLD_MS)
  return {
    id: row.id,
    name: row.name,
    filters: row.filters,
    active: row.active,
    notify: row.notify,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    newResultsCount: stats.unreadCount,
    lastActivityAt: stats.lastActivityAt,
    quiet,
  }
}

async function fetchWatchlistRows(supabase: SupabaseClient): Promise<WatchlistRow[]> {
  const { data, error } = await supabase
    .from('watchlists')
    .select('id, name, filters, active, notify, last_checked_at, created_at, updated_at')
    .eq('user_id', WORKSPACE_USER_ID)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`fetchWatchlistRows failed: ${error.message}`)
  return (data ?? []) as WatchlistRow[]
}

export async function listWatchlists(config: WorkspaceApiConfig): Promise<WatchlistRecord[]> {
  const supabase = client(config)
  const rows = await fetchWatchlistRows(supabase)
  const aggregates = await fetchAlertAggregates(supabase, rows.map((r) => r.id))
  return rows.map((row) => toWatchlistRecord(row, aggregates.get(row.id)))
}

export async function createWatchlist(
  config: WorkspaceApiConfig,
  input: { name: string; filters: WatchlistFilters },
): Promise<WatchlistRecord> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('watchlists')
    .insert({ user_id: WORKSPACE_USER_ID, name: input.name, filters: input.filters })
    .select('id, name, filters, active, notify, last_checked_at, created_at, updated_at')
    .single()
  if (error) throw new Error(`createWatchlist failed: ${error.message}`)
  return toWatchlistRecord(data as WatchlistRow, undefined)
}

export interface UpdateWatchlistPatch {
  name?: string
  filters?: WatchlistFilters
  active?: boolean
  notify?: boolean
}

export async function updateWatchlist(
  config: WorkspaceApiConfig,
  id: string,
  patch: UpdateWatchlistPatch,
): Promise<WatchlistRecord | undefined> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('watchlists')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', WORKSPACE_USER_ID)
    .select('id, name, filters, active, notify, last_checked_at, created_at, updated_at')
    .maybeSingle()
  if (error) throw new Error(`updateWatchlist failed: ${error.message}`)
  if (!data) return undefined
  const aggregates = await fetchAlertAggregates(supabase, [id])
  return toWatchlistRecord(data as WatchlistRow, aggregates.get(id))
}

export async function deleteWatchlist(config: WorkspaceApiConfig, id: string): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase.from('watchlists').delete().eq('id', id).eq('user_id', WORKSPACE_USER_ID)
  if (error) throw new Error(`deleteWatchlist failed: ${error.message}`)
}

function filtersToEventsQuery(filters: WatchlistFilters): ListEventsQuery {
  return {
    search: filters.search,
    countries: filters.countries,
    categories: filters.categories,
    importance: filters.importance,
    languages: filters.languages,
    sources: filters.sources,
    statuses: filters.statuses,
    verifiedOnly: filters.verifiedOnly,
    futureOnly: filters.futureOnly,
    liveOnly: filters.liveOnly,
    breakingOnly: filters.breakingOnly,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    timeRange: filters.timeRange,
    sort: 'latest',
    pageSize: 50,
  }
}

export interface RefreshWatchlistResult {
  watchlist: WatchlistRecord
  insertedCount: number
}

/**
 * The real, honest substitute for the "future matching job" the `alerts`
 * table's own migration comment describes (see
 * docs/decisions/0015-workspace-single-user.md's sibling discussion in the
 * implementation plan — no Cloudflare Cron Trigger/queue infra exists in
 * this Worker, and standing one up is out of proportion to the Workspace
 * page). Runs the watchlist's stored filters live against the same
 * `listEvents` every other real-time surface uses, diffs against
 * already-materialized `alerts` rows (unique on watchlist_id+event_id), and
 * inserts only genuinely new matches — never a fabricated count.
 */
export async function refreshWatchlist(config: WorkspaceApiConfig, id: string): Promise<RefreshWatchlistResult | undefined> {
  const supabase = client(config)
  const { data: watchlistRow, error: watchlistError } = await supabase
    .from('watchlists')
    .select('id, name, filters, active, notify, last_checked_at, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', WORKSPACE_USER_ID)
    .maybeSingle()
  if (watchlistError) throw new Error(`refreshWatchlist(watchlist) failed: ${watchlistError.message}`)
  if (!watchlistRow) return undefined
  const row = watchlistRow as WatchlistRow

  const { events } = await listEvents(config, filtersToEventsQuery(row.filters))

  const { data: existingAlerts, error: existingError } = await supabase
    .from('alerts')
    .select('normalized_event_id')
    .eq('watchlist_id', id)
  if (existingError) throw new Error(`refreshWatchlist(existingAlerts) failed: ${existingError.message}`)
  const existingIds = new Set(((existingAlerts ?? []) as { normalized_event_id: string }[]).map((r) => r.normalized_event_id))

  const newEvents = events.filter((e) => !existingIds.has(e.id))
  if (newEvents.length > 0) {
    const { error: insertError } = await supabase
      .from('alerts')
      .insert(newEvents.map((e) => ({ watchlist_id: id, normalized_event_id: e.id })))
    if (insertError) throw new Error(`refreshWatchlist(insert) failed: ${insertError.message}`)
  }

  const { error: touchError } = await supabase
    .from('watchlists')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', id)
  if (touchError) throw new Error(`refreshWatchlist(touch) failed: ${touchError.message}`)

  const aggregates = await fetchAlertAggregates(supabase, [id])
  const watchlist = toWatchlistRecord({ ...row, last_checked_at: new Date().toISOString() }, aggregates.get(id))
  return { watchlist, insertedCount: newEvents.length }
}

export async function refreshActiveWatchlists(config: WorkspaceApiConfig): Promise<RefreshWatchlistResult[]> {
  const supabase = client(config)
  const rows = await fetchWatchlistRows(supabase)
  const activeIds = rows.filter((r) => r.active).map((r) => r.id)
  const results = await Promise.all(activeIds.map((id) => refreshWatchlist(config, id)))
  return results.filter((r): r is RefreshWatchlistResult => r !== undefined)
}

interface AlertEventRow {
  id: string
  title: string
  source: string
  category: string
  importance: string
  status: string
  published_at: string
  source_url: string | null
}

interface AlertJoinRow {
  id: string
  triggered_at: string
  read: boolean
  watchlists: { id: string; name: string; user_id: string } | null
  normalized_events: AlertEventRow | null
}

export interface AlertRecord {
  id: string
  watchlistId: string
  watchlistName: string
  event: {
    id: string
    title: string
    source: string
    category: string
    importance: string
    status: string
    publishedAt: string
    sourceUrl: string | null
  }
  triggeredAt: string
  read: boolean
  /** importance is high/critical and the event is still live/developing — same operational-definition pattern as eventsApi.ts's BREAKING_PRIORITY_THRESHOLD, just derived at read time instead of stored. */
  breaking: boolean
}

const ALERTS_LIST_LIMIT = 200

export async function listAlerts(
  config: WorkspaceApiConfig,
  opts: { watchlistId?: string; unreadOnly?: boolean } = {},
): Promise<AlertRecord[]> {
  const supabase = client(config)
  let q = supabase
    .from('alerts')
    .select(
      'id, triggered_at, read, watchlists!inner(id, name, user_id), normalized_events!inner(id, title, source, category, importance, status, published_at, source_url)',
    )
    .eq('watchlists.user_id', WORKSPACE_USER_ID)
    .order('triggered_at', { ascending: false })
    .limit(ALERTS_LIST_LIMIT)
  if (opts.watchlistId) q = q.eq('watchlist_id', opts.watchlistId)
  if (opts.unreadOnly) q = q.eq('read', false)

  const { data, error } = await q
  if (error) throw new Error(`listAlerts failed: ${error.message}`)

  return ((data ?? []) as unknown as AlertJoinRow[])
    .filter((row) => row.watchlists && row.normalized_events)
    .map((row) => {
      const event = row.normalized_events!
      return {
        id: row.id,
        watchlistId: row.watchlists!.id,
        watchlistName: row.watchlists!.name,
        event: {
          id: event.id,
          title: event.title,
          source: event.source,
          category: event.category,
          importance: event.importance,
          status: event.status,
          publishedAt: event.published_at,
          sourceUrl: event.source_url,
        },
        triggeredAt: row.triggered_at,
        read: row.read,
        breaking: (event.importance === 'high' || event.importance === 'critical') && (event.status === 'live' || event.status === 'developing'),
      }
    })
}

/**
 * READ-STATE RULE (applies to both alerts and notifications below):
 * "read" is metadata on the alert row only — it is never a delete, and it
 * never touches `normalized_events`. An alert marked read stays in
 * `listAlerts`'s results forever (there is no `unreadOnly=true` default and
 * no delete route for `alerts` — RLS only grants select+update, by design,
 * see supabase/migrations/20260807180007_rls_policies.sql). The Global
 * Events Feed reads `normalized_events` directly via `listEvents` and has
 * no join to `alerts` at all, so "read" here can never make a real event
 * disappear from the Feed — "this event exists" and "this journalist has
 * seen the alert about it" are deliberately unrelated facts. The only
 * writers of `read` are this function, `markAllAlertsRead`, and the
 * frontend's explicit per-row "Mark read"/"Open" actions — nothing else in
 * this codebase (no poll, no refresh, no navigation) ever sets it.
 */
export async function markAlertRead(config: WorkspaceApiConfig, id: string): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase.from('alerts').update({ read: true }).eq('id', id)
  if (error) throw new Error(`markAlertRead failed: ${error.message}`)
}

/** Same read-state rule as `markAlertRead` above — bulk, but still update-only, never delete. */
export async function markAllAlertsRead(config: WorkspaceApiConfig, watchlistId?: string): Promise<number> {
  const supabase = client(config)
  const rows = await fetchWatchlistRows(supabase)
  const ownedIds = new Set(rows.map((r) => r.id))
  let q = supabase.from('alerts').update({ read: true }).eq('read', false)
  q = watchlistId ? q.eq('watchlist_id', watchlistId) : q.in('watchlist_id', [...ownedIds])
  const { data, error } = await q.select('id')
  if (error) throw new Error(`markAllAlertsRead failed: ${error.message}`)
  return (data ?? []).length
}

interface NotificationRow {
  id: string
  type: string
  payload: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface NotificationRecord {
  id: string
  type: string
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

function toNotificationRecord(row: NotificationRow): NotificationRecord {
  return { id: row.id, type: row.type, payload: row.payload, read: row.read, createdAt: row.created_at }
}

export async function listNotifications(config: WorkspaceApiConfig): Promise<NotificationRecord[]> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read, created_at')
    .eq('user_id', WORKSPACE_USER_ID)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listNotifications failed: ${error.message}`)
  return ((data ?? []) as NotificationRow[]).map(toNotificationRecord)
}

/** Same read-state rule as `markAlertRead`'s own doc comment above: update-only, never a delete, and unrelated to whatever the notification refers to. */
export async function markNotificationRead(config: WorkspaceApiConfig, id: string): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', WORKSPACE_USER_ID)
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`)
}

export async function markAllNotificationsRead(config: WorkspaceApiConfig): Promise<number> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', WORKSPACE_USER_ID)
    .eq('read', false)
    .select('id')
  if (error) throw new Error(`markAllNotificationsRead failed: ${error.message}`)
  return (data ?? []).length
}

export interface AttentionItem {
  id: string
  kind: 'new_matches' | 'developing_spike' | 'bookmark_updated' | 'unread_notification'
  title: string
  description: string
  timestamp: string
  actionLabel: string
  actionHref: string
}

export interface WorkspaceOverview {
  counts: {
    savedSearches: number
    activeMonitoring: number
    bookmarks: number
    unreadAlerts: number
    recentlyUpdated: number
  }
  attention: AttentionItem[]
  quietSearches: { id: string; name: string; lastActivityAt: string | null }[]
  topSources: { source: string; count: number }[]
}

interface BookmarkOverviewRow {
  id: string
  normalized_event_id: string
  updated_at: string
  normalized_events: { title: string; source: string } | null
}

const RECENTLY_UPDATED_WINDOW_MS = 24 * 60 * 60 * 1000
const TOP_SOURCES_LIMIT = 5

/**
 * The one aggregating call the Workspace page loads on open — refreshes
 * every active watchlist first (see refreshActiveWatchlists's own doc
 * comment on why this replaces a background job), then derives header
 * counts, "Needs Attention" items, quiet searches, and the sources-you-
 * save-most insight from the real rows that produced.
 */
export async function getWorkspaceOverview(config: WorkspaceApiConfig): Promise<WorkspaceOverview> {
  const supabase = client(config)

  const [refreshResults, bookmarkRows, notifications] = await Promise.all([
    refreshActiveWatchlists(config),
    supabase
      .from('bookmarks')
      .select('id, normalized_event_id, updated_at, normalized_events!inner(title, source)')
      .eq('user_id', WORKSPACE_USER_ID),
    listNotifications(config),
  ])

  if (bookmarkRows.error) throw new Error(`getWorkspaceOverview(bookmarks) failed: ${bookmarkRows.error.message}`)
  const bookmarks = (bookmarkRows.data ?? []) as unknown as BookmarkOverviewRow[]

  const allWatchlists = await listWatchlists(config)
  const activeCount = allWatchlists.filter((w) => w.active).length
  const unreadAlerts = allWatchlists.reduce((sum, w) => sum + w.newResultsCount, 0)

  const now = Date.now()
  const recentlyUpdatedWatchlists = allWatchlists.filter(
    (w) => w.lastActivityAt !== null && now - new Date(w.lastActivityAt).getTime() <= RECENTLY_UPDATED_WINDOW_MS,
  ).length
  const recentlyUpdatedBookmarks = bookmarks.filter((b) => now - new Date(b.updated_at).getTime() <= RECENTLY_UPDATED_WINDOW_MS).length

  const attention: AttentionItem[] = []

  for (const result of refreshResults) {
    if (result.insertedCount > 0) {
      attention.push({
        id: `new-matches-${result.watchlist.id}`,
        kind: 'new_matches',
        title: 'New activity',
        description: `${result.insertedCount} new report${result.insertedCount === 1 ? '' : 's'} match your saved search: ${result.watchlist.name}`,
        timestamp: result.watchlist.lastActivityAt ?? new Date().toISOString(),
        actionLabel: 'View results',
        actionHref: `/workspace#saved-searches`,
      })
    }
  }

  // Spike detection needs the recent/prior 6h-window split, which
  // toWatchlistRecord doesn't expose on WatchlistRecord (only the unread
  // count/lastActivityAt) — recomputed here via the same aggregate helper
  // rather than widening that public type for this one caller.
  const watchlistIds = allWatchlists.map((w) => w.id)
  const aggregates = await fetchAlertAggregates(supabase, watchlistIds)
  for (const w of allWatchlists) {
    if (!w.active) continue
    const agg = aggregates.get(w.id)
    if (!agg) continue
    const isSpike = agg.recentCount >= SPIKE_MIN_RECENT && (agg.priorCount === 0 || agg.recentCount >= agg.priorCount * 2)
    if (isSpike) {
      attention.push({
        id: `spike-${w.id}`,
        kind: 'developing_spike',
        title: 'Developing',
        description: `Activity is picking up in your saved search "${w.name}" — ${agg.recentCount} matches in the last 6 hours.`,
        timestamp: agg.lastActivityAt ?? new Date().toISOString(),
        actionLabel: 'Open story',
        actionHref: `/workspace#saved-searches`,
      })
    }
  }

  // One query for every bookmarked event's updates (not one round trip per
  // bookmark) — cheap at this app's real bookmark counts, and the same
  // "batch, then group in JS" shape fetchAlertAggregates already uses above.
  const bookmarkedEventIds = bookmarks.filter((b) => b.normalized_events).map((b) => b.normalized_event_id)
  if (bookmarkedEventIds.length > 0) {
    const { data: updateRows, error: updateError } = await supabase
      .from('event_updates')
      .select('normalized_event_id, at')
      .in('normalized_event_id', bookmarkedEventIds)
      .order('at', { ascending: false })
    if (updateError) throw new Error(`getWorkspaceOverview(event_updates) failed: ${updateError.message}`)
    const latestUpdateByEventId = new Map<string, string>()
    for (const row of (updateRows ?? []) as { normalized_event_id: string; at: string }[]) {
      if (!latestUpdateByEventId.has(row.normalized_event_id)) latestUpdateByEventId.set(row.normalized_event_id, row.at)
    }

    for (const bookmark of bookmarks) {
      if (!bookmark.normalized_events) continue
      const latestUpdateAt = latestUpdateByEventId.get(bookmark.normalized_event_id)
      if (!latestUpdateAt || latestUpdateAt <= bookmark.updated_at) continue
      attention.push({
        id: `bookmark-updated-${bookmark.id}`,
        kind: 'bookmark_updated',
        title: 'Bookmark updated',
        description: `A bookmarked story has changed since you saved it: ${bookmark.normalized_events.title}`,
        timestamp: latestUpdateAt,
        actionLabel: 'Open story',
        actionHref: `/feed/${encodeURIComponent(bookmark.normalized_event_id)}`,
      })
    }
  }

  const importantUnread = notifications.filter((n) => !n.read)
  for (const n of importantUnread) {
    attention.push({
      id: `notification-${n.id}`,
      kind: 'unread_notification',
      title: 'System',
      description: typeof n.payload.message === 'string' ? n.payload.message : n.type,
      timestamp: n.createdAt,
      actionLabel: 'Open',
      actionHref: '/workspace#notifications',
    })
  }

  attention.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))

  const quietSearches = allWatchlists
    .filter((w) => w.quiet)
    .map((w) => ({ id: w.id, name: w.name, lastActivityAt: w.lastActivityAt }))

  const sourceCounts = new Map<string, number>()
  for (const bookmark of bookmarks) {
    if (!bookmark.normalized_events) continue
    const source = bookmark.normalized_events.source
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
  }
  const topSources = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_SOURCES_LIMIT)

  return {
    counts: {
      savedSearches: allWatchlists.length,
      activeMonitoring: activeCount,
      bookmarks: bookmarks.length,
      unreadAlerts,
      recentlyUpdated: recentlyUpdatedWatchlists + recentlyUpdatedBookmarks,
    },
    attention,
    quietSearches,
    topSources,
  }
}
