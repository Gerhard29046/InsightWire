import type { ConfirmingSource, EventUpdate, NormalizedEvent, Severity } from '@insightwire/shared'

const CONFIRMATION_CONFIDENCE_BONUS = 0.15
const IMPORTANCE_RANK: Severity[] = ['low', 'medium', 'high', 'critical']

export interface MergeInputs {
  existing: NormalizedEvent
  incoming: NormalizedEvent
}

export interface MergeResult {
  mergedEvent: NormalizedEvent
  timelineEntry: EventUpdate
}

function dedupeSources(sources: ConfirmingSource[]): ConfirmingSource[] {
  const byConnector = new Map<string, ConfirmingSource>()
  for (const source of sources) {
    if (!byConnector.has(source.connectorId)) byConnector.set(source.connectorId, source)
  }
  return [...byConnector.values()]
}

function higherImportance(a: Severity, b: Severity): Severity {
  return IMPORTANCE_RANK.indexOf(a) >= IMPORTANCE_RANK.indexOf(b) ? a : b
}

/**
 * "If multiple connectors report the same event: do not create duplicate
 * events. Merge sources, merge evidence, preserve update history, calculate
 * confidence from multiple sources." Called when dedupe.ts finds a
 * different id with the same content hash — `incoming`'s id is discarded,
 * never separately stored; everything lands on `existing`'s id.
 */
export function mergeEvents({ existing, incoming }: MergeInputs): MergeResult {
  const existingSources = existing.confirmingSources ?? []
  const incomingSources = incoming.confirmingSources ?? []
  const mergedSources = dedupeSources([...existingSources, ...incomingSources])
  const addedSourceCount = Math.max(0, mergedSources.length - existingSources.length)

  const mergedTags = Array.from(new Set([...existing.tags, ...incoming.tags]))
  const mergedKeywords = Array.from(new Set([...existing.keywords, ...incoming.keywords]))

  const baseConfidence = Math.max(existing.confidence, incoming.confidence)
  const confidence = Math.min(1, baseConfidence + CONFIRMATION_CONFIDENCE_BONUS * addedSourceCount)
  const importance = higherImportance(existing.importance, incoming.importance)
  const updatedAt = incoming.updatedAt > existing.updatedAt ? incoming.updatedAt : existing.updatedAt

  const mergedEvent: NormalizedEvent = {
    ...existing,
    tags: mergedTags,
    keywords: mergedKeywords,
    confirmingSources: mergedSources,
    confidence,
    importance,
    updatedAt,
  }

  const newConnectorIds = incomingSources
    .filter((source) => !existingSources.some((e) => e.connectorId === source.connectorId))
    .map((source) => source.connectorId)

  const timelineEntry: EventUpdate = {
    at: updatedAt,
    label:
      newConnectorIds.length > 0
        ? `Confirmed by additional source: ${newConnectorIds.join(', ')} (now ${mergedSources.length} confirming source${mergedSources.length === 1 ? '' : 's'})`
        : `Re-confirmed by ${incoming.source}`,
  }

  return { mergedEvent, timelineEntry }
}
