import type { NormalizedEvent } from '@insightwire/shared'
import type { ConnectorRegistry } from '../connectors/registry'
import type { RawEvent } from '../connectors/types'
import type { Logger } from '../manager/types'
import { enrichEvent } from './ai/enrichmentPipeline'
import type { AiProvider } from './ai/types'
import { checkForDuplicate, computeContentHash, type DuplicateIndex } from './dedupe'
import type { EntityGraphStore } from './entityGraph'
import { mergeEvents } from './mergeEngine'
import type { PipelineMetrics } from './metrics'
import { computePriorityScore } from './priority'
import type { Repository } from './repository'
import { recordTimelineEntries, recordTimelineEntry } from './timeline'
import type { TrustRegistry } from './trust'

export interface ProcessMessageDeps {
  registry: ConnectorRegistry
  duplicateIndex: DuplicateIndex
  aiProvider: AiProvider
  repository: Repository
  metrics: PipelineMetrics
  logger: Logger
  trustRegistry: TrustRegistry
  entityGraphStore: EntityGraphStore
}

export type ProcessMessageOutcome =
  | { outcome: 'stored'; eventId: string }
  | { outcome: 'updated'; eventId: string }
  | { outcome: 'unchanged'; eventId: string }
  | { outcome: 'merged'; eventId: string }
  | { outcome: 'invalid'; errors: string[] }

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * "Never duplicate entities" — only wires the 3 entity types that have a
 * real data source without live AI (country/city/topic; see
 * entityGraph.ts's own doc comment for why person/organization/company/
 * government_body stay unpopulated until real entity extraction exists).
 */
async function populateEntityGraph(entityGraphStore: EntityGraphStore, event: NormalizedEvent): Promise<void> {
  const eventEntity = await entityGraphStore.findOrCreateEntity('event', event.id)

  if (event.country && event.country !== 'Global') {
    const country = await entityGraphStore.findOrCreateEntity('country', event.country)
    await entityGraphStore.addRelationship(eventEntity.id, country.id, 'occurred_in')
  }
  if (event.city) {
    const city = await entityGraphStore.findOrCreateEntity('city', event.city)
    await entityGraphStore.addRelationship(eventEntity.id, city.id, 'occurred_in')
  }
  for (const tag of event.tags) {
    const topic = await entityGraphStore.findOrCreateEntity('topic', tag)
    await entityGraphStore.addRelationship(eventEntity.id, topic.id, 'tagged_with')
  }
  for (const personName of event.people) {
    const person = await entityGraphStore.findOrCreateEntity('person', personName)
    await entityGraphStore.addRelationship(eventEntity.id, person.id, 'mentions')
  }
  for (const orgName of event.organizations) {
    const org = await entityGraphStore.findOrCreateEntity('organization', orgName)
    await entityGraphStore.addRelationship(eventEntity.id, org.id, 'mentions')
  }
}

async function rememberForDedupe(duplicateIndex: DuplicateIndex, event: NormalizedEvent): Promise<void> {
  await duplicateIndex.remember({
    id: event.id,
    contentHash: await computeContentHash(event),
    title: event.title,
    description: event.description,
    status: event.status,
    importance: event.importance,
  })
}

/**
 * The queue consumer's per-message orchestration: normalize -> validate ->
 * trust lookup -> dedupe -> [unchanged: stop] -> [duplicate: merge] ->
 * AI enrich -> entity graph -> priority score -> persist. This is the
 * *only* place normalize()/validate() run in the async pipeline — a
 * connector has no other path to producing a stored event, so none can
 * bypass normalization or write to the repository directly.
 */
