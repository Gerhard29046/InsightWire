import type { EventUpdate, NormalizedEvent } from '@insightwire/shared'

/**
 * SHA-256 over normalized (lowercased, whitespace-collapsed) title +
 * description. Catches the same real-world story arriving under a
 * *different* deterministic id (two sources covering one event, or a feed
 * re-issuing an item with a new guid) — the deterministic `NormalizedEvent.id`
 * alone only catches the *same* source re-sending the *same* item.
 */
export async function computeContentHash(event: NormalizedEvent): Promise<string> {
  const normalized = `${event.title}\n${event.description}`.toLowerCase().trim().replace(/\s+/g, ' ')
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ExistingRecord {
  id: string
  contentHash: string
  title: string
  description: string
  status: string
  importance: string
}

/**
 * "Have we seen this before?" lookup. In-memory for this phase — no live
 * Supabase connection exists yet — swapped for a real `normalized_events`
 * existence query once Phase 6's schema is applied to a real database.
 * Resets on Worker restart, the same accepted limitation as Phase 2's
 * `InMemoryMetricsStore`, for the same reason.
 */
export interface DuplicateIndex {
  findById(id: string): Promise<ExistingRecord | undefined>
  findByContentHash(contentHash: string): Promise<ExistingRecord | undefined>
  remember(record: ExistingRecord): Promise<void>
}

export class InMemoryDuplicateIndex implements DuplicateIndex {
  private readonly byId = new Map<string, ExistingRecord>()
  private readonly byContentHash = new Map<string, ExistingRecord>()

  async findById(id: string): Promise<ExistingRecord | undefined> {
    return this.byId.get(id)
  }

  async findByContentHash(contentHash: string): Promise<ExistingRecord | undefined> {
    return this.byContentHash.get(contentHash)
  }

  async remember(record: ExistingRecord): Promise<void> {
    this.byId.set(record.id, record)
    this.byContentHash.set(record.contentHash, record)
  }
}

export type DedupeOutcome =
  | { kind: 'new' }
  | { kind: 'unchanged'; existingId: string }
  | { kind: 'updated'; existingId: string; changes: EventUpdate[] }
  | { kind: 'duplicate'; existingId: string }

function diffEvent(existing: ExistingRecord, incoming: NormalizedEvent, at: string): EventUpdate[] {
  const changes: EventUpdate[] = []
  if (existing.title !== incoming.title) {
    changes.push({ at, label: `Title changed from "${existing.title}" to "${incoming.title}"` })
  }
  if (existing.description !== incoming.description) {
    changes.push({ at, label: 'Description updated' })
  }
  if (existing.status !== incoming.status) {
    changes.push({ at, label: `Status changed from "${existing.status}" to "${incoming.status}"` })
  }
  if (existing.importance !== incoming.importance) {
    changes.push({ at, label: `Importance changed from "${existing.importance}" to "${incoming.importance}"` })
  }
  return changes
}

/**
 * Deterministic id first (same source re-sending the same item — most
 * common case, cheapest check), then content hash (a different source, or a
 * new id, describing the same real-world event). Order matters: an id match
 * with no real change should be a no-op, not a "duplicate" — those are
 * different outcomes downstream (unchanged: skip entirely; duplicate:
 * reject and count against the pipeline's `duplicatesRejected` metric).
 */
export async function checkForDuplicate(event: NormalizedEvent, index: DuplicateIndex): Promise<DedupeOutcome> {
  const contentHash = await computeContentHash(event)

  const byId = await index.findById(event.id)
  if (byId) {
    const changes = diffEvent(byId, event, event.updatedAt)
    return changes.length > 0
      ? { kind: 'updated', existingId: event.id, changes }
      : { kind: 'unchanged', existingId: event.id }
  }

  const byHash = await index.findByContentHash(contentHash)
  if (byHash) {
    return { kind: 'duplicate', existingId: byHash.id }
  }

  return { kind: 'new' }
}
