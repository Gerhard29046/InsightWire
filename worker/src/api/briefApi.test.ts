import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { generateBrief, getLatestBrief } from './briefApi'
import type { Repository } from '../pipeline/repository'
import type { JournalistBrief, JournalistBriefProvider } from '../pipeline/ai/journalistBrief'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

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

const event: NormalizedEvent = {
  id: 'nws-alerts:ev-1',
  title: 'Severe Thunderstorm Warning',
  description: 'A description.',
  country: 'United States',
  category: 'weather',
  source: 'NWS Active Alerts',
  publishedAt: '2026-08-07T20:52:00.000Z',
  updatedAt: '2026-08-07T20:52:00.000Z',
  importance: 'high',
  confidence: 0.95,
  verificationStatus: 'verified',
  language: 'en',
  people: [],
  organizations: [],
  keywords: [],
  tags: [],
  status: 'live',
}

const fakeBrief: JournalistBrief = {
  summary: 'x',
  whatHappened: 'x',
  whyItMattersKnown: '',
  whyItMattersPotential: '',
  keyFacts: [],
  entities: { people: [], organizations: [] },
  locations: [],
  topics: [],
  suggestedHeadline: 'x',
  storyAngles: [],
  followUpQuestions: [],
  whatToWatch: [],
  confirmedFacts: [],
  reportedClaims: [],
  unverifiedClaims: [],
  contradictions: [],
  sourceAssessment: 'x',
  statementNature: 'not_applicable',
  confidence: 'medium',
  confidenceReason: 'x',
  editorialPriority: 'monitor',
  model: 'gemini-flash-latest',
  generatedAt: '2026-08-08T00:00:00.000Z',
}

function makeRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    upsertRawEvent: vi.fn(),
    upsertNormalizedEvent: vi.fn(),
    recordEventUpdate: vi.fn(),
    getEventUpdates: vi.fn().mockResolvedValue([]),
    recordAiSummary: vi.fn(),
    recordEmbedding: vi.fn(),
    getNormalizedEvent: vi.fn().mockResolvedValue(event),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getLatestBrief', () => {
  it('returns undefined when no brief has ever been generated', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    expect(await getLatestBrief(config, 'nws-alerts:ev-1')).toBeUndefined()
  })

  it('returns the most recent brief when one exists', async () => {
    const { client } = makeFakeClient({ data: { brief: fakeBrief, model: 'gemini-flash-latest', generated_at: fakeBrief.generatedAt }, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    const brief = await getLatestBrief(config, 'nws-alerts:ev-1')
    expect(brief).toEqual(fakeBrief)
  })

  it('throws on a query error', async () => {
    const { client } = makeFakeClient({ data: null, error: { message: 'boom' } })
    vi.mocked(createClient).mockReturnValue(client as never)
    await expect(getLatestBrief(config, 'nws-alerts:ev-1')).rejects.toThrow(/boom/)
  })
})

describe('generateBrief', () => {
  function makeProvider(brief: JournalistBrief = fakeBrief): JournalistBriefProvider {
    return { name: 'gemini', generateBrief: vi.fn().mockResolvedValue(brief) }
  }

  it('returns undefined without calling the provider when the event does not exist', async () => {
    const provider = makeProvider()
    const repository = makeRepository({ getNormalizedEvent: vi.fn().mockResolvedValue(undefined) })
    const result = await generateBrief({ config, repository, provider }, 'missing')
    expect(result).toBeUndefined()
    expect(provider.generateBrief).not.toHaveBeenCalled()
  })

  it('passes exactly the event, timeline, and confirming sources already collected to the provider', async () => {
    const { client } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    const provider = makeProvider()
    const repository = makeRepository({ getEventUpdates: vi.fn().mockResolvedValue([{ at: '2026-08-07T21:00:00.000Z', label: 'Updated' }]) })

    await generateBrief({ config, repository, provider }, event.id)

    expect(provider.generateBrief).toHaveBeenCalledWith({
      event,
      timeline: [{ at: '2026-08-07T21:00:00.000Z', label: 'Updated' }],
      confirmingSources: event.confirmingSources,
    })
  })

  it('inserts the generated brief and returns it', async () => {
    const { client, chain } = makeFakeClient({ data: null, error: null })
    vi.mocked(createClient).mockReturnValue(client as never)
    const provider = makeProvider()
    const repository = makeRepository()

    const result = await generateBrief({ config, repository, provider }, event.id)

    expect(result).toEqual(fakeBrief)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ normalized_event_id: event.id, model: fakeBrief.model, brief: fakeBrief }),
    )
  })

  it('throws when neither an explicit provider nor a Gemini key is given', async () => {
    const repository = makeRepository()
    await expect(generateBrief({ config, repository }, event.id)).rejects.toThrow(/No journalist brief provider configured/)
  })

  it('throws on an insert error', async () => {
    const { client } = makeFakeClient({ data: null, error: { message: 'insert failed' } })
    vi.mocked(createClient).mockReturnValue(client as never)
    const provider = makeProvider()
    const repository = makeRepository()
    await expect(generateBrief({ config, repository, provider }, event.id)).rejects.toThrow(/insert failed/)
  })
})
