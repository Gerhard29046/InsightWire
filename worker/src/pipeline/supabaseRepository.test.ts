import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { createClient } from '@supabase/supabase-js'
import { RepositoryError, SupabaseRepository } from './supabaseRepository'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

interface QueryResult {
  data: unknown
  error: { message: string; code: string } | null
}

/**
 * A chain node that is both a chainable query-builder stand-in (every method
 * returns itself, matching PostgREST's fluent API) and a thenable resolving
 * to a fixed `{ data, error }` result — however far the real code chains
 * before awaiting (`.upsert(...)`, `.select(...).eq(...)`,
 * `.select(...).eq(...).maybeSingle()`), `await` on it resolves the same way.
 */
function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    upsert: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

function makeFakeClient(options: { fromResults?: Record<string, QueryResult>; rpcResult?: QueryResult; rpcThrows?: Error } = {}) {
  const fromChains: Record<string, ReturnType<typeof makeChain>[]> = {}
  const rpcCalls: { fn: string; args: unknown }[] = []

  const client = {
    from: vi.fn((table: string) => {
      const result = options.fromResults?.[table] ?? { data: null, error: null }
      const chain = makeChain(result)
      fromChains[table] = [...(fromChains[table] ?? []), chain]
      return chain
    }),
    rpc: vi.fn((fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      if (options.rpcThrows) throw options.rpcThrows
      return makeChain(options.rpcResult ?? { data: null, error: null })
    }),
  }

  return { client, fromChains, rpcCalls }
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Test event',
    description: 'A description.',
    country: 'Global',
    category: 'science',
    source: 'NASA News',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
    ...overrides,
  }
}

