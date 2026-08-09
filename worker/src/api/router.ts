import type { Env } from '../env'
import { selectRepository } from '../env'
import { generateBrief, getLatestBrief } from './briefApi'
import { generateEntityBrief, getLatestEntityBrief } from './entityBriefApi'
import { getEventDetail, listEvents, parseListEventsQuery } from './eventsApi'
import { getDashboardSummary } from './dashboardApi'
import { getEntityDetail, listEntities, parseListEntitiesQuery } from './entitiesApi'
import { getGeoReadiness, getMapSummary } from './mapApi'
import { getHistoricalMomentDetail, listHistoricalMoments } from './historicalMomentsApi'
import {
  createWatchlist,
  deleteWatchlist,
  getWorkspaceOverview,
  listAlerts,
  listNotifications,
  listWatchlists,
  markAlertRead,
  markAllAlertsRead,
  markAllNotificationsRead,
  markNotificationRead,
  refreshWatchlist,
  updateWatchlist,
  type UpdateWatchlistPatch,
  type WatchlistFilters,
} from './workspaceApi'
import {
  addBookmark,
  listBookmarks,
  listCollections,
  removeBookmark,
  removeBookmarkByEvent,
  updateBookmark,
  type BookmarkPriority,
  type ListBookmarksQuery,
  type UpdateBookmarkPatch,
} from './bookmarksApi'
import { WORKSPACE_USER_ID } from './workspaceApi'
import { getDatabaseOverview, getOverview, listAuditLog, listSources, testSource, updateSource, type UpdateSourcePatch } from './adminApi'
import { listConfig, updateConfig } from './configApi'
import {
  createDocumentVersion,
  getActiveDocument,
  getDocumentHistory,
  listActiveDocuments,
  type CreateDocumentVersionInput,
} from './legalApi'
import { createReport, listReports, updateReport, type CreateReportInput, type ReportStatus, type UpdateReportInput } from './moderationApi'
import { listProfiles } from './profilesApi'

