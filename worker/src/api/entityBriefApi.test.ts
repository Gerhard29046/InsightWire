import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { generateEntityBrief, getLatestEntityBrief } from './entityBriefApi'
import * as entitiesApi from './entitiesApi'
import type { EntityDetail } from './entitiesApi'
import type { EntityBrief, EntityBriefProvider } from '../pipeline/ai/entityBriefProvider'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('./entitiesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof entitiesApi>()
  return { ...actual, getEntityDetail: vi.fn() }
})

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

function makeFakeClient(result: QueryResult) {
  const chain = makeChain(result)
  const client = { from: vi.fn(() => chain) }
  return { client, chain }
}

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sanews:ev-1',
    title: 'Cabinet approves budget',
    description: 'A description.',
    country: 'South Africa',
    category: 'government',
    source: 'SAnews',
    sourceUrl: 'https://sanews.gov.za/1',
    publishedAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.6,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'live',
    ...overrides,
  }
}

function makeDetail(overrides: Partial<EntityDetail> = {}): EntityDetail {
  return {
    entity: { id: 'e-1', type: 'country', name: 'South Africa', country: null, firstSeenAt: '2026-08-01T00:00:00.000Z', lastSeenAt: '2026-08-08T00:00:00.000Z' },
    stats: { totalEvents: 1, eventsLast24h: 1, eventsLast7d: 1, eventsLast30d: 1 },
    recentEvents: [makeEvent()],
    recentEventsNextCursor: null,
    breakingEvents: [],
    upcomingEvents: [],
    connectedEntities: [],
    relationships: [],
    countries: [{ label: 'South Africa', count: 1 }],
    sources: [{ label: 'SAnews', count: 1 }],
    ...overrides,
  }
}

function fakeBrief(overrides: Partial<EntityBrief> = {}): EntityBrief {
  return {
    summary: 'x',
    whatChanged: 'x',
    confirmedFacts: [{ statement: 'Cabinet approved the budget', eventId: 'sanews:ev-1' }],
    aiInterpretation: [],
    whatToWatch: [],
    sourcesConfirming: ['SAnews'],
    model: 'gemini-flash-latest',
    generatedAt: '2026-08-08T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getLatestEntityBrief', () => {
  it('returns undefined when no brief has ever been generated', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    expect(await getLatestEntityBrief(config, 'e-1')).toBeUndefined()
  })

  it('returns the most recent brief when one exists', async () => {
    const brief = fakeBrief()
    const { client } = makeFakeClient({ data: { brief, model: brief.model, generated_at: brief.generatedAt }, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    expect(await getLatestEntityBrief(config, 'e-1')).toEqual(brief)
  })

  it('throws on a query error', async () => {
    const { client } = makeFakeClient({ data: null, error: { message: 'boom' } })
    vi.mocked(createClient).mockReturnValue(client as never)
    await expect(getLatestEntityBrief(config, 'e-1')).rejects.toThrow(/boom/)
  })
})

describe('generateEntityBrief', () => {
  function makeProvider(brief: EntityBrief = fakeBrief()): EntityBriefProvider {
    return { name: 'gemini', generateBrief: vi.fn().mockResolvedValue(brief) }
  }

  it('returns undefined without calling the provider when the entity does not exist', async () => {
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(undefined)
    const provider = makeProvider()
    const result = await generateEntityBrief({ config, provider }, 'missing')
    expect(result).toBeUndefined()
    expect(provider.generateBrief).not.toHaveBeenCalled()
  })

  it('throws when neither an explicit provider nor a Gemini key is given', async () => {
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(makeDetail())
    await expect(generateEntityBrief({ config }, 'e-1')).rejects.toThrow(/No entity brief provider configured/)
  })

  it('inserts the generated (validated) brief and returns it', async () => {
    const { client, chain } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(makeDetail())
    const provider = makeProvider()

    const result = await generateEntityBrief({ config, provider }, 'e-1')

    expect(result).toEqual(fakeBrief())
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ entity_id: 'e-1', model: 'gemini-flash-latest' }))
  })

  it('drops a confirmedFacts citation pointing at an event id that was never actually supplied as evidence', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(makeDetail())
    const provider = makeProvider(fakeBrief({ confirmedFacts: [{ statement: 'Something invented', eventId: 'made-up:ev-999' }] }))

    const result = await generateEntityBrief({ config, provider }, 'e-1')
    expect(result?.confirmedFacts).toEqual([])
  })

  it('forces whatToWatch empty when no real upcoming events were supplied, even if the model returned some', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(makeDetail({ upcomingEvents: [] }))
    const provider = makeProvider(fakeBrief({ whatToWatch: ['A made-up future event'] }))

    const result = await generateEntityBrief({ config, provider }, 'e-1')
    expect(result?.whatToWatch).toEqual([])
  })

  it('keeps whatToWatch when real upcoming events were actually supplied', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(
      makeDetail({ upcomingEvents: [makeEvent({ id: 'sanews:ev-2', title: 'Parliament sitting', status: 'scheduled' })] }),
    )
    const provider = makeProvider(fakeBrief({ whatToWatch: ['Watch the upcoming Parliament sitting'] }))

    const result = await generateEntityBrief({ config, provider }, 'e-1')
    expect(result?.whatToWatch).toEqual(['Watch the upcoming Parliament sitting'])
  })

  it('drops a sourcesConfirming entry naming a source that was never actually supplied', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(makeDetail())
    const provider = makeProvider(fakeBrief({ sourcesConfirming: ['SAnews', 'Reuters (invented)'] }))

    const result = await generateEntityBrief({ config, provider }, 'e-1')
    expect(result?.sourcesConfirming).toEqual(['SAnews'])
  })

  it('throws on an insert error', async () => {
    const { client } = makeFakeClient({ data: null, error: { message: 'insert failed' } })
    vi.mocked(createClient).mockReturnValue(client as never)
    vi.mocked(entitiesApi.getEntityDetail).mockResolvedValue(makeDetail())
    const provider = makeProvider()
    await expect(generateEntityBrief({ config, provider }, 'e-1')).rejects.toThrow(/insert failed/)
  })
})
