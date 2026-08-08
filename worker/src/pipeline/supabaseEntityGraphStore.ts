import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeName, type Entity, type EntityGraphStore, type EntityType, type Relationship, type RelationshipType } from './entityGraph'

export interface SupabaseEntityGraphStoreConfig {
  url: string
  serviceRoleKey: string
}

interface EntityRow {
  id: string
  entity_type: EntityType
  name: string
  normalized_name: string
  created_at: string
}

interface LinkRow {
  id: string
  entity_id: string
  event_id: string
  relationship_type: RelationshipType
  created_at: string
}

/** Every id this store hands out for an `event` pseudo-entity — deterministic from the real normalized_events.id, so the same event always resolves to the same "entity" without ever being written to the `entities` table (see the migration's own comment for why). */
const EVENT_ID_PREFIX = 'event:'

function eventEntityId(normalizedEventId: string): string {
  return `${EVENT_ID_PREFIX}${normalizedEventId}`
}

function isEventEntityId(id: string): boolean {
  return id.startsWith(EVENT_ID_PREFIX)
}

function stripEventPrefix(id: string): string {
  return id.slice(EVENT_ID_PREFIX.length)
}

function toEntity(row: EntityRow): Entity {
  return { id: row.id, type: row.entity_type, name: row.name, createdAt: row.created_at }
}

function eventPseudoEntity(normalizedEventId: string, createdAt: string): Entity {
  return { id: eventEntityId(normalizedEventId), type: 'event', name: normalizedEventId, createdAt }
}

/**
 * The real, durable backend for the same `EntityGraphStore` interface
 * `InMemoryEntityGraphStore` implements — `processMessage.ts`'s
 * `populateEntityGraph` calls this exactly the same way, unaware which
 * implementation backs it (selected by `selectEntityGraphStore`, mirroring
 * `selectRepository`). `event`-typed entities are never written to the
 * `entities` table (see migration doc comment) — `findOrCreateEntity('event', id)`
 * returns a synthetic, deterministic `Entity` for interface compatibility,
 * and `addRelationship` detects the `event:`-prefixed id and writes to
 * `entity_event_links` instead of a generic entity-to-entity table, since
 * every real call site today always has exactly one event-side and one
 * real-entity-side.
 */
export class SupabaseEntityGraphStore implements EntityGraphStore {
  private readonly client: SupabaseClient

  constructor(config: SupabaseEntityGraphStoreConfig) {
    this.client = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  async findOrCreateEntity(type: EntityType, name: string): Promise<Entity> {
    const trimmed = name.trim()
    if (type === 'event') return eventPseudoEntity(trimmed, new Date().toISOString())

    const normalized = normalizeName(trimmed)
    const nowIso = new Date().toISOString()

    const { data: existing, error: selectError } = await this.client
      .from('entities')
      .select('id, entity_type, name, normalized_name, created_at')
      .eq('entity_type', type)
      .eq('normalized_name', normalized)
      .maybeSingle()
    if (selectError) throw new Error(`SupabaseEntityGraphStore.findOrCreateEntity select failed: ${selectError.message}`)

    if (existing) {
      const { error: touchError } = await this.client.from('entities').update({ last_seen_at: nowIso }).eq('id', existing.id)
      if (touchError) throw new Error(`SupabaseEntityGraphStore.findOrCreateEntity touch failed: ${touchError.message}`)
      return toEntity(existing as EntityRow)
    }

    const { data: inserted, error: insertError } = await this.client
      .from('entities')
      .insert({ entity_type: type, name: trimmed, normalized_name: normalized, first_seen_at: nowIso, last_seen_at: nowIso })
      .select('id, entity_type, name, normalized_name, created_at')
      .single()
    if (insertError) {
      // Two concurrent messages can race the same brand-new entity — the
      // unique (entity_type, normalized_name) constraint is the real guard;
      // a 23505 here means someone else just won, so re-read their row
      // rather than surfacing a spurious failure for what's actually success.
      if (insertError.code === '23505') {
        const { data: raced, error: reselectError } = await this.client
          .from('entities')
          .select('id, entity_type, name, normalized_name, created_at')
          .eq('entity_type', type)
          .eq('normalized_name', normalized)
          .single()
        if (reselectError) throw new Error(`SupabaseEntityGraphStore.findOrCreateEntity re-select after race failed: ${reselectError.message}`)
        return toEntity(raced as EntityRow)
      }
      throw new Error(`SupabaseEntityGraphStore.findOrCreateEntity insert failed: ${insertError.message}`)
    }
    return toEntity(inserted as EntityRow)
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    if (isEventEntityId(id)) return eventPseudoEntity(stripEventPrefix(id), new Date().toISOString())

    const { data, error } = await this.client
      .from('entities')
      .select('id, entity_type, name, normalized_name, created_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`SupabaseEntityGraphStore.getEntity failed: ${error.message}`)
    return data ? toEntity(data as EntityRow) : undefined
  }

  async addRelationship(fromEntityId: string, toEntityId: string, type: RelationshipType): Promise<Relationship> {
    const fromIsEvent = isEventEntityId(fromEntityId)
    const toIsEvent = isEventEntityId(toEntityId)
    if (fromIsEvent === toIsEvent) {
      throw new Error(
        'SupabaseEntityGraphStore.addRelationship: exactly one side must be an event pseudo-entity — direct entity-to-entity relationships are not yet supported (co-occurrence is derived at query time instead, see entitiesApi.ts)',
      )
    }
    const eventId = fromIsEvent ? stripEventPrefix(fromEntityId) : stripEventPrefix(toEntityId)
    const entityId = fromIsEvent ? toEntityId : fromEntityId
    const nowIso = new Date().toISOString()

    const { data, error } = await this.client
      .from('entity_event_links')
      .upsert(
        { entity_id: entityId, event_id: eventId, relationship_type: type, created_at: nowIso },
        { onConflict: 'entity_id,event_id,relationship_type', ignoreDuplicates: false },
      )
      .select('id, entity_id, event_id, relationship_type, created_at')
      .single()
    if (error) throw new Error(`SupabaseEntityGraphStore.addRelationship failed: ${error.message}`)

    const row = data as LinkRow
    return { id: row.id, fromEntityId: eventEntityId(row.event_id), toEntityId: row.entity_id, type: row.relationship_type, createdAt: row.created_at }
  }

  async getRelationships(entityId: string): Promise<Relationship[]> {
    if (isEventEntityId(entityId)) {
      const eventId = stripEventPrefix(entityId)
      const { data, error } = await this.client
        .from('entity_event_links')
        .select('id, entity_id, event_id, relationship_type, created_at')
        .eq('event_id', eventId)
      if (error) throw new Error(`SupabaseEntityGraphStore.getRelationships failed: ${error.message}`)
      return (data as LinkRow[]).map((row) => ({
        id: row.id,
        fromEntityId: eventEntityId(row.event_id),
        toEntityId: row.entity_id,
        type: row.relationship_type,
        createdAt: row.created_at,
      }))
    }

    const { data, error } = await this.client
      .from('entity_event_links')
      .select('id, entity_id, event_id, relationship_type, created_at')
      .eq('entity_id', entityId)
    if (error) throw new Error(`SupabaseEntityGraphStore.getRelationships failed: ${error.message}`)
    return (data as LinkRow[]).map((row) => ({
      id: row.id,
      fromEntityId: eventEntityId(row.event_id),
      toEntityId: row.entity_id,
      type: row.relationship_type,
      createdAt: row.created_at,
    }))
  }
}
