import type { Env } from '../env'
import { selectRepository } from '../env'
import { generateBrief, getLatestBrief } from './briefApi'
import { getEventDetail, listEvents, parseListEventsQuery } from './eventsApi'

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
 * events/timeline/sources — untouched by this router. Returns `undefined`
 * (falls through to the caller's 404) for any route this doesn't own, so
 * `worker.ts`'s `fetch()` can layer this in front of its existing
 * plain-text placeholder without that placeholder disappearing for
 * unmatched paths.
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response | undefined> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS' && url.pathname.startsWith('/events')) {
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

  return undefined
}
