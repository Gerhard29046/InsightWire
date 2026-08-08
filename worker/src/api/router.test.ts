import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleApiRequest } from './router'
import * as eventsApi from './eventsApi'
import * as briefApi from './briefApi'
import * as dashboardApi from './dashboardApi'
import type { Env } from '../env'

vi.mock('./eventsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof eventsApi>()
  return { ...actual, listEvents: vi.fn(), getEventDetail: vi.fn() }
})

vi.mock('./briefApi', async (importOriginal) => {
  const actual = await importOriginal<typeof briefApi>()
  return { ...actual, getLatestBrief: vi.fn(), generateBrief: vi.fn() }
})

vi.mock('./dashboardApi', async (importOriginal) => {
  const actual = await importOriginal<typeof dashboardApi>()
  return { ...actual, getDashboardSummary: vi.fn() }
})

const configuredEnv: Env = {
  RAW_EVENTS_QUEUE: {} as never,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  GEMINI_API_KEY: 'gemini-key',
}

const unconfiguredEnv: Env = { RAW_EVENTS_QUEUE: {} as never }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleApiRequest', () => {
  it('returns undefined for routes it does not own, so the caller can fall through', async () => {
    const res = await handleApiRequest(new Request('https://worker.test/'), configuredEnv)
    expect(res).toBeUndefined()
  })

  it('returns undefined for non-GET/OPTIONS methods on /events', async () => {
    const res = await handleApiRequest(new Request('https://worker.test/events', { method: 'POST' }), configuredEnv)
    expect(res).toBeUndefined()
  })

  it('answers OPTIONS preflight with CORS headers and no body', async () => {
    const res = await handleApiRequest(new Request('https://worker.test/events', { method: 'OPTIONS' }), configuredEnv)
    expect(res?.status).toBe(204)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('returns 503 (not a crash) when Supabase env is not configured', async () => {
    const res = await handleApiRequest(new Request('https://worker.test/events'), unconfiguredEnv)
    expect(res?.status).toBe(503)
    const body = (await res?.json()) as { error: string }
    expect(body.error).toMatch(/not configured/i)
  })

  it('calls listEvents and returns its result as JSON with CORS headers', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ events: [], nextCursor: null, totalCount: 0 })
    const res = await handleApiRequest(new Request('https://worker.test/events?sort=latest'), configuredEnv)
    expect(res?.status).toBe(200)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res?.json()).toEqual({ events: [], nextCursor: null, totalCount: 0 })
    expect(eventsApi.listEvents).toHaveBeenCalledWith(
      { url: configuredEnv.SUPABASE_URL, serviceRoleKey: configuredEnv.SUPABASE_SERVICE_ROLE_KEY },
      expect.objectContaining({ sort: 'latest' }),
    )
  })

  it('returns 500 with the error message when listEvents throws', async () => {
    vi.mocked(eventsApi.listEvents).mockRejectedValue(new Error('boom'))
    const res = await handleApiRequest(new Request('https://worker.test/events'), configuredEnv)
    expect(res?.status).toBe(500)
    expect(await res?.json()).toEqual({ error: 'boom' })
  })

  it('decodes the id and returns detail JSON for /events/:id', async () => {
    const detail = { event: { id: 'nws-alerts:ev 1' }, timeline: [], sources: undefined, relatedEvents: [] }
    vi.mocked(eventsApi.getEventDetail).mockResolvedValue(detail as never)

    const res = await handleApiRequest(new Request('https://worker.test/events/nws-alerts%3Aev%201'), configuredEnv)
    expect(res?.status).toBe(200)
    expect(await res?.json()).toEqual(detail)
    expect(eventsApi.getEventDetail).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'nws-alerts:ev 1')
  })

  it('returns 404 when getEventDetail finds nothing', async () => {
    vi.mocked(eventsApi.getEventDetail).mockResolvedValue(undefined)
    const res = await handleApiRequest(new Request('https://worker.test/events/missing'), configuredEnv)
    expect(res?.status).toBe(404)
  })

  describe('GET /dashboard/summary', () => {
    const summary = {
      eventsTracked24h: 517,
      highPriorityAlerts24h: 12,
      countriesReporting: 4,
      sourcesReporting: 5,
      categoryBreakdown: [{ category: 'government', count: 40 }],
      highestSignalEvents: [],
      generatedAt: '2026-08-08T00:00:00.000Z',
    }

    it('calls getDashboardSummary with the default window and returns its result as JSON', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary as never)
      const res = await handleApiRequest(new Request('https://worker.test/dashboard/summary'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await res?.json()).toEqual(summary)
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledWith(
        { url: configuredEnv.SUPABASE_URL, serviceRoleKey: configuredEnv.SUPABASE_SERVICE_ROLE_KEY },
        undefined,
      )
    })

    it('passes a numeric ?hours= override through', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary as never)
      await handleApiRequest(new Request('https://worker.test/dashboard/summary?hours=6'), configuredEnv)
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledWith(expect.anything(), 6)
    })

    it('ignores a malformed ?hours= value rather than passing NaN through', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary as never)
      await handleApiRequest(new Request('https://worker.test/dashboard/summary?hours=notanumber'), configuredEnv)
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledWith(expect.anything(), undefined)
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/dashboard/summary'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(dashboardApi.getDashboardSummary).not.toHaveBeenCalled()
    })

    it('returns 500 when getDashboardSummary throws', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockRejectedValue(new Error('query failed'))
      const res = await handleApiRequest(new Request('https://worker.test/dashboard/summary'), configuredEnv)
      expect(res?.status).toBe(500)
      expect(await res?.json()).toEqual({ error: 'query failed' })
    })

    it('answers OPTIONS preflight for /dashboard too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/dashboard/summary', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })
  })

  describe('GET /events/:id/brief', () => {
    it('returns the cached brief when one exists', async () => {
      const brief = { summary: 'x' }
      vi.mocked(briefApi.getLatestBrief).mockResolvedValue(brief as never)
      const res = await handleApiRequest(new Request('https://worker.test/events/nws-alerts%3Aev-1/brief'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(brief)
      expect(briefApi.getLatestBrief).toHaveBeenCalledWith(expect.anything(), 'nws-alerts:ev-1')
    })

    it('returns 404 when no brief has been generated yet', async () => {
      vi.mocked(briefApi.getLatestBrief).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/events/nws-alerts%3Aev-1/brief'), configuredEnv)
      expect(res?.status).toBe(404)
    })

    it('does not require GEMINI_API_KEY for a GET (read of a cached brief)', async () => {
      vi.mocked(briefApi.getLatestBrief).mockResolvedValue({ summary: 'x' } as never)
      const envWithoutGemini: Env = { ...configuredEnv, GEMINI_API_KEY: undefined }
      const res = await handleApiRequest(new Request('https://worker.test/events/ev-1/brief'), envWithoutGemini)
      expect(res?.status).toBe(200)
    })
  })

  describe('POST /events/:id/brief', () => {
    it('generates and returns a new brief', async () => {
      const brief = { summary: 'x' }
      vi.mocked(briefApi.generateBrief).mockResolvedValue(brief as never)
      const res = await handleApiRequest(new Request('https://worker.test/events/nws-alerts%3Aev-1/brief', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(brief)
      expect(briefApi.generateBrief).toHaveBeenCalledWith(expect.objectContaining({ geminiApiKey: 'gemini-key' }), 'nws-alerts:ev-1')
    })

    it('returns 503 when GEMINI_API_KEY is not configured', async () => {
      const envWithoutGemini: Env = { ...configuredEnv, GEMINI_API_KEY: undefined }
      const res = await handleApiRequest(new Request('https://worker.test/events/ev-1/brief', { method: 'POST' }), envWithoutGemini)
      expect(res?.status).toBe(503)
      expect(briefApi.generateBrief).not.toHaveBeenCalled()
    })

    it('returns 404 when the event does not exist', async () => {
      vi.mocked(briefApi.generateBrief).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/events/missing/brief', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(404)
    })

    it('returns 500 when brief generation throws (e.g. Gemini API error)', async () => {
      vi.mocked(briefApi.generateBrief).mockRejectedValue(new Error('Gemini brief request failed: HTTP 429'))
      const res = await handleApiRequest(new Request('https://worker.test/events/ev-1/brief', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(500)
      expect(await res?.json()).toEqual({ error: 'Gemini brief request failed: HTTP 429' })
    })
  })
})
