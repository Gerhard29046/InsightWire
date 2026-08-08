import { describe, expect, it } from 'vitest'
import { InMemoryEntityGraphStore } from './entityGraph'

describe('InMemoryEntityGraphStore', () => {
  it('creates a new entity on first sight', async () => {
    const store = new InMemoryEntityGraphStore()
    const entity = await store.findOrCreateEntity('country', 'Japan')
    expect(entity.type).toBe('country')
    expect(entity.name).toBe('Japan')
    expect(await store.getEntity(entity.id)).toEqual(entity)
  })

  it('never duplicates an entity for the same (type, normalized name)', async () => {
    const store = new InMemoryEntityGraphStore()
    const first = await store.findOrCreateEntity('country', 'Japan')
    const second = await store.findOrCreateEntity('country', '  japan  ')
    const third = await store.findOrCreateEntity('country', 'JAPAN')
    expect(second.id).toBe(first.id)
    expect(third.id).toBe(first.id)
  })

  it('the same name creates distinct entities across different types', async () => {
    const store = new InMemoryEntityGraphStore()
    const country = await store.findOrCreateEntity('country', 'Georgia')
    const topic = await store.findOrCreateEntity('topic', 'Georgia')
    expect(country.id).not.toBe(topic.id)
  })

  it('returns undefined for an unknown entity id', async () => {
    const store = new InMemoryEntityGraphStore()
    expect(await store.getEntity('missing')).toBeUndefined()
  })

  it('records a relationship and makes it visible from both endpoints', async () => {
    const store = new InMemoryEntityGraphStore()
    const event = await store.findOrCreateEntity('event', 'nasa-news:ev-1')
    const country = await store.findOrCreateEntity('country', 'Japan')
    const relationship = await store.addRelationship(event.id, country.id, 'occurred_in')

    expect(await store.getRelationships(event.id)).toEqual([relationship])
    expect(await store.getRelationships(country.id)).toEqual([relationship])
  })

  it('accumulates multiple relationships for the same entity', async () => {
    const store = new InMemoryEntityGraphStore()
    const event = await store.findOrCreateEntity('event', 'nasa-news:ev-1')
    const country = await store.findOrCreateEntity('country', 'Japan')
    const topic = await store.findOrCreateEntity('topic', 'science')

    await store.addRelationship(event.id, country.id, 'occurred_in')
    await store.addRelationship(event.id, topic.id, 'tagged_with')

    const relationships = await store.getRelationships(event.id)
    expect(relationships).toHaveLength(2)
    expect(relationships.map((r) => r.type).sort()).toEqual(['occurred_in', 'tagged_with'])
  })

  it('returns an empty array for an entity with no relationships', async () => {
    const store = new InMemoryEntityGraphStore()
    const entity = await store.findOrCreateEntity('topic', 'unrelated')
    expect(await store.getRelationships(entity.id)).toEqual([])
  })
})
