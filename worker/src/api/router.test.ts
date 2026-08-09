import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleApiRequest } from './router'
import * as eventsApi from './eventsApi'
import * as briefApi from './briefApi'
import * as entityBriefApi from './entityBriefApi'
import * as dashboardApi from './dashboardApi'
import * as entitiesApi from './entitiesApi'
import * as mapApi from './mapApi'
import * as historicalMomentsApi from './historicalMomentsApi'
import * as workspaceApi from './workspaceApi'
import * as bookmarksApi from './bookmarksApi'
import * as adminApi from './adminApi'
import * as configApi from './configApi'
import * as legalApi from './legalApi'
import * as moderationApi from './moderationApi'
import * as profilesApi from './profilesApi'
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
  return { ...actual, getGeoReadiness: vi.fn(), getMapSummary: vi.fn() }
})

vi.mock('./historicalMomentsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof historicalMomentsApi>()
  return { ...actual, listHistoricalMoments: vi.fn(), getHistoricalMomentDetail: vi.fn() }
})

vi.mock('./workspaceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof workspaceApi>()
  return {
    ...actual,
    getWorkspaceOverview: vi.fn(),
    listWatchlists: vi.fn(),
    createWatchlist: vi.fn(),
    updateWatchlist: vi.fn(),
    deleteWatchlist: vi.fn(),
    refreshWatchlist: vi.fn(),
    listAlerts: vi.fn(),
    markAlertRead: vi.fn(),
    markAllAlertsRead: vi.fn(),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  }
})

vi.mock('./bookmarksApi', async (importOriginal) => {
  const actual = await importOriginal<typeof bookmarksApi>()
  return {
    ...actual,
    listBookmarks: vi.fn(),
    addBookmark: vi.fn(),
    updateBookmark: vi.fn(),
    removeBookmark: vi.fn(),
    removeBookmarkByEvent: vi.fn(),
    listCollections: vi.fn(),
  }
})

vi.mock('./adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof adminApi>()
  return {
    ...actual,
    getOverview: vi.fn(),
    getDatabaseOverview: vi.fn(),
    listSources: vi.fn(),
    updateSource: vi.fn(),
    testSource: vi.fn(),
    listAuditLog: vi.fn(),
  }
})

vi.mock('./configApi', async (importOriginal) => {
  const actual = await importOriginal<typeof configApi>()
  return { ...actual, listConfig: vi.fn(), updateConfig: vi.fn() }
})

vi.mock('./legalApi', async (importOriginal) => {
  const actual = await importOriginal<typeof legalApi>()
  return {
    ...actual,
    listActiveDocuments: vi.fn(),
    getActiveDocument: vi.fn(),
    getDocumentHistory: vi.fn(),
    createDocumentVersion: vi.fn(),
  }
})

vi.mock('./moderationApi', async (importOriginal) => {
  const actual = await importOriginal<typeof moderationApi>()
  return { ...actual, listReports: vi.fn(), createReport: vi.fn(), updateReport: vi.fn() }
})

