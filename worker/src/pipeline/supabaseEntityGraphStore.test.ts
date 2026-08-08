import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SupabaseEntityGraphStore } from './supabaseEntityGraphStore'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

function makeClient() {
  const state: Record<string, unknown> = {}
  const tables: Record<string, ReturnType<typeof makeTableChain>> = {}

  function makeTableChain() {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(state.maybeSingleResult ?? { data: null, error: null })),
      single: vi.fn(() => Promise.resolve(state.singleResult ?? { data: null, error: null })),
    }
    return chain
  }

  const client = {
    from: vi.fn((table: string) => {
      if (!tables[table]) tables[table] = makeTableChain()
      return tables[table]
    }),
  }
  return { client, tables, state }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SupabaseEntityGraphStore', () => {
  describe('findOrCreateEntity', () => {
    it('returns a synthetic entity for type "event" without touching the database', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)

      const entity = await store.findOrCreateEntity('event', 'nasa-news:ev-1')
      expect(entity).toMatchObject({ id: 'event:nasa-news:ev-1', type: 'event', name: 'nasa-news:ev-1' })
      expect(client.from).not.toHaveBeenCalled()
    })

    it('returns the existing row (touching last_seen_at) when one already matches (type, normalized name)', async () => {
      const { client, tables, state } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      state.maybeSingleResult = {
        data: { id: 'e-1', entity_type: 'country', name: 'Japan', normalized_name: 'japan', created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      }
      const store = new SupabaseEntityGraphStore(config)

      const entity = await store.findOrCreateEntity('country', '  JAPAN  ')
      expect(entity).toEqual({ id: 'e-1', type: 'country', name: 'Japan', createdAt: '2026-01-01T00:00:00.000Z' })
      expect(tables.entities.eq).toHaveBeenCalledWith('normalized_name', 'japan')
      expect(tables.entities.update).toHaveBeenCalledWith(expect.objectContaining({ last_seen_at: expect.any(String) }))
    })

    it('inserts a new row when none exists yet', async () => {
      const { client, tables, state } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      state.maybeSingleResult = { data: null, error: null }
      state.singleResult = {
        data: { id: 'e-2', entity_type: 'country', name: 'Kenya', normalized_name: 'kenya', created_at: '2026-01-02T00:00:00.000Z' },
        error: null,
      }
      const store = new SupabaseEntityGraphStore(config)

      const entity = await store.findOrCreateEntity('country', 'Kenya')
      expect(entity).toEqual({ id: 'e-2', type: 'country', name: 'Kenya', createdAt: '2026-01-02T00:00:00.000Z' })
      expect(tables.entities.insert).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: 'country', name: 'Kenya', normalized_name: 'kenya' }),
      )
    })

    it('re-reads the row on a unique-constraint race instead of failing', async () => {
      const { client, state } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      let singleCallCount = 0
      state.maybeSingleResult = { data: null, error: null }
      const insertedError = { code: '23505', message: 'duplicate key' }
      // First `.single()` call is the failed insert; second is the re-select after the race.
      Object.defineProperty(state, 'singleResult', {
        get: () => {
          singleCallCount += 1
          if (singleCallCount === 1) return { data: null, error: insertedError }
          return { data: { id: 'e-3', entity_type: 'country', name: 'Ghana', normalized_name: 'ghana', created_at: '2026-01-03T00:00:00.000Z' }, error: null }
        },
      })
      const store = new SupabaseEntityGraphStore(config)

      const entity = await store.findOrCreateEntity('country', 'Ghana')
      expect(entity.id).toBe('e-3')
    })
  })

  describe('getEntity', () => {
    it('returns a synthetic entity for an event-prefixed id', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)

      const entity = await store.getEntity('event:nasa-news:ev-1')
      expect(entity).toMatchObject({ type: 'event', name: 'nasa-news:ev-1' })
      expect(client.from).not.toHaveBeenCalled()
    })

    it('returns undefined for an unknown real entity id', async () => {
      const { client, state } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      state.maybeSingleResult = { data: null, error: null }
      const store = new SupabaseEntityGraphStore(config)

      expect(await store.getEntity('missing-id')).toBeUndefined()
    })
  })

  describe('addRelationship', () => {
    it('writes an entity_event_links row when one side is the event pseudo-entity', async () => {
      const { client, tables, state } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      state.singleResult = {
        data: { id: 'link-1', entity_id: 'e-1', event_id: 'nasa-news:ev-1', relationship_type: 'occurred_in', created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      }
      const store = new SupabaseEntityGraphStore(config)

      const relationship = await store.addRelationship('event:nasa-news:ev-1', 'e-1', 'occurred_in')
      expect(relationship).toEqual({ id: 'link-1', fromEntityId: 'event:nasa-news:ev-1', toEntityId: 'e-1', type: 'occurred_in', createdAt: '2026-01-01T00:00:00.000Z' })
      expect(tables.entity_event_links.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ entity_id: 'e-1', event_id: 'nasa-news:ev-1', relationship_type: 'occurred_in' }),
        expect.objectContaining({ onConflict: 'entity_id,event_id,relationship_type' }),
      )
    })

    it('rejects a relationship between two real entities (co-occurrence is derived at query time, not stored directly)', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)

      await expect(store.addRelationship('e-1', 'e-2', 'mentions')).rejects.toThrow(/exactly one side must be an event/)
    })

    it('rejects a relationship between two event pseudo-entities', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)

      await expect(store.addRelationship('event:a', 'event:b', 'mentions')).rejects.toThrow(/exactly one side must be an event/)
    })
  })

  describe('getRelationships', () => {
    it('queries by event_id when given an event pseudo-entity id', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)
      const chain = (client.from('entity_event_links') as unknown as { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> })
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() =>
        Promise.resolve({
          data: [{ id: 'link-1', entity_id: 'e-1', event_id: 'nasa-news:ev-1', relationship_type: 'occurred_in', created_at: '2026-01-01T00:00:00.000Z' }],
          error: null,
        }),
      )
      // vi.fn chains above resolve on eq() directly since getRelationships only calls select().eq() for both branches
      const relationships = await store.getRelationships('event:nasa-news:ev-1')
      expect(relationships).toHaveLength(1)
      expect(relationships[0]).toMatchObject({ fromEntityId: 'event:nasa-news:ev-1', toEntityId: 'e-1', type: 'occurred_in' })
    })

    it('queries by entity_id when given a real entity id', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)
      const chain = (client.from('entity_event_links') as unknown as { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> })
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() =>
        Promise.resolve({
          data: [{ id: 'link-1', entity_id: 'e-1', event_id: 'nasa-news:ev-1', relationship_type: 'occurred_in', created_at: '2026-01-01T00:00:00.000Z' }],
          error: null,
        }),
      )

      const relationships = await store.getRelationships('e-1')
      expect(relationships).toHaveLength(1)
      expect(relationships[0]).toMatchObject({ fromEntityId: 'event:nasa-news:ev-1', toEntityId: 'e-1', type: 'occurred_in' })
    })

    it('returns an empty array when a query returns no rows', async () => {
      const { client } = makeClient()
      vi.mocked(createClient).mockReturnValue(client as never)
      const store = new SupabaseEntityGraphStore(config)
      const chain = (client.from('entity_event_links') as unknown as { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> })
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }))

      expect(await store.getRelationships('e-unrelated')).toEqual([])
    })
  })
})