/**
 * A read-only-by-default public API — CORS is intentionally open (`*`),
 * matching the anon-read decision already made for this data
 * (docs/decisions/0008-frontend-preview.md, since tightened back down at
 * the RLS layer per docs/decisions/0009-intelligence-api.md — the Worker's
 * own service-role key is what actually gates writes, never a response
 * body or a browser). POST exists only for the one on-demand, user-
 * triggered action (generating a journalist brief) — never for any
 * ingestion-pipeline write.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function notConfigured(missing: string): Response {
  return json({ error: `${missing} is not configured on this Worker` }, 503)
}

function parseBookmarkPriority(value: string | null): BookmarkPriority | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined
}

function errorResponse(err: unknown): Response {
  return json({ error: err instanceof Error ? err.message : String(err) }, 500)
}

/**
 * The Intelligence API: GET /events (list, filtered), GET /events/:id
 * (detail), and GET/POST /events/:id/brief (the on-demand "AI button" —
 * GET returns the most recent cached brief if one exists, POST generates a
 * new one via Gemini). Only /events/:id/brief's POST writes anything; every
 * other route is a pure read. The ingestion pipeline
 * (`processMessage`/`Repository`) remains the only write path for
 * events/timeline/sources — untouched by this router.
 *
 * The Journalist Workspace (added in Phase 14) is a real, explicit
 * expansion of that read-mostly posture: /watchlists, /bookmarks,
 * /notifications, and /alerts are genuine user-owned CRUD — POST/PATCH/
 * DELETE write real rows, not just the one on-demand AI action described
 * above. Every one of those writes is scoped server-side to
 * `WORKSPACE_USER_ID` (see docs/decisions/0015-workspace-single-user.md —
 * there is still no live auth anywhere in this app), never to a value the
 * client supplies.
 *
 * Returns `undefined` (falls through to the caller's 404) for any route
 * this doesn't own, so `worker.ts`'s `fetch()` can layer this in front of
 * its existing plain-text placeholder without that placeholder
 * disappearing for unmatched paths.
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response | undefined> {
  const url = new URL(request.url)

  if (
    request.method === 'OPTIONS' &&
    (url.pathname.startsWith('/events') ||
      url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/entities') ||
      url.pathname.startsWith('/map') ||
      url.pathname.startsWith('/historical-moments') ||
      url.pathname.startsWith('/workspace') ||
      url.pathname.startsWith('/watchlists') ||
      url.pathname.startsWith('/alerts') ||
      url.pathname.startsWith('/bookmarks') ||
      url.pathname.startsWith('/notifications') ||
      url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/legal') ||
      url.pathname.startsWith('/reports'))
  ) {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (url.pathname === '/events' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const query = parseListEventsQuery(url.searchParams)
      const result = await listEvents({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, query)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /**
   * GET /dashboard/summary — the Dashboard's one real aggregation query set
   * (see dashboardApi.ts's own doc comment). Optional ?hours= overrides the
   * default 24-hour reporting window; optional repeated ?country= scopes
   * every number to those real countries (the frontend translates a region
   * selection into countries before sending this, same as GET /events).
   */
  if (url.pathname === '/dashboard/summary' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const hoursParam = url.searchParams.get('hours')
      const windowHours = hoursParam ? Number(hoursParam) : undefined
      const countries = url.searchParams.getAll('country')
      const summary = await getDashboardSummary(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        windowHours != null && !Number.isNaN(windowHours) ? windowHours : undefined,
        countries.length > 0 ? countries : undefined,
      )
      return json(summary)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /** GET /map/geo-readiness — real, exact all-time counts of stored events with vs. without usable coordinates (see mapApi.ts's own doc comment). Feeds the World Map placeholder; no map rendering exists yet. */
  if (url.pathname === '/map/geo-readiness' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const readiness = await getGeoReadiness({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json(readiness)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /** GET /historical-moments — the World Timeline's list, real rows only from the `historical_moments` table (see historicalMomentsApi.ts). Empty until a real curation process populates it; never fabricated. */
  if (url.pathname === '/historical-moments' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const moments = await listHistoricalMoments({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ moments })
    } catch (err) {
      return errorResponse(err)
    }
  }

  /** GET /historical-moments/:id — a single curated moment's detail, for "click a moment → broader context." */
  const historicalMomentIdMatch = url.pathname.match(/^\/historical-moments\/(.+)$/)
  if (historicalMomentIdMatch && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(historicalMomentIdMatch[1])
    try {
      const moment = await getHistoricalMomentDetail({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id)
      if (!moment) return json({ error: `Historical moment "${id}" not found` }, 404)
      return json(moment)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /**
   * GET /map/summary — the Geographic Intelligence Map's real per-country
   * aggregates + capped point markers (see mapApi.ts's own doc comment).
   * Optional ?hours= overrides the default 7-day window.
   */
  if (url.pathname === '/map/summary' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const hoursParam = url.searchParams.get('hours')
      const windowHours = hoursParam ? Number(hoursParam) : undefined
      const summary = await getMapSummary(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        windowHours != null && !Number.isNaN(windowHours) ? windowHours : undefined,
      )
      return json(summary)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /** GET /entities — Entity Explorer's search/list, real rows from the `entities` table (see entitiesApi.ts). */
  if (url.pathname === '/entities' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const query = parseListEntitiesQuery(url.searchParams)
      const result = await listEntities({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, query)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /** GET/POST /entities/:id/brief — the entity-page "AI Intelligence Summary." Checked before the generic /entities/:id route below, same reason /events/:id/brief is checked before /events/:id (otherwise that route's greedy `.+` would swallow "/brief" as part of the id). */
  const entityBriefMatch = url.pathname.match(/^\/entities\/(.+)\/brief$/)
  if (entityBriefMatch && (request.method === 'GET' || request.method === 'POST')) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(entityBriefMatch[1])
    const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }

    if (request.method === 'GET') {
      try {
        const brief = await getLatestEntityBrief(config, id)
        if (!brief) return json({ error: `No brief has been generated for entity "${id}" yet` }, 404)
        return json(brief)
      } catch (err) {
        return errorResponse(err)
      }
    }

    // POST: generate a new one.
    if (!env.GEMINI_API_KEY) return notConfigured('GEMINI_API_KEY')
    try {
      const brief = await generateEntityBrief({ config, geminiApiKey: env.GEMINI_API_KEY }, id)
      if (!brief) return json({ error: `Entity "${id}" not found` }, 404)
      return json(brief)
    } catch (err) {
      return errorResponse(err)
    }
  }

  /** GET /entities/:id — the full detail bundle (stats, recent events, connected entities, sources, countries). Optional ?eventsCursor=/?eventsPageSize= paginate the recentEvents sub-list. */
  const entityIdMatch = url.pathname.match(/^\/entities\/(.+)$/)
  if (entityIdMatch && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(entityIdMatch[1])
    try {
      const eventsPageSizeRaw = url.searchParams.get('eventsPageSize')
      const detail = await getEntityDetail(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        id,
        { eventsCursor: url.searchParams.get('eventsCursor'), eventsPageSize: eventsPageSizeRaw ? Number(eventsPageSizeRaw) : undefined },
      )
      if (!detail) return json({ error: `Entity "${id}" not found` }, 404)
      return json(detail)
    } catch (err) {
      return errorResponse(err)
    }
  }

  const briefMatch = url.pathname.match(/^\/events\/(.+)\/brief$/)
  if (briefMatch && (request.method === 'GET' || request.method === 'POST')) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(briefMatch[1])
    const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }

    if (request.method === 'GET') {
      try {
        const brief = await getLatestBrief(config, id)
        if (!brief) return json({ error: `No brief has been generated for "${id}" yet` }, 404)
        return json(brief)
      } catch (err) {
        return errorResponse(err)
      }
    }

    // POST: generate a new one.
    if (!env.GEMINI_API_KEY) return notConfigured('GEMINI_API_KEY')
    try {
      const repository = selectRepository(env)
      const brief = await generateBrief({ config, repository, geminiApiKey: env.GEMINI_API_KEY }, id)
      if (!brief) return json({ error: `Event "${id}" not found` }, 404)
      return json(brief)
    } catch (err) {
      return errorResponse(err)
    }
  }

  const eventIdMatch = url.pathname.match(/^\/events\/(.+)$/)
  if (eventIdMatch && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(eventIdMatch[1])
    try {
      const repository = selectRepository(env)
      const detail = await getEventDetail({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, repository, id)
      if (!detail) return json({ error: `Event "${id}" not found` }, 404)
      return json(detail)
    } catch (err) {
      return errorResponse(err)
    }
  }

  // ---------------------------------------------------------------------
  // Journalist Workspace (Phase 14) — real, user-owned CRUD; see this
  // function's own doc comment for why that's a deliberate posture change.
  // ---------------------------------------------------------------------

  if (url.pathname === '/workspace/overview' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const overview = await getWorkspaceOverview({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json(overview)
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/watchlists' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const watchlists = await listWatchlists({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ watchlists })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/watchlists' && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const body = (await request.json()) as { name?: string; filters?: WatchlistFilters }
      if (!body.name) return json({ error: 'name is required' }, 400)
      const watchlist = await createWatchlist(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        { name: body.name, filters: body.filters ?? {} },
      )
      return json(watchlist, 201)
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Checked before the generic /watchlists/:id match below (same reason
  // /entities/:id/brief is checked before /entities/:id) — both are POST
  // vs PATCH/DELETE so method alone would already disambiguate them, but
  // keeping specific-before-generic ordering consistent with the rest of
  // this file avoids relying on that.
  const watchlistRefreshMatch = url.pathname.match(/^\/watchlists\/(.+)\/refresh$/)
  if (watchlistRefreshMatch && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(watchlistRefreshMatch[1])
    try {
      const result = await refreshWatchlist({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id)
      if (!result) return json({ error: `Watchlist "${id}" not found` }, 404)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  }

  const watchlistIdMatch = url.pathname.match(/^\/watchlists\/(.+)$/)
  if (watchlistIdMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(watchlistIdMatch[1])
    try {
      const patch = (await request.json()) as UpdateWatchlistPatch
      const watchlist = await updateWatchlist({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id, patch)
      if (!watchlist) return json({ error: `Watchlist "${id}" not found` }, 404)
      return json(watchlist)
    } catch (err) {
      return errorResponse(err)
    }
  }
  if (watchlistIdMatch && request.method === 'DELETE') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(watchlistIdMatch[1])
    try {
      await deleteWatchlist({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id)
      return json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/alerts' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
      const watchlistId = url.searchParams.get('watchlistId') ?? undefined
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
      const alerts = await listAlerts(config, { watchlistId, unreadOnly })
      return json({ alerts })
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Checked before the generic /alerts/:id match below — same specific-
  // before-generic ordering convention as /watchlists/:id/refresh above.
  if (url.pathname === '/alerts/read-all' && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const watchlistId = url.searchParams.get('watchlistId') ?? undefined
      const updated = await markAllAlertsRead({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, watchlistId)
      return json({ updated })
    } catch (err) {
      return errorResponse(err)
    }
  }

  const alertIdMatch = url.pathname.match(/^\/alerts\/(.+)$/)
  if (alertIdMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(alertIdMatch[1])
    try {
      await markAlertRead({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id)
      return json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/bookmarks' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
      const query: ListBookmarksQuery = {
        collection: url.searchParams.get('collection') ?? undefined,
        priority: parseBookmarkPriority(url.searchParams.get('priority')),
        unreadOnly: url.searchParams.get('unreadOnly') === 'true' ? true : undefined,
      }
      const bookmarks = await listBookmarks(config, query)
      return json({ bookmarks })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/bookmarks' && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const body = (await request.json()) as {
        normalizedEventId?: string
        notes?: string
        tags?: string[]
        priority?: BookmarkPriority
        collection?: string
      }
      if (!body.normalizedEventId) return json({ error: 'normalizedEventId is required' }, 400)
      const bookmark = await addBookmark(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        {
          normalizedEventId: body.normalizedEventId,
          notes: body.notes,
          tags: body.tags,
          priority: body.priority,
          collection: body.collection,
        },
      )
      return json(bookmark, 201)
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Un-bookmarking from EventCard.tsx only ever has the event id in hand,
  // not a bookmark row id — a query param avoids inventing a lookup round
  // trip just to discover it. Distinct from DELETE /bookmarks/:id below
  // (the full BookmarksPanel management UI, which does have the row id) —
  // `/bookmarks` (exact) can never match `/^\/bookmarks\/(.+)$/` below, so
  // there's no ordering dependency between the two.
  if (url.pathname === '/bookmarks' && request.method === 'DELETE') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const eventId = url.searchParams.get('eventId')
    if (!eventId) return json({ error: 'eventId query parameter is required' }, 400)
    try {
      await removeBookmarkByEvent({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, eventId)
      return json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/bookmarks/collections' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const collections = await listCollections({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ collections })
    } catch (err) {
      return errorResponse(err)
    }
  }

  const bookmarkIdMatch = url.pathname.match(/^\/bookmarks\/(.+)$/)
  if (bookmarkIdMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(bookmarkIdMatch[1])
    try {
      const patch = (await request.json()) as UpdateBookmarkPatch
      const bookmark = await updateBookmark({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id, patch)
      if (!bookmark) return json({ error: `Bookmark "${id}" not found` }, 404)
      return json(bookmark)
    } catch (err) {
      return errorResponse(err)
    }
  }
  if (bookmarkIdMatch && request.method === 'DELETE') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(bookmarkIdMatch[1])
    try {
      await removeBookmark({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id)
      return json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/notifications' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const notifications = await listNotifications({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ notifications })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/notifications/read-all' && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const updated = await markAllNotificationsRead({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ updated })
    } catch (err) {
      return errorResponse(err)
    }
  }

  const notificationIdMatch = url.pathname.match(/^\/notifications\/(.+)$/)
  if (notificationIdMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(notificationIdMatch[1])
    try {
      await markNotificationRead({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id)
      return json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  // ---------------------------------------------------------------------
  // Administration (Phase 16) — the real system control centre. Every
  // route here is genuine (queries real tables, calls real health checks)
  // or an explicit, honestly-framed framework stub — never a fabricated
  // number. See docs/decisions/0019-administration-control-centre.md.
  // ---------------------------------------------------------------------

  if (url.pathname === '/admin/overview' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const overview = await getOverview(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        { geminiConfigured: Boolean(env.GEMINI_API_KEY), anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY) },
      )
      return json(overview)
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/database' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const metrics = await getDatabaseOverview({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ metrics })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/sources' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const sources = await listSources({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ sources })
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Checked before the generic /admin/sources/:id match below — same
  // specific-before-generic ordering convention used throughout this file.
  const sourceTestMatch = url.pathname.match(/^\/admin\/sources\/(.+)\/test$/)
  if (sourceTestMatch && request.method === 'POST') {
    const id = decodeURIComponent(sourceTestMatch[1])
    try {
      const result = await testSource(id)
      if (!result) return json({ error: `Unknown source "${id}"` }, 404)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  }

  const sourceIdMatch = url.pathname.match(/^\/admin\/sources\/(.+)$/)
  if (sourceIdMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(sourceIdMatch[1])
    try {
      const patch = (await request.json()) as UpdateSourcePatch
      const source = await updateSource({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id, patch, WORKSPACE_USER_ID)
      if (!source) return json({ error: `Unknown source "${id}"` }, 404)
      return json(source)
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/audit-log' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const entries = await listAuditLog({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ entries })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/config' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const entries = await listConfig({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ entries })
    } catch (err) {
      return errorResponse(err)
    }
  }

  const configKeyMatch = url.pathname.match(/^\/admin\/config\/(.+)$/)
  if (configKeyMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const key = decodeURIComponent(configKeyMatch[1])
    try {
      const body = (await request.json()) as { value?: Record<string, unknown> }
      if (!body.value) return json({ error: 'value is required' }, 400)
      const entry = await updateConfig({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, key, body.value, WORKSPACE_USER_ID)
      if (!entry) return json({ error: `Unknown config key "${key}"` }, 404)
      return json(entry)
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/profiles' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const profiles = await listProfiles({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ profiles })
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Public legal document reads — no auth required, matches the rest of
  // this router's open-CORS posture; these are public policy pages.
  if (url.pathname === '/legal/documents' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const documents = await listActiveDocuments({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      return json({ documents })
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Checked before the generic /legal/documents/:slug match below.
  const legalHistoryMatch = url.pathname.match(/^\/admin\/legal\/documents\/(.+)\/history$/)
  if (legalHistoryMatch && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const slug = decodeURIComponent(legalHistoryMatch[1])
    try {
      const versions = await getDocumentHistory({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, slug)
      return json({ versions })
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/legal/documents' && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const body = (await request.json()) as CreateDocumentVersionInput
      if (!body.slug || !body.title || !body.version || !body.effectiveDate || !body.content) {
        return json({ error: 'slug, title, version, effectiveDate, and content are required' }, 400)
      }
      const document = await createDocumentVersion({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, body, WORKSPACE_USER_ID)
      return json(document, 201)
    } catch (err) {
      return errorResponse(err)
    }
  }

  const legalSlugMatch = url.pathname.match(/^\/legal\/documents\/(.+)$/)
  if (legalSlugMatch && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const slug = decodeURIComponent(legalSlugMatch[1])
    try {
      const document = await getActiveDocument({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, slug)
      if (!document) return json({ error: `No active document for "${slug}"` }, 404)
      return json(document)
    } catch (err) {
      return errorResponse(err)
    }
  }

  if (url.pathname === '/admin/reports' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const status = url.searchParams.get('status') as ReportStatus | null
      const reports = await listReports({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, { status: status ?? undefined })
      return json({ reports })
    } catch (err) {
      return errorResponse(err)
    }
  }

  // Public submission path — filing a report never requires auth, matching
  // this app's current no-auth posture; reviewing/updating one is under
  // /admin.
  if (url.pathname === '/reports' && request.method === 'POST') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    try {
      const body = (await request.json()) as CreateReportInput
      if (!body.category || !body.targetType || !body.description) {
        return json({ error: 'category, targetType, and description are required' }, 400)
      }
      const report = await createReport({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, body)
      return json(report, 201)
    } catch (err) {
      return errorResponse(err)
    }
  }

  const reportIdMatch = url.pathname.match(/^\/admin\/reports\/(.+)$/)
  if (reportIdMatch && request.method === 'PATCH') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return notConfigured('Supabase')
    const id = decodeURIComponent(reportIdMatch[1])
    try {
      const body = (await request.json()) as UpdateReportInput
      if (!body.status) return json({ error: 'status is required' }, 400)
      const report = await updateReport({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, id, body, WORKSPACE_USER_ID)
      if (!report) return json({ error: `Unknown report "${id}"` }, 404)
      return json(report)
    } catch (err) {
      return errorResponse(err)
    }
  }

  return undefined
}
