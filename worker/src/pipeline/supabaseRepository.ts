import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import type { CategoryId, ConfirmingSource, EventStatusId, EventUpdate, NormalizedEvent, Severity, VerificationStatus } from '@insightwire/shared'
import type { RawEvent } from '../connectors/types'
import type { AiSummaryRecord } from './ai/enrichmentPipeline'
import type { EmbeddingRecord, Repository } from './repository'

export interface SupabaseRepositoryConfig {
  url: string
  serviceRoleKey: string
}

/**
 * Thrown for every failure path this repository can hit — PostgREST/Postgres
 * errors (constraint violations, RPC failures) *and* thrown network
 * exceptions (Supabase outage, DNS failure, timeout) — so `processMessage`
 * always sees a real `Error` and never a silently-`undefined` result. Never
 * caught and swallowed here; `worker.ts`'s `queue()` handler is what decides
 * to retry, using Cloudflare Queues' own message-level retry (this
 * repository doesn't add a second, redundant retry loop — see ADR 0007).
 */
export class RepositoryError extends Error {
  readonly operation: string
  readonly cause?: unknown

  constructor(operation: string, message: string, cause?: unknown) {
    super(`SupabaseRepository.${operation}: ${message}`)
    this.name = 'RepositoryError'
    this.operation = operation
    this.cause = cause
  }
}

/** `NormalizedEvent.id` is always `${connectorId}:${externalId}` (see docs/decisions/0005-intelligence-engine.md) — the only place that id is assembled from connectorId + externalId is each connector's own normalize(); this is the one place it's taken apart again, since `normalized_events.source_id` needs the connectorId half and NormalizedEvent doesn't carry it as a separate field. */
function parseConnectorId(normalizedEventId: string): string {
  const separatorIndex = normalizedEventId.indexOf(':')
  if (separatorIndex <= 0) {
    throw new RepositoryError(
      'parseConnectorId',
      `normalized event id "${normalizedEventId}" is not in the expected "<connectorId>:<externalId>" shape`,
    )
  }
  return normalizedEventId.slice(0, separatorIndex)
}

/** pgvector over PostgREST expects the bracketed literal form, not a bare JS array. */
function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

export interface NormalizedEventRow {
  id: string
  raw_event_id: string | null
  source_id: string
  title: string
  description: string
  summary: string | null
  country: string
  city: string | null
  lat: number | null
  lng: number | null
  category: string
  source: string
  source_url: string | null
  start_time: string | null
  end_time: string | null
  published_at: string
  updated_at: string
  importance: string
  confidence: number
  verification_status: string
  language: string
  people: string[]
  organizations: string[]
  keywords: string[]
  tags: string[]
  status: string
  source_trust_score: number | null
  priority_score: number | null
}

export interface ConfirmingSourceRow {
  connector_id: string
  source_url: string | null
  reported_at: string
}

/**
 * `raw_event_id` is always left null here: `Repository.upsertRawEvent`
 * returns `Promise<void>` (no id), and `NormalizedEvent` has no field
 * carrying its source raw_events row either — linking them would need an
 * extra read-back or an interface change, and "the Repository interface
 * must remain unchanged" per this phase's own instructions. A deliberate,
 * documented gap, not an oversight — see ADR 0007.
 */
function toNormalizedEventRow(event: NormalizedEvent): NormalizedEventRow {
  return {
    id: event.id,
    raw_event_id: null,
    source_id: parseConnectorId(event.id),
    title: event.title,
    description: event.description,
    summary: event.summary ?? null,
    country: event.country,
    city: event.city ?? null,
    lat: event.coordinates?.lat ?? null,
    lng: event.coordinates?.lng ?? null,
    category: event.category,
    source: event.source,
    source_url: event.sourceUrl ?? null,
    start_time: event.startTime ?? null,
    end_time: event.endTime ?? null,
    published_at: event.publishedAt,
    updated_at: event.updatedAt,
    importance: event.importance,
    confidence: event.confidence,
    verification_status: event.verificationStatus,
    language: event.language,
    people: event.people,
    organizations: event.organizations,
    keywords: event.keywords,
    tags: event.tags,
    status: event.status,
    source_trust_score: event.sourceTrustScore ?? null,
    priority_score: event.priorityScore ?? null,
  }
}

export function fromNormalizedEventRow(row: NormalizedEventRow, sourceRows: ConfirmingSourceRow[]): NormalizedEvent {
  const confirmingSources: ConfirmingSource[] | undefined =
    sourceRows.length > 0
      ? sourceRows.map((s) => ({
          connectorId: s.connector_id,
          sourceUrl: s.source_url ?? undefined,
          reportedAt: s.reported_at,
        }))
      : undefined

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    summary: row.summary ?? undefined,
    country: row.country,
    city: row.city ?? undefined,
    coordinates: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : undefined,
    category: row.category as CategoryId,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    importance: row.importance as Severity,
    confidence: row.confidence,
    verificationStatus: row.verification_status as VerificationStatus,
    language: row.language,
    people: row.people,
    organizations: row.organizations,
    keywords: row.keywords,
    tags: row.tags,
    status: row.status as EventStatusId,
    confirmingSources,
    priorityScore: row.priority_score ?? undefined,
    sourceTrustScore: row.source_trust_score ?? undefined,
  }
}

