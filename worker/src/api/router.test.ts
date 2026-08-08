import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleApiRequest } from './router'
import * as eventsApi from './eventsApi'
import * as briefApi from './briefApi'
import * as entityBriefApi from './entityBriefApi'
import * as dashboardApi from './dashboardApi'
import * as entitiesApi from './entitiesApi'
import * as mapApi from './mapApi'
import * as historicalMomentsApi from './historicalMomentsApi'
import type { Env } from '../env'

vi.mock('./eventsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof eventsApi>()
  return { ...actual, listEvents: vi.fn(), getEventDetail: vi.fn() }
})

vi.mock('./briefApi', async (importOriginal) => {
  const actual = await importOriginal<typeof briefApi>()
  return { ...actual, getLatestBrief: vi.fn(), generateBrief: vi.fn() }
})

vi.mock('./entityBriefApi', async (importOriginal) => {
  const actual = await importOriginal<typeof entityBriefApi>()
  return { ...actual, getLatestEntityBrief: vi.fn(), generateEntityBrief: vi.fn() }
})

vi.mock('./dashboardApi', async (importOriginal) => {
  const actual = await importOriginal<typeof dashboardApi>()
  return { ...actual, getDashboardSummary: vi.fn() }
})

vi.mock('./entitiesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof entitiesApi>()
  return { ...actual, listEntities: vi.fn(), getEntityDetail: vi.fn() }
})

vi.mock('./mapApi', async (importOriginal) => {
  const actual = await importOriginal<typeof mapApi>()
  return { ...actual, getGeoReadiness: vi.fn() }
})

