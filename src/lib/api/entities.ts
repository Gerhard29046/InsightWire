import { apiFetch } from './client'
import type { NormalizedEvent } from './types'

/**
 * Matches worker/src/pipeline/entityGraph.ts EntityType, minus the internal
 * "event" pseudo-type (never returned by /entities — see entitiesApi.ts).
 * `topic` IS included here (unlike an earlier version of this file) — it's
 * a real, live entity type (tag-derived, populated by every ingested event
 * via processMessage.ts's populateEntityGraph, zero AI dependency) that was
 * previously excluded from the frontend entirely rather than just excluded
 * from the *default* (`?type=` unset) view. `entitiesApi.ts`'s
 * `DEFAULT_EXCLUDED_TYPE` only applies when no `types` filter is given, so
 * explicitly requesting `type=topic` (e.g. the new "Topics" tab in
 * `lib/entityTypes.ts`) already worked server-side — this was purely a
 * missing frontend type/label, not a backend or schema change.
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
  | 'topic'
  | 'other'

export interface EntityRecord {
  id: string
  type: EntityType
  name: string
  country: string | null
  firstSeenAt: string
  lastSeenAt: string
  /** Real count of this entity's tracked event links — undefined only on the rare code path that doesn't compute it (see worker/src/api/entitiesApi.ts); the /entities list always sets it. */
  mentionCount?: number
}

export type EntitySortMode = 'recent' | 'active' | 'name'

export interface EntityCount {
  label: string
  count: number
}

export interface ConnectedEntity {
  entity: EntityRecord
  sharedEventCount: number
  firstSeenAt: string
  lastSeenAt: string
}

/** Matches worker/src/pipeline/ai/entityExtractionProvider.ts's EntityRelationshipType (the entity_relationships table's check constraint). */
export type EntityRelationshipType =
  | 'works_for'
  | 'member_of'
  | 'represents'
  | 'affiliated_with'
  | 'located_in'
  | 'associated_with'
  | 'related_to'
  | 'mentioned_with'

export interface RelationshipEvidence {
  relatedEntity: EntityRecord
  relationshipType: EntityRelationshipType
  direction: 'outgoing' | 'incoming'
  confidence: number
  evidenceSnippet: string
  evidenceEvent: { id: string; title: string; sourceUrl: string | null; publishedAt: string }
}

export interface EntityDetail {
  entity: EntityRecord
  stats: {
    totalEvents: number
    eventsLast24h: number
    eventsLast7d: number
    eventsLast30d: number
  }
  recentEvents: NormalizedEvent[]
  recentEventsNextCursor: string | null
  /** Real recent events with priority_score above the same breaking threshold the Dashboard/Feed use — a subset of recentEvents, fetched separately so one outside the first page is never missed. */
  breakingEvents: NormalizedEvent[]
  /** Real status='scheduled' events mentioning this entity — its own field, never blended into recentEvents/stats (matches the Calendar/Feed separation rule). */
  upcomingEvents: NormalizedEvent[]
  connectedEntities: ConnectedEntity[]
  /** Evidence-backed entity-to-entity relationships — empty until the Gemini extraction batch has found and validated one; never fabricated. */
  relationships: RelationshipEvidence[]
  countries: EntityCount[]
  sources: EntityCount[]
}

export interface ListEntitiesParams {
  search?: string
  types?: EntityType[]
  countries?: string[]
  cursor?: string | null
  pageSize?: number
  sort?: EntitySortMode
  /** ISO timestamp — only entities last seen at or after this are returned. */
  activeSince?: string
}

export interface ListEntitiesResult {
  entities: EntityRecord[]
  nextCursor: string | null
  totalCount: number | null
}

/** GET {VITE_API_BASE_URL}/entities — real rows from the `entities` table (worker/src/api/entitiesApi.ts). */
export function fetchEntities(params: ListEntitiesParams): Promise<ListEntitiesResult> {
  const search = new URLSearchParams()
  if (params.search) search.set('q', params.search)
  if (params.cursor) search.set('cursor', params.cursor)
  search.set('pageSize', String(params.pageSize ?? 25))
  if (params.sort) search.set('sort', params.sort)
  if (params.activeSince) search.set('activeSince', params.activeSince)
  params.types?.forEach((t) => search.append('type', t))
  params.countries?.forEach((c) => search.append('country', c))
  return apiFetch<ListEntitiesResult>(`/entities?${search.toString()}`)
}

/** GET {VITE_API_BASE_URL}/entities/:id */
export function fetchEntityDetail(id: string, opts: { eventsCursor?: string | null } = {}): Promise<EntityDetail> {
  const search = new URLSearchParams()
  if (opts.eventsCursor) search.set('eventsCursor', opts.eventsCursor)
  const qs = search.toString()
  return apiFetch<EntityDetail>(`/entities/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`)
}
