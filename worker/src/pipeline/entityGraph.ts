/**
 * The relationship layer — deliberately separate from `Repository`
 * ("store relationships independently from events"). Narrower than it
 * looks: only `country`/`city` (from `event.country`/`.city`) and `topic`
 * (from `event.tags`) have a real data source today without live AI —
 * `person`/`organization`/`company`/`government_body` all depend on real
 * entity extraction (`NullAiProvider` returns empty arrays). The graph and
 * its dedup logic are fully built now; they simply have nothing to connect
 * for those four types until a real AI provider is configured.
 *
 * Also narrower than Phase 6's Postgres schema (docs/decisions/0004-database-schema.md),
 * which has `organizations`/`people` + event-join-tables but no generic
 * entity/relationship table spanning all 8 types — extending that schema
 * to match is future work, not assumed to already exist.
 */
export type EntityType =
  | 'person'
  | 'organization'
  | 'country'
  | 'city'
  | 'company'
  | 'government_body'
  | 'event'
  | 'topic'

export interface Entity {
  id: string
  type: EntityType
  name: string
  createdAt: string
}

export type RelationshipType = 'mentions' | 'occurred_in' | 'tagged_with' | 'affiliated_with' | 'located_in' | 'part_of'

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

function normalizeName(name: string): string {
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