function makeRepository(options: Parameters<typeof makeFakeClient>[0] = {}) {
  const fake = makeFakeClient(options)
  vi.mocked(createClient).mockReturnValue(fake.client as never)
  const repository = new SupabaseRepository({ url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' })
  return { repository, ...fake }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SupabaseRepository', () => {
  describe('upsertRawEvent', () => {
    it('upserts on the source_id/external_id natural key', async () => {
      const { repository, fromChains } = makeRepository()
      await repository.upsertRawEvent({
        connectorId: 'nasa-news',
        externalId: 'ev-1',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        payload: { title: 'raw' },
      })

      const chain = fromChains['raw_events'][0]
      expect(chain.upsert).toHaveBeenCalledWith(
        { source_id: 'nasa-news', external_id: 'ev-1', fetched_at: '2026-01-01T00:00:00.000Z', payload: { title: 'raw' } },
        { onConflict: 'source_id,external_id' },
      )
    })

    it('wraps a PostgREST error as a RepositoryError', async () => {
      const { repository } = makeRepository({
        fromResults: { raw_events: { data: null, error: { message: 'constraint violated', code: '23505' } } },
      })
      await expect(
        repository.upsertRawEvent({ connectorId: 'nasa-news', externalId: 'ev-1', fetchedAt: '2026-01-01T00:00:00.000Z', payload: {} }),
      ).rejects.toThrow(RepositoryError)
    })

    it('wraps a thrown network exception instead of letting it propagate raw', async () => {
      const { client } = makeFakeClient()
      vi.mocked(client.from).mockImplementation(() => {
        throw new Error('fetch failed')
      })
      vi.mocked(createClient).mockReturnValue(client as never)
      const repository = new SupabaseRepository({ url: 'https://example.supabase.co', serviceRoleKey: 'key' })

      const promise = repository.upsertRawEvent({
        connectorId: 'nasa-news',
        externalId: 'ev-1',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        payload: {},
      })
      await expect(promise).rejects.toThrow(RepositoryError)
      await expect(promise).rejects.toThrow(/fetch failed/)
    })
  })

  describe('upsertNormalizedEvent', () => {
    it('calls the atomic RPC with the mapped row and confirming sources', async () => {
      const { repository, rpcCalls } = makeRepository()
      const event = makeEvent({
        city: 'Houston',
        coordinates: { lat: 29.7, lng: -95.4 },
        sourceTrustScore: 0.9,
        priorityScore: 62,
        confirmingSources: [{ connectorId: 'nasa-news', reportedAt: '2026-01-01T00:00:00.000Z' }],
      })

      await repository.upsertNormalizedEvent(event)

      expect(rpcCalls).toHaveLength(1)
      expect(rpcCalls[0].fn).toBe('upsert_normalized_event_with_sources')
      const args = rpcCalls[0].args as { p_event: Record<string, unknown>; p_confirming_sources: unknown }
      expect(args.p_event).toMatchObject({
        id: 'nasa-news:ev-1',
        source_id: 'nasa-news',
        raw_event_id: null,
        city: 'Houston',
        lat: 29.7,
        lng: -95.4,
        source_trust_score: 0.9,
        priority_score: 62,
        tags: [],
      })
      expect(args.p_confirming_sources).toEqual([{ connectorId: 'nasa-news', reportedAt: '2026-01-01T00:00:00.000Z' }])
    })

    it('defaults confirming sources to an empty array when absent', async () => {
      const { repository, rpcCalls } = makeRepository()
      await repository.upsertNormalizedEvent(makeEvent())
      expect((rpcCalls[0].args as { p_confirming_sources: unknown }).p_confirming_sources).toEqual([])
    })

    it('throws before calling the RPC if the event id has no connectorId prefix', async () => {
      const { repository, rpcCalls } = makeRepository()
      await expect(repository.upsertNormalizedEvent(makeEvent({ id: 'no-colon-here' }))).rejects.toThrow(RepositoryError)
      expect(rpcCalls).toHaveLength(0)
    })
  })

  describe('recordEventUpdate', () => {
    it('upserts with ignoreDuplicates so a replayed message is a no-op', async () => {
      const { repository, fromChains } = makeRepository()
      await repository.recordEventUpdate('nasa-news:ev-1', { at: '2026-01-01T00:00:00.000Z', label: 'Status changed' })

      const chain = fromChains['event_updates'][0]
      expect(chain.upsert).toHaveBeenCalledWith(
        { normalized_event_id: 'nasa-news:ev-1', at: '2026-01-01T00:00:00.000Z', label: 'Status changed' },
        { onConflict: 'normalized_event_id,at,label', ignoreDuplicates: true },
      )
    })
  })

  describe('getEventUpdates', () => {
    it('maps rows to EventUpdate shape', async () => {
      const { repository } = makeRepository({
        fromResults: {
          event_updates: { data: [{ at: '2026-01-01T00:00:00.000Z', label: 'Status changed' }], error: null },
        },
      })
      expect(await repository.getEventUpdates('nasa-news:ev-1')).toEqual([{ at: '2026-01-01T00:00:00.000Z', label: 'Status changed' }])
    })

    it('returns an empty array rather than null', async () => {
      const { repository } = makeRepository({ fromResults: { event_updates: { data: null, error: null } } })
      expect(await repository.getEventUpdates('nasa-news:ev-1')).toEqual([])
    })
  })

  describe('recordAiSummary', () => {
    it('upserts on (event, model, summary) for idempotency', async () => {
      const { repository, fromChains } = makeRepository()
      await repository.recordAiSummary({
        normalizedEventId: 'nasa-news:ev-1',
        model: 'claude-sonnet-5',
        summary: 'A summary.',
        generatedAt: '2026-01-01T00:00:00.000Z',
      })

      const chain = fromChains['ai_summaries'][0]
      expect(chain.upsert).toHaveBeenCalledWith(
        {
          normalized_event_id: 'nasa-news:ev-1',
          model: 'claude-sonnet-5',
          prompt_version: null,
          summary: 'A summary.',
          confidence: null,
          generated_at: '2026-01-01T00:00:00.000Z',
        },
        { onConflict: 'normalized_event_id,model,summary', ignoreDuplicates: true },
      )
    })
  })

  describe('recordEmbedding', () => {
    it('formats the vector as a bracketed literal, not a bare array', async () => {
      const { repository, fromChains } = makeRepository()
      await repository.recordEmbedding({ subjectType: 'normalized_event', subjectId: 'nasa-news:ev-1', model: 'test', embedding: [0.1, 0.2, 0.3] })

      const chain = fromChains['embeddings'][0]
      expect(chain.insert).toHaveBeenCalledWith({
        subject_type: 'normalized_event',
        subject_id: 'nasa-news:ev-1',
        model: 'test',
        embedding: '[0.1,0.2,0.3]',
      })
    })
  })

  describe('getNormalizedEvent', () => {
    it('returns undefined when no row exists', async () => {
      const { repository } = makeRepository({ fromResults: { normalized_events: { data: null, error: null } } })
      expect(await repository.getNormalizedEvent('nasa-news:missing')).toBeUndefined()
    })

    it('reconstructs a NormalizedEvent, attaching confirming sources from the join table', async () => {
      const { repository } = makeRepository({
        fromResults: {
          normalized_events: {
            data: {
              id: 'nasa-news:ev-1',
              raw_event_id: null,
              source_id: 'nasa-news',
              title: 'Test event',
              description: 'A description.',
              summary: null,
              country: 'Global',
              city: null,
              lat: null,
              lng: null,
              category: 'science',
              source: 'NASA News',
              source_url: null,
              start_time: null,
              end_time: null,
              published_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              importance: 'medium',
              confidence: 0.4,
              verification_status: 'unverified',
              language: 'en',
              people: [],
              organizations: [],
              keywords: [],
              tags: [],
              status: 'developing',
              source_trust_score: 0.9,
              priority_score: 62,
            },
            error: null,
          },
          event_confirming_sources: {
            data: [{ connector_id: 'nasa-news', source_url: null, reported_at: '2026-01-01T00:00:00.000Z' }],
            error: null,
          },
        },
      })

      const event = await repository.getNormalizedEvent('nasa-news:ev-1')
      expect(event?.confirmingSources).toEqual([{ connectorId: 'nasa-news', sourceUrl: undefined, reportedAt: '2026-01-01T00:00:00.000Z' }])
      expect(event?.sourceTrustScore).toBe(0.9)
      expect(event?.priorityScore).toBe(62)
      expect(event?.coordinates).toBeUndefined()
    })

    it('leaves confirmingSources undefined (not an empty array) when none exist', async () => {
      const { repository } = makeRepository({
        fromResults: {
          normalized_events: {
            data: {
              id: 'nasa-news:ev-1',
              raw_event_id: null,
              source_id: 'nasa-news',
              title: 'Test event',
              description: 'A description.',
              summary: null,
              country: 'Global',
              city: null,
              lat: null,
              lng: null,
              category: 'science',
              source: 'NASA News',
              source_url: null,
              start_time: null,
              end_time: null,
              published_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              importance: 'medium',
              confidence: 0.4,
              verification_status: 'unverified',
              language: 'en',
              people: [],
              organizations: [],
              keywords: [],
              tags: [],
              status: 'developing',
              source_trust_score: null,
              priority_score: null,
            },
            error: null,
          },
          event_confirming_sources: { data: [], error: null },
        },
      })

      const event = await repository.getNormalizedEvent('nasa-news:ev-1')
      expect(event?.confirmingSources).toBeUndefined()
      expect(event?.sourceTrustScore).toBeUndefined()
      expect(event?.priorityScore).toBeUndefined()
    })
  })
})
