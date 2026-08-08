import type { EventUpdate, NormalizedEvent } from '@insightwire/shared'
import type { RawEvent } from '../connectors/types'
import type { AiSummaryRecord } from './ai/enrichmentPipeline'

export interface EmbeddingRecord {
  subjectType: 'normalized_event' | 'organization' | 'person'
  subjectId: string
  model: string
  embedding: number[]
}

/**
 * Named after Phase 6's actual tables (docs/decisions/0004-database-schema.md)
 * — this is the seam a real Supabase-backed implementation slots into
 * without changing processMessage's orchestration logic. No live Supabase
 * connection exists yet, so only InMemoryRepository exists today.
 * Connectors never call this directly — only the queue consumer does,
 * enforcing "connectors don't write to Postgres."
 */
export interface Repository {
  upsertRawEvent(raw: RawEvent): Promise<void>
  upsertNormalizedEvent(event: NormalizedEvent): Promise<void>
  recordEventUpdate(normalizedEventId: string, update: EventUpdate): Promise<void>
  /** Chronological — backs the Timeline Engine (pipeline/timeline.ts). */
  getEventUpdates(normalizedEventId: string): Promise<EventUpdate[]>
  recordAiSummary(record: AiSummaryRecord): Promise<void>
  recordEmbedding(record: EmbeddingRecord): Promise<void>
  getNormalizedEvent(id: string): Promise<NormalizedEvent | undefined>
}

/** In-memory only — resets on Worker restart, same accepted limitation as Phase 2's InMemoryMetricsStore, for the same reason (no live database yet). */
export class InMemoryRepository implements Repository {
  readonly normalizedEvents = new Map<string, NormalizedEvent>()
  readonly rawEvents: RawEvent[] = []
  readonly eventUpdates: { normalizedEventId: string; update: EventUpdate }[] = []
  readonly aiSummaries: AiSummaryRecord[] = []
  readonly embeddings: EmbeddingRecord[] = []

  async upsertRawEvent(raw: RawEvent): Promise<void> {
    this.rawEvents.push(raw)
  }

  async upsertNormalizedEvent(event: NormalizedEvent): Promise<void> {
    this.normalizedEvents.set(event.id, event)
  }

  async recordEventUpdate(normalizedEventId: string, update: EventUpdate): Promise<void> {
    this.eventUpdates.push({ normalizedEventId, update })
  }

  async getEventUpdates(normalizedEventId: string): Promise<EventUpdate[]> {
    return this.eventUpdates.filter((e) => e.normalizedEventId === normalizedEventId).map((e) => e.update)
  }

  async recordAiSummary(record: AiSummaryRecord): Promise<void> {
    this.aiSummaries.push(record)
  }

  async recordEmbedding(record: EmbeddingRecord): Promise<void> {
    this.embeddings.push(record)
  }

  async getNormalizedEvent(id: string): Promise<NormalizedEvent | undefined> {
    return this.normalizedEvents.get(id)
  }
}