/**
 * Production `Repository` (Phase 7) — same interface `InMemoryRepository`
 * implements, per docs/architecture/06-supabase.md's "swap, not a rewrite."
 * `processMessage` never imports this class directly; `worker.ts` selects it
 * over `InMemoryRepository` based on env (see `selectRepository`).
 *
 * Every write is an upsert keyed on a real constraint (see migration
 * 20260807180008) so replaying the same queue message twice is safe —
 * `Repository` has no transaction-handle concept, so atomicity only exists
 * *within* one method: `upsertNormalizedEvent` is the one method that
 * writes two tables, and it does so through a single Postgres function
 * (`upsert_normalized_event_with_sources`) rather than two sequential
 * PostgREST calls, so a mid-write failure can't leave one table updated and
 * the other stale.
 */
export class SupabaseRepository implements Repository {
  private readonly client: SupabaseClient

  constructor(config: SupabaseRepositoryConfig) {
    this.client = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  private wrapError(operation: string, error: PostgrestError): RepositoryError {
    return new RepositoryError(operation, `${error.message} (code ${error.code})`, error)
  }

  /**
   * Runs one PostgREST/RPC call, converting both a returned `.error` and a
   * thrown network exception (outage, DNS, timeout) into the same
   * `RepositoryError` shape — see the class doc comment on why this is not
   * also a retry loop. `data` is nullable on the wire (PostgREST returns
   * `null` on error, and `.maybeSingle()` legitimately returns `null` for
   * "no row") — callers that can't accept `null` (list queries) fall back to
   * an empty array; `getNormalizedEvent`'s `.maybeSingle()` call handles its
   * own `null` explicitly instead of going through the fallback.
   */
  private async execute<T>(operation: string, fn: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T | null> {
    let result: { data: T | null; error: PostgrestError | null }
    try {
      result = await fn()
    } catch (err) {
      throw new RepositoryError(operation, err instanceof Error ? err.message : String(err), err)
    }
    if (result.error) throw this.wrapError(operation, result.error)
    return result.data
  }

  async upsertRawEvent(raw: RawEvent): Promise<void> {
    await this.execute('upsertRawEvent', () =>
      this.client
        .from('raw_events')
        .upsert(
          {
            source_id: raw.connectorId,
            external_id: raw.externalId,
            fetched_at: raw.fetchedAt,
            payload: raw.payload as object,
          },
          { onConflict: 'source_id,external_id' },
        ),
    )
  }

  async upsertNormalizedEvent(event: NormalizedEvent): Promise<void> {
    await this.execute('upsertNormalizedEvent', () =>
      this.client.rpc('upsert_normalized_event_with_sources', {
        p_event: toNormalizedEventRow(event),
        p_confirming_sources: event.confirmingSources ?? [],
      }),
    )
  }

  async recordEventUpdate(normalizedEventId: string, update: EventUpdate): Promise<void> {
    await this.execute('recordEventUpdate', () =>
      this.client
        .from('event_updates')
        .upsert(
          { normalized_event_id: normalizedEventId, at: update.at, label: update.label },
          { onConflict: 'normalized_event_id,at,label', ignoreDuplicates: true },
        ),
    )
  }

  async getEventUpdates(normalizedEventId: string): Promise<EventUpdate[]> {
    const rows = await this.execute<{ at: string; label: string }[]>('getEventUpdates', () =>
      this.client.from('event_updates').select('at, label').eq('normalized_event_id', normalizedEventId),
    )
    return (rows ?? []).map((row) => ({ at: row.at, label: row.label }))
  }

  async recordAiSummary(record: AiSummaryRecord): Promise<void> {
    await this.execute('recordAiSummary', () =>
      this.client
        .from('ai_summaries')
        .upsert(
          {
            normalized_event_id: record.normalizedEventId,
            model: record.model,
            prompt_version: record.promptVersion ?? null,
            summary: record.summary,
            confidence: record.confidence ?? null,
            generated_at: record.generatedAt,
          },
          { onConflict: 'normalized_event_id,model,summary', ignoreDuplicates: true },
        ),
    )
  }

  /**
   * No idempotency guard here, unlike event_updates/ai_summaries: `embeddings`
   * is documented (0006_ai.sql) as append-only by design — "a re-embed
   * inserts a new row rather than overwriting" — so a retried message
   * inserting one duplicate vector is wasteful, not a correctness bug. See
   * ADR 0007's idempotency section.
   */
  async recordEmbedding(record: EmbeddingRecord): Promise<void> {
    await this.execute('recordEmbedding', () =>
      this.client.from('embeddings').insert({
        subject_type: record.subjectType,
        subject_id: record.subjectId,
        model: record.model,
        embedding: formatEmbedding(record.embedding),
      }),
    )
  }

  async getNormalizedEvent(id: string): Promise<NormalizedEvent | undefined> {
    const row = await this.execute<NormalizedEventRow | null>('getNormalizedEvent', () =>
      this.client.from('normalized_events').select('*').eq('id', id).maybeSingle(),
    )
    if (!row) return undefined

    const sourceRows = await this.execute<ConfirmingSourceRow[]>('getNormalizedEvent', () =>
      this.client.from('event_confirming_sources').select('connector_id, source_url, reported_at').eq('normalized_event_id', id),
    )

    return fromNormalizedEventRow(row, sourceRows ?? [])
  }
}