vi.mock('./historicalMomentsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof historicalMomentsApi>()
  return { ...actual, listHistoricalMoments: vi.fn(), getHistoricalMomentDetail: vi.fn() }
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
        undefined,
      )
    })

    it('passes a numeric ?hours= override through', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary as never)
      await handleApiRequest(new Request('https://worker.test/dashboard/summary?hours=6'), configuredEnv)
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledWith(expect.anything(), 6, undefined)
    })

    it('ignores a malformed ?hours= value rather than passing NaN through', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary as never)
      await handleApiRequest(new Request('https://worker.test/dashboard/summary?hours=notanumber'), configuredEnv)
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledWith(expect.anything(), undefined, undefined)
    })

    it('passes repeated real ?country= params through as a country array (a region selection already translated by the caller)', async () => {
      vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary as never)
      await handleApiRequest(new Request('https://worker.test/dashboard/summary?country=South+Africa&country=Nigeria'), configuredEnv)
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledWith(expect.anything(), undefined, ['South Africa', 'Nigeria'])
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

  describe('GET /map/geo-readiness', () => {
    const readiness = { withCoordinates: 823, withoutCoordinates: 4102 }

    it('calls getGeoReadiness and returns its result as JSON', async () => {
      vi.mocked(mapApi.getGeoReadiness).mockResolvedValue(readiness);
      const res = await handleApiRequest(new Request('https://worker.test/map/geo-readiness'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await res?.json()).toEqual(readiness)
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/map/geo-readiness'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(mapApi.getGeoReadiness).not.toHaveBeenCalled()
    })

    it('returns 500 when getGeoReadiness throws', async () => {
      vi.mocked(mapApi.getGeoReadiness).mockRejectedValue(new Error('query failed'))
      const res = await handleApiRequest(new Request('https://worker.test/map/geo-readiness'), configuredEnv)
      expect(res?.status).toBe(500)
      expect(await res?.json()).toEqual({ error: 'query failed' })
    })

    it('answers OPTIONS preflight for /map too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/map/geo-readiness', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })
  })

  describe('GET /historical-moments', () => {
    it('returns a real (possibly empty) list as JSON', async () => {
      vi.mocked(historicalMomentsApi.listHistoricalMoments).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/historical-moments'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ moments: [] })
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/historical-moments'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(historicalMomentsApi.listHistoricalMoments).not.toHaveBeenCalled()
    })

    it('returns 500 when listHistoricalMoments throws', async () => {
      vi.mocked(historicalMomentsApi.listHistoricalMoments).mockRejectedValue(new Error('query failed'))
      const res = await handleApiRequest(new Request('https://worker.test/historical-moments'), configuredEnv)
      expect(res?.status).toBe(500)
    })

    it('answers OPTIONS preflight for /historical-moments too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/historical-moments', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })
  })

  describe('GET /historical-moments/:id', () => {
    it('returns the real moment as JSON', async () => {
      const moment = { id: 'm1', title: 'x' }
      vi.mocked(historicalMomentsApi.getHistoricalMomentDetail).mockResolvedValue(moment as never)
      const res = await handleApiRequest(new Request('https://worker.test/historical-moments/m1'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(moment)
    })

    it('returns 404 when no real moment matches', async () => {
      vi.mocked(historicalMomentsApi.getHistoricalMomentDetail).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/historical-moments/missing'), configuredEnv)
      expect(res?.status).toBe(404)
    })
  })

  describe('GET /entities', () => {
    it('calls listEntities and returns its result as JSON with CORS headers', async () => {
      vi.mocked(entitiesApi.listEntities).mockResolvedValue({ entities: [], nextCursor: null, totalCount: 0 })
      const res = await handleApiRequest(new Request('https://worker.test/entities?q=Ramaphosa'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await res?.json()).toEqual({ entities: [], nextCursor: null, totalCount: 0 })
      expect(entitiesApi.listEntities).toHaveBeenCalledWith(
        { url: configuredEnv.SUPABASE_URL, serviceRoleKey: configuredEnv.SUPABASE_SERVICE_ROLE_KEY },
        expect.objectContaining({ search: 'Ramaphosa' }),
      )
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/entities'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(entitiesApi.listEntities).not.toHaveBeenCalled()
    })

    it('returns 500 when listEntities throws', async () => {
      vi.mocked(entitiesApi.listEntities).mockRejectedValue(new Error('query failed'))
      const res = await handleApiRequest(new Request('https://worker.test/entities'), configuredEnv)
      expect(res?.status).toBe(500)
      expect(await res?.json()).toEqual({ error: 'query failed' })
    })

    it('answers OPTIONS preflight for /entities too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/entities', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })
  })

  describe('GET /entities/:id', () => {
    const detail = {
      entity: { id: 'e-1', type: 'country', name: 'South Africa', country: null, firstSeenAt: '2026-08-01T00:00:00.000Z', lastSeenAt: '2026-08-08T00:00:00.000Z' },
      stats: { totalEvents: 18, eventsLast24h: 2, eventsLast7d: 9, eventsLast30d: 18 },
      recentEvents: [],
      recentEventsNextCursor: null,
      connectedEntities: [],
      countries: [],
      sources: [],
    }

    it('returns the entity detail bundle as JSON', async () => {
      vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(detail as never)
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(detail)
      expect(entitiesApi.getEntityDetail).toHaveBeenCalledWith(
        { url: configuredEnv.SUPABASE_URL, serviceRoleKey: configuredEnv.SUPABASE_SERVICE_ROLE_KEY },
        'e-1',
        expect.objectContaining({ eventsCursor: null }),
      )
    })

    it('returns 404 when the entity does not exist', async () => {
      vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/entities/missing'), configuredEnv)
      expect(res?.status).toBe(404)
    })

    it('decodes a URL-encoded id', async () => {
      vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(detail as never)
      await handleApiRequest(new Request('https://worker.test/entities/e-1%3Afoo'), configuredEnv)
      expect(entitiesApi.getEntityDetail).toHaveBeenCalledWith(expect.anything(), 'e-1:foo', expect.anything())
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(entitiesApi.getEntityDetail).not.toHaveBeenCalled()
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

  describe('GET /entities/:id/brief', () => {
    it('returns the cached brief when one exists, and is checked before the generic /entities/:id route', async () => {
      const brief = { summary: 'x' }
      vi.mocked(entityBriefApi.getLatestEntityBrief).mockResolvedValue(brief as never)
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1/brief'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(brief)
      expect(entityBriefApi.getLatestEntityBrief).toHaveBeenCalledWith(expect.anything(), 'e-1')
      expect(entitiesApi.getEntityDetail).not.toHaveBeenCalled()
    })

    it('returns 404 when no brief has been generated yet', async () => {
      vi.mocked(entityBriefApi.getLatestEntityBrief).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1/brief'), configuredEnv)
      expect(res?.status).toBe(404)
    })

    it('does not require GEMINI_API_KEY for a GET (read of a cached brief)', async () => {
      vi.mocked(entityBriefApi.getLatestEntityBrief).mockResolvedValue({ summary: 'x' } as never)
      const envWithoutGemini: Env = { ...configuredEnv, GEMINI_API_KEY: undefined }
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1/brief'), envWithoutGemini)
      expect(res?.status).toBe(200)
    })
  })

  describe('POST /entities/:id/brief', () => {
    it('generates and returns a new brief', async () => {
      const brief = { summary: 'x' }
      vi.mocked(entityBriefApi.generateEntityBrief).mockResolvedValue(brief as never)
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1/brief', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(brief)
      expect(entityBriefApi.generateEntityBrief).toHaveBeenCalledWith(expect.objectContaining({ geminiApiKey: 'gemini-key' }), 'e-1')
    })

    it('returns 503 when GEMINI_API_KEY is not configured', async () => {
      const envWithoutGemini: Env = { ...configuredEnv, GEMINI_API_KEY: undefined }
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1/brief', { method: 'POST' }), envWithoutGemini)
      expect(res?.status).toBe(503)
      expect(entityBriefApi.generateEntityBrief).not.toHaveBeenCalled()
    })

    it('returns 404 when the entity does not exist', async () => {
      vi.mocked(entityBriefApi.generateEntityBrief).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/entities/missing/brief', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(404)
    })

    it('returns 500 when brief generation throws (e.g. Gemini API error)', async () => {
      vi.mocked(entityBriefApi.generateEntityBrief).mockRejectedValue(new Error('Gemini entity brief request failed: HTTP 429'))
      const res = await handleApiRequest(new Request('https://worker.test/entities/e-1/brief', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(500)
      expect(await res?.json()).toEqual({ error: 'Gemini entity brief request failed: HTTP 429' })
    })
  })
})
