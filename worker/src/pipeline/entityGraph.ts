/**
 * The relationship layer — deliberately separate from `Repository`
 * ("store relationships independently from events"). `country`/`location`
 * (from `event.country`/`.city`), `topic` (from `event.tags`), and now the
 * reporting source's own organization (from `event.source` + the trust
 * registry's category — see processMessage.ts's `populateEntityGraph`) all
 * have a real data source today without live AI. `person`/`organization`
 * (as *mentioned-in-content* entities, distinct from the source org) still
 * depend on real entity extraction (`NullAiProvider` returns empty arrays
 * for `event.people`/`.organizations` — see pipeline/ai/enrichmentPipeline.ts).
 * The graph and its dedup logic are fully built now; they simply have
 * nothing to connect for content-mentioned people/orgs until a real AI
 * provider is configured for ingestion-time enrichment.
 *
 * Entity Explorer (Phase 11, supabase/migrations/20260808070000_entity_graph.sql)
 * persists this graph's real-world node types (everything except `event`,
 * which stays a pseudo-entity here — see `SupabaseEntityGraphStore` in
 * `supabaseEntityGraphStore.ts`, which never writes an `event`-typed row,
 * only the `entity_event_links` edge to the real `normalized_events` row).
 */
export type EntityType =
  | 'person'
  | 'organization'
  | 'government'
  | 'company'
  | 'agency'
  | 'country'
  | 'location'
  | 'political_party'
  | 'international_organization'
  | 'event'
  | 'topic'
  | 'other'

export interface Entity {
  id: string
  type: EntityType
  name: string
  createdAt: string
}

export type RelationshipType =
  | 'mentions'
  | 'occurred_in'
  | 'tagged_with'
  | 'reported_by'
  | 'affiliated_with'
  | 'located_in'
  | 'part_of'

export interface Relationship {
  id: string
  fromEntityId: string
  toEntityId: string
  type: RelationshipType
  createdAt: string
}

export interface EntityGraphStore {
  /** Dedup key is (type, normalized name) — "never duplicate entities" for the same real-world thing. */
  findOrCreateEntity(type: EntityType, name: string): Promise<Entity>
  getEntity(id: string): Promise<Entity | undefined>
  addRelationship(fromEntityId: string, toEntityId: string, type: RelationshipType): Promise<Relationship>
  getRelationships(entityId: string): Promise<Relationship[]>
}

/** The dedup key's name-normalization — exported so `SupabaseEntityGraphStore` applies the exact same rule (trim/lowercase/collapse whitespace), not a reimplementation that could drift. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** In-memory only — resets on Worker restart, same accepted limitation as every other in-memory store here. */
export class InMemoryEntityGraphStore implements EntityGraphStore {
  private readonly entitiesByKey = new Map<string, Entity>()
  private readonly entitiesById = new Map<string, Entity>()
  private readonly relationshipsByEntity = new Map<string, Relationship[]>()
  private nextId = 1

  async findOrCreateEntity(type: EntityType, name: string): Promise<Entity> {
    const key = `${type}::${normalizeName(name)}`
    const existing = this.entitiesByKey.get(key)
    if (existing) return existing

    const entity: Entity = {
      id: `entity-${this.nextId++}`,
      type,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    }
    this.entitiesByKey.set(key, entity)
    this.entitiesById.set(entity.id, entity)
    return entity
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    return this.entitiesById.get(id)
  }

  async addRelationship(fromEntityId: string, toEntityId: string, type: RelationshipType): Promise<Relationship> {
    const relationship: Relationship = {
      id: `rel-${this.nextId++}`,
      fromEntityId,
      toEntityId,
      type,
      createdAt: new Date().toISOString(),
    }
    this.appendRelationship(fromEntityId, relationship)
    this.appendRelationship(toEntityId, relationship)
    return relationship
  }

  async getRelationships(entityId: string): Promise<Relationship[]> {
    return this.relationshipsByEntity.get(entityId) ?? []
  }

  private appendRelationship(entityId: string, relationship: Relationship): void {
    const list = this.relationshipsByEntity.get(entityId)
    if (list) list.push(relationship)
    else this.relationshipsByEntity.set(entityId, [relationship])
  }
}