export async function processMessage(raw: RawEvent, deps: ProcessMessageDeps): Promise<ProcessMessageOutcome> {
  const startedAt = Date.now()
  const connector = deps.registry.get(raw.connectorId)
  if (!connector) {
    deps.metrics.recordWorkerFailure()
    throw new Error(`processMessage: unknown connector "${raw.connectorId}"`)
  }

  await deps.repository.upsertRawEvent(raw)

  let normalized: NormalizedEvent
  try {
    normalized = connector.normalize(raw)
  } catch (err) {
    deps.logger.log({
      level: 'warn',
      event: 'pipeline.normalize.skipped',
      connectorId: raw.connectorId,
      timestamp: new Date().toISOString(),
      error: errorMessage(err),
    })
    deps.metrics.recordProcessing({ processingTimeMs: Date.now() - startedAt, outcome: 'failed' })
    return { outcome: 'invalid', errors: [errorMessage(err)] }
  }

  const validation = connector.validate(normalized)
  if (!validation.valid) {
    deps.logger.log({
      level: 'warn',
      event: 'pipeline.validate.failed',
      connectorId: raw.connectorId,
      timestamp: new Date().toISOString(),
      errors: validation.errors,
    })
    deps.metrics.recordProcessing({ processingTimeMs: Date.now() - startedAt, outcome: 'failed' })
    return { outcome: 'invalid', errors: validation.errors ?? ['validation failed'] }
  }

  const trustProfile = deps.trustRegistry.getProfile(raw.connectorId)
  const candidate: NormalizedEvent = { ...normalized, sourceTrustScore: trustProfile.trustScore }

  const dedupe = await checkForDuplicate(candidate, deps.duplicateIndex)

  if (dedupe.kind === 'unchanged') {
    deps.metrics.recordProcessing({ processingTimeMs: Date.now() - startedAt, outcome: 'unchanged' })
    return { outcome: 'unchanged', eventId: candidate.id }
  }

  if (dedupe.kind === 'duplicate') {
    const existing = await deps.repository.getNormalizedEvent(dedupe.existingId)
    if (existing) {
      const { mergedEvent: merged, timelineEntry } = mergeEvents({ existing, incoming: candidate })
      const mergedEvent: NormalizedEvent = {
        ...merged,
        priorityScore: computePriorityScore({ event: merged, sourceTrustScore: merged.sourceTrustScore ?? trustProfile.trustScore }),
      }

      await recordTimelineEntry(deps.repository, mergedEvent.id, timelineEntry)
      await deps.repository.upsertNormalizedEvent(mergedEvent)
      await rememberForDedupe(deps.duplicateIndex, mergedEvent)

      deps.logger.log({
        level: 'info',
        event: 'pipeline.merge.complete',
        connectorId: raw.connectorId,
        timestamp: new Date().toISOString(),
        eventId: mergedEvent.id,
        confirmingSources: mergedEvent.confirmingSources?.length ?? 1,
      })
      deps.metrics.recordProcessing({
        processingTimeMs: Date.now() - startedAt,
        outcome: 'merged',
        duplicateDetected: true,
        sourceCategory: trustProfile.category,
        priorityScore: mergedEvent.priorityScore,
      })
      return { outcome: 'merged', eventId: mergedEvent.id }
    }

    // Defensive fallback: dedupe's index says this content exists, but the
    // repository doesn't have it (store/index disagreement). Rather than
    // dropping the event, fall through and store it standalone.
    deps.logger.log({
      level: 'warn',
      event: 'pipeline.merge.existing_not_found',
      connectorId: raw.connectorId,
      timestamp: new Date().toISOString(),
      eventId: candidate.id,
      existingId: dedupe.existingId,
    })
  }

  if (dedupe.kind === 'updated') {
    await recordTimelineEntries(deps.repository, candidate.id, dedupe.changes)
  }

  const aiStartedAt = Date.now()
  const enrichment = await enrichEvent(candidate, deps.aiProvider)
  const aiLatencyMs = Date.now() - aiStartedAt

  await populateEntityGraph(deps.entityGraphStore, enrichment.event)

  const finalEvent: NormalizedEvent = {
    ...enrichment.event,
    priorityScore: computePriorityScore({ event: enrichment.event, sourceTrustScore: trustProfile.trustScore }),
  }

  await deps.repository.upsertNormalizedEvent(finalEvent)
  if (enrichment.summaryRecord) {
    await deps.repository.recordAiSummary(enrichment.summaryRecord)
  }
  if (enrichment.embedding) {
    await deps.repository.recordEmbedding({
      subjectType: 'normalized_event',
      subjectId: finalEvent.id,
      model: deps.aiProvider.name,
      embedding: enrichment.embedding,
    })
  }

  await rememberForDedupe(deps.duplicateIndex, finalEvent)

  const outcome = dedupe.kind === 'updated' ? 'updated' : 'stored'
  deps.metrics.recordProcessing({
    processingTimeMs: Date.now() - startedAt,
    aiLatencyMs,
    outcome,
    sourceCategory: trustProfile.category,
    priorityScore: finalEvent.priorityScore,
  })
  deps.logger.log({
    level: 'info',
    event: 'pipeline.process.complete',
    connectorId: raw.connectorId,
    timestamp: new Date().toISOString(),
    eventId: finalEvent.id,
    outcome,
    priorityScore: finalEvent.priorityScore,
  })

  return { outcome, eventId: finalEvent.id }
}