vi.mock('./profilesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof profilesApi>()
  return { ...actual, listProfiles: vi.fn() }
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

  describe('GET /map/summary', () => {
    const summary = {
      countries: [{ country: 'South Africa', total: 5, breaking: 1, significant: 1, routine: 3 }],
      markers: [],
      unknownCount: 2,
      windowHours: 168,
    }

    it('calls getMapSummary with the default window and returns its result as JSON', async () => {
      vi.mocked(mapApi.getMapSummary).mockResolvedValue(summary)
      const res = await handleApiRequest(new Request('https://worker.test/map/summary'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await res?.json()).toEqual(summary)
      expect(mapApi.getMapSummary).toHaveBeenCalledWith(
        { url: configuredEnv.SUPABASE_URL, serviceRoleKey: configuredEnv.SUPABASE_SERVICE_ROLE_KEY },
        undefined,
      )
    })

    it('passes a numeric ?hours= override through', async () => {
      vi.mocked(mapApi.getMapSummary).mockResolvedValue(summary)
      await handleApiRequest(new Request('https://worker.test/map/summary?hours=24'), configuredEnv)
      expect(mapApi.getMapSummary).toHaveBeenCalledWith(expect.anything(), 24)
    })

    it('ignores a malformed ?hours= value rather than passing NaN through', async () => {
      vi.mocked(mapApi.getMapSummary).mockResolvedValue(summary)
      await handleApiRequest(new Request('https://worker.test/map/summary?hours=notanumber'), configuredEnv)
      expect(mapApi.getMapSummary).toHaveBeenCalledWith(expect.anything(), undefined)
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/map/summary'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(mapApi.getMapSummary).not.toHaveBeenCalled()
    })

    it('returns 500 when getMapSummary throws', async () => {
      vi.mocked(mapApi.getMapSummary).mockRejectedValue(new Error('query failed'))
      const res = await handleApiRequest(new Request('https://worker.test/map/summary'), configuredEnv)
      expect(res?.status).toBe(500)
      expect(await res?.json()).toEqual({ error: 'query failed' })
    })

    it('answers OPTIONS preflight for /map/summary too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/map/summary', { method: 'OPTIONS' }), configuredEnv)
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

  describe('GET /workspace/overview', () => {
    it('returns the real overview as JSON', async () => {
      const overview = { counts: { savedSearches: 1, activeMonitoring: 1, bookmarks: 0, unreadAlerts: 0, recentlyUpdated: 0 }, attention: [], quietSearches: [], topSources: [] }
      vi.mocked(workspaceApi.getWorkspaceOverview).mockResolvedValue(overview as never)
      const res = await handleApiRequest(new Request('https://worker.test/workspace/overview'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(overview)
    })

    it('returns 503 when Supabase env is not configured', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/workspace/overview'), unconfiguredEnv)
      expect(res?.status).toBe(503)
      expect(workspaceApi.getWorkspaceOverview).not.toHaveBeenCalled()
    })

    it('answers OPTIONS preflight for /workspace too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/workspace/overview', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })
  })

  describe('/watchlists', () => {
    it('GET lists real watchlists as JSON', async () => {
      vi.mocked(workspaceApi.listWatchlists).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/watchlists'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ watchlists: [] })
    })

    it('answers OPTIONS preflight for /watchlists too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/watchlists', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })

    it('POST creates a watchlist from the request body', async () => {
      const created = { id: 'w-1', name: 'Cape Town infra', filters: {}, active: true, notify: true, lastCheckedAt: null, createdAt: 'x', updatedAt: 'x', newResultsCount: 0, lastActivityAt: null, quiet: false }
      vi.mocked(workspaceApi.createWatchlist).mockResolvedValue(created)
      const res = await handleApiRequest(
        new Request('https://worker.test/watchlists', { method: 'POST', body: JSON.stringify({ name: 'Cape Town infra', filters: { categories: ['government'] } }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(201)
      expect(await res?.json()).toEqual(created)
      expect(workspaceApi.createWatchlist).toHaveBeenCalledWith(expect.anything(), { name: 'Cape Town infra', filters: { categories: ['government'] } })
    })

    it('POST returns 400 when name is missing', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/watchlists', { method: 'POST', body: JSON.stringify({}) }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(workspaceApi.createWatchlist).not.toHaveBeenCalled()
    })

    it('PATCH updates a watchlist by id', async () => {
      vi.mocked(workspaceApi.updateWatchlist).mockResolvedValue({ id: 'w-1' } as never)
      const res = await handleApiRequest(
        new Request('https://worker.test/watchlists/w-1', { method: 'PATCH', body: JSON.stringify({ active: false }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(200)
      expect(workspaceApi.updateWatchlist).toHaveBeenCalledWith(expect.anything(), 'w-1', { active: false })
    })

    it('PATCH returns 404 when the watchlist does not exist', async () => {
      vi.mocked(workspaceApi.updateWatchlist).mockResolvedValue(undefined)
      const res = await handleApiRequest(
        new Request('https://worker.test/watchlists/missing', { method: 'PATCH', body: JSON.stringify({ active: false }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(404)
    })

    it('DELETE removes a watchlist by id', async () => {
      vi.mocked(workspaceApi.deleteWatchlist).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/watchlists/w-1', { method: 'DELETE' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(workspaceApi.deleteWatchlist).toHaveBeenCalledWith(expect.anything(), 'w-1')
    })
  })

  describe('POST /watchlists/:id/refresh', () => {
    it('is checked before the generic /watchlists/:id route and returns the refresh result', async () => {
      const result = { watchlist: { id: 'w-1' }, insertedCount: 3 }
      vi.mocked(workspaceApi.refreshWatchlist).mockResolvedValue(result as never)
      const res = await handleApiRequest(new Request('https://worker.test/watchlists/w-1/refresh', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual(result)
      expect(workspaceApi.updateWatchlist).not.toHaveBeenCalled()
    })

    it('returns 404 when the watchlist does not exist', async () => {
      vi.mocked(workspaceApi.refreshWatchlist).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/watchlists/missing/refresh', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(404)
    })
  })

  describe('/alerts', () => {
    it('GET lists real alerts as JSON, passing watchlistId/unreadOnly through', async () => {
      vi.mocked(workspaceApi.listAlerts).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/alerts?watchlistId=w-1&unreadOnly=true'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ alerts: [] })
      expect(workspaceApi.listAlerts).toHaveBeenCalledWith(expect.anything(), { watchlistId: 'w-1', unreadOnly: true })
    })

    it('PATCH /alerts/:id marks a single alert read', async () => {
      vi.mocked(workspaceApi.markAlertRead).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/alerts/a-1', { method: 'PATCH' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(workspaceApi.markAlertRead).toHaveBeenCalledWith(expect.anything(), 'a-1')
    })

    it('POST /alerts/read-all is checked before the generic /alerts/:id route', async () => {
      vi.mocked(workspaceApi.markAllAlertsRead).mockResolvedValue(5)
      const res = await handleApiRequest(new Request('https://worker.test/alerts/read-all', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ updated: 5 })
      expect(workspaceApi.markAlertRead).not.toHaveBeenCalled()
    })
  })

  describe('/bookmarks', () => {
    it('GET lists real bookmarks, parsing collection/priority/unreadOnly filters', async () => {
      vi.mocked(bookmarksApi.listBookmarks).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/bookmarks?collection=Investigations&priority=high&unreadOnly=true'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ bookmarks: [] })
      expect(bookmarksApi.listBookmarks).toHaveBeenCalledWith(expect.anything(), { collection: 'Investigations', priority: 'high', unreadOnly: true })
    })

    it('GET ignores an invalid ?priority= value rather than passing it through', async () => {
      vi.mocked(bookmarksApi.listBookmarks).mockResolvedValue([])
      await handleApiRequest(new Request('https://worker.test/bookmarks?priority=extreme'), configuredEnv)
      expect(bookmarksApi.listBookmarks).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ priority: undefined }))
    })

    it('POST adds a bookmark from the request body', async () => {
      const bookmark = { id: 'b-1', event: { id: 'evt-1' } }
      vi.mocked(bookmarksApi.addBookmark).mockResolvedValue(bookmark as never)
      const res = await handleApiRequest(
        new Request('https://worker.test/bookmarks', { method: 'POST', body: JSON.stringify({ normalizedEventId: 'evt-1', collection: 'Investigations' }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(201)
      expect(await res?.json()).toEqual(bookmark)
      expect(bookmarksApi.addBookmark).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ normalizedEventId: 'evt-1', collection: 'Investigations' }))
    })

    it('POST returns 400 when normalizedEventId is missing', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/bookmarks', { method: 'POST', body: JSON.stringify({}) }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(bookmarksApi.addBookmark).not.toHaveBeenCalled()
    })

    it('DELETE /bookmarks?eventId= un-bookmarks by event id, not row id', async () => {
      vi.mocked(bookmarksApi.removeBookmarkByEvent).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/bookmarks?eventId=evt-1', { method: 'DELETE' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(bookmarksApi.removeBookmarkByEvent).toHaveBeenCalledWith(expect.anything(), 'evt-1')
    })

    it('DELETE /bookmarks without ?eventId= returns 400', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/bookmarks', { method: 'DELETE' }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(bookmarksApi.removeBookmarkByEvent).not.toHaveBeenCalled()
    })

    it('GET /bookmarks/collections lists real collections, checked before the generic /bookmarks/:id route', async () => {
      vi.mocked(bookmarksApi.listCollections).mockResolvedValue([{ name: 'Investigations', count: 3 }])
      const res = await handleApiRequest(new Request('https://worker.test/bookmarks/collections'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ collections: [{ name: 'Investigations', count: 3 }] })
    })

    it('PATCH /bookmarks/:id updates a bookmark by id', async () => {
      vi.mocked(bookmarksApi.updateBookmark).mockResolvedValue({ id: 'b-1' } as never)
      const res = await handleApiRequest(
        new Request('https://worker.test/bookmarks/b-1', { method: 'PATCH', body: JSON.stringify({ read: true }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(200)
      expect(bookmarksApi.updateBookmark).toHaveBeenCalledWith(expect.anything(), 'b-1', { read: true })
    })

    it('PATCH /bookmarks/:id returns 404 when not found', async () => {
      vi.mocked(bookmarksApi.updateBookmark).mockResolvedValue(undefined)
      const res = await handleApiRequest(
        new Request('https://worker.test/bookmarks/missing', { method: 'PATCH', body: JSON.stringify({ read: true }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(404)
    })

    it('DELETE /bookmarks/:id removes a bookmark by row id', async () => {
      vi.mocked(bookmarksApi.removeBookmark).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/bookmarks/b-1', { method: 'DELETE' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(bookmarksApi.removeBookmark).toHaveBeenCalledWith(expect.anything(), 'b-1')
    })
  })

  describe('/notifications', () => {
    it('GET lists real notifications as JSON', async () => {
      vi.mocked(workspaceApi.listNotifications).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/notifications'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ notifications: [] })
    })

    it('PATCH /notifications/:id marks a single notification read', async () => {
      vi.mocked(workspaceApi.markNotificationRead).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/notifications/n-1', { method: 'PATCH' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(workspaceApi.markNotificationRead).toHaveBeenCalledWith(expect.anything(), 'n-1')
    })

    it('POST /notifications/read-all is checked before the generic /notifications/:id route', async () => {
      vi.mocked(workspaceApi.markAllNotificationsRead).mockResolvedValue(4)
      const res = await handleApiRequest(new Request('https://worker.test/notifications/read-all', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ updated: 4 })
      expect(workspaceApi.markNotificationRead).not.toHaveBeenCalled()
    })
  })

  describe('/admin', () => {
    it('answers OPTIONS preflight for /admin too', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/admin/overview', { method: 'OPTIONS' }), configuredEnv)
      expect(res?.status).toBe(204)
    })

    it('GET /admin/overview passes real service-configured flags through', async () => {
      const overview = { database: { connected: true }, ingestion: {}, services: {}, pipeline: [] }
      vi.mocked(adminApi.getOverview).mockResolvedValue(overview as never)
      const res = await handleApiRequest(new Request('https://worker.test/admin/overview'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(adminApi.getOverview).toHaveBeenCalledWith(expect.anything(), { geminiConfigured: true, anthropicConfigured: false })
    })

    it('GET /admin/database returns real metrics', async () => {
      vi.mocked(adminApi.getDatabaseOverview).mockResolvedValue([{ label: 'Events', count: 500 }])
      const res = await handleApiRequest(new Request('https://worker.test/admin/database'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ metrics: [{ label: 'Events', count: 500 }] })
    })

    it('GET /admin/sources lists real sources', async () => {
      vi.mocked(adminApi.listSources).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/admin/sources'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ sources: [] })
    })

    it('PATCH /admin/sources/:id updates a source and returns 404 for an unknown id', async () => {
      vi.mocked(adminApi.updateSource).mockResolvedValue(undefined)
      const res = await handleApiRequest(
        new Request('https://worker.test/admin/sources/missing', { method: 'PATCH', body: JSON.stringify({ enabled: false }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(404)
      expect(adminApi.updateSource).toHaveBeenCalledWith(expect.anything(), 'missing', { enabled: false }, expect.any(String))
    })

    it('POST /admin/sources/:id/test is checked before the generic /admin/sources/:id route', async () => {
      vi.mocked(adminApi.testSource).mockResolvedValue({ connectorId: 'nasa-news', healthy: true, checkedAt: 'x' })
      const res = await handleApiRequest(new Request('https://worker.test/admin/sources/nasa-news/test', { method: 'POST' }), configuredEnv)
      expect(res?.status).toBe(200)
      expect(adminApi.updateSource).not.toHaveBeenCalled()
    })

    it('GET /admin/audit-log returns real entries', async () => {
      vi.mocked(adminApi.listAuditLog).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/admin/audit-log'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ entries: [] })
    })

    it('GET /admin/config lists real config entries', async () => {
      vi.mocked(configApi.listConfig).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/admin/config'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ entries: [] })
    })

    it('PATCH /admin/config/:key returns 400 when value is missing', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/admin/config/appearance', { method: 'PATCH', body: JSON.stringify({}) }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(configApi.updateConfig).not.toHaveBeenCalled()
    })

    it('PATCH /admin/config/:key returns 404 for an unknown key', async () => {
      vi.mocked(configApi.updateConfig).mockResolvedValue(undefined)
      const res = await handleApiRequest(
        new Request('https://worker.test/admin/config/missing', { method: 'PATCH', body: JSON.stringify({ value: {} }) }),
        configuredEnv,
      )
      expect(res?.status).toBe(404)
    })

    it('GET /admin/profiles renders a real (possibly empty) list', async () => {
      vi.mocked(profilesApi.listProfiles).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/admin/profiles'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ profiles: [] })
    })

    it('GET /admin/legal/documents/:slug/history is checked before nothing conflicting and returns real versions', async () => {
      vi.mocked(legalApi.getDocumentHistory).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/admin/legal/documents/privacy-policy/history'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(legalApi.getDocumentHistory).toHaveBeenCalledWith(expect.anything(), 'privacy-policy')
    })

    it('POST /admin/legal/documents returns 400 when required fields are missing', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/admin/legal/documents', { method: 'POST', body: JSON.stringify({}) }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(legalApi.createDocumentVersion).not.toHaveBeenCalled()
    })

    it('GET /admin/reports supports an optional ?status= filter', async () => {
      vi.mocked(moderationApi.listReports).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/admin/reports?status=open'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(moderationApi.listReports).toHaveBeenCalledWith(expect.anything(), { status: 'open' })
    })

    it('PATCH /admin/reports/:id returns 400 when status is missing', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/admin/reports/r-1', { method: 'PATCH', body: JSON.stringify({}) }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(moderationApi.updateReport).not.toHaveBeenCalled()
    })
  })

  describe('/legal and /reports (public)', () => {
    it('GET /legal/documents lists real active documents', async () => {
      vi.mocked(legalApi.listActiveDocuments).mockResolvedValue([])
      const res = await handleApiRequest(new Request('https://worker.test/legal/documents'), configuredEnv)
      expect(res?.status).toBe(200)
      expect(await res?.json()).toEqual({ documents: [] })
    })

    it('GET /legal/documents/:slug returns 404 when no active document exists', async () => {
      vi.mocked(legalApi.getActiveDocument).mockResolvedValue(undefined)
      const res = await handleApiRequest(new Request('https://worker.test/legal/documents/missing-policy'), configuredEnv)
      expect(res?.status).toBe(404)
    })

    it('POST /reports returns 400 when required fields are missing, and never requires auth', async () => {
      const res = await handleApiRequest(new Request('https://worker.test/reports', { method: 'POST', body: JSON.stringify({}) }), configuredEnv)
      expect(res?.status).toBe(400)
      expect(moderationApi.createReport).not.toHaveBeenCalled()
    })

    it('POST /reports creates a real report', async () => {
      vi.mocked(moderationApi.createReport).mockResolvedValue({ id: 'r-1', status: 'open' } as never)
      const res = await handleApiRequest(
        new Request('https://worker.test/reports', {
          method: 'POST',
          body: JSON.stringify({ category: 'copyright_complaint', targetType: 'event', description: 'x' }),
        }),
        configuredEnv,
      )
      expect(res?.status).toBe(201)
    })
  })
})
