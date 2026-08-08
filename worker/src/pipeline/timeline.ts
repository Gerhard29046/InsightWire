import type { EventUpdate } from '@insightwire/shared'
import type { Repository } from './repository'

/**
 * A small, named module formalizing "append, never overwrite" — the one
 * place both the update-diff path (dedupe.ts's diffEvent, unchanged since
 * Phase 6.5) and the new merge path (mergeEngine.ts) go through to record
 * how a story evolved. Journalists read this back via `getTimeline`.
 */
export async function recordTimelineEntry(
  repository: Repository,
  normalizedEventId: string,
  entry: EventUpdate,
): Promise<void> {
  await repository.recordEventUpdate(normalizedEventId, entry)
}

export async function recordTimelineEntries(
  repository: Repository,
  normalizedEventId: string,
  entries: EventUpdate[],
): Promise<void> {
  for (const entry of entries) {
    await recordTimelineEntry(repository, normalizedEventId, entry)
  }
}

/** Chronological, oldest first — how a journalist would want to read "how this story evolved." */
export async function getTimeline(repository: Repository, normalizedEventId: string): Promise<EventUpdate[]> {
  const updates = await repository.getEventUpdates(normalizedEventId)
  return [...updates].sort((a, b) => a.at.localeCompare(b.at))
}
