import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { computeContentHash } from './dedupe'
import type { EntityGraphStore } from './entityGraph'
import { fromNormalizedEventRow, SELECT_COLUMNS, type NormalizedEventRow } from './supabaseRepository'
import { GeminiEntityExtractionProvider, PROMPT_VERSION, type EntityExtractionProvider, type EntityExtractionResult } from './ai/entityExtractionProvider'

export interface EntityExtractionConfig {
  url: string
  serviceRoleKey: string
}

/** Below this, an extraction is logged to the ledger (entity_extractions) for audit but never becomes a real entity/relationship — "if confidence is insufficient, leave it out rather than guessing." Tunable; not derived from any real calibration data yet, so documented rather than treated as scientifically chosen. */
export const CONFIDENCE_THRESHOLD = 0.6

function normalizeForLookup(name: string): string {
  return name.trim().toLowerCase()
}

/** The anti-hallucination guard, enforced in code rather than only prompted: a quote the model returns must actually appear in the real source text, or the candidate it supports is rejected regardless of its stated confidence. */
export function evidenceAppearsInSource(sourceText: string, snippet: string): boolean {
  const trimmed = snippet.trim()
  if (!trimmed) return false
  return sourceText.toLowerCase().includes(trimmed.toLowerCase())
}

export interface ExtractEntitiesForEventResult {
  acceptedEntities: number
  rejectedEntities: number
  acceptedRelationships: number
  rejectedRelationships: number
}

function client(config: EntityExtractionConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Runs Gemini-backed extraction for one real event and resolves the result
 * into durable storage. Three independent safety layers, all real (not just
 * prompted):
 *  1. A provider failure (network, bad key, malformed response) is caught
 *     here and returns a zero-effect result — this function can never throw
 *     because Gemini misbehaved, which is what makes it safe to call from a
 *     batch loop without risking the rest of the batch.
 *  2. Every candidate's evidenceSnippet is verified against the event's own
 *     real title+description before it can be accepted — a quote the model
 *     invented (not present in the source) is rejected regardless of its
 *     stated confidence.
 *  3. Every candidate, accepted or not, gets one `entity_extractions` row —
 *     the full audit trail a journalist (or a future debugging session) can
 *     inspect, including what was correctly rejected and why.
 *
 * Relationships are only accepted when BOTH their subject and object names
 * exactly match (case-insensitively) an entity *this same call* already
 * accepted — never resolved against pre-existing entities from earlier
 * calls, since a relationship's evidence snippet only proves a connection
 * exists in *this* text between whatever *this* text is naming, and we have
 * no reliable way to know a bare name refers to the same real-world entity
 * as one from a different extraction without the resolution work explicitly
 * deferred in the approved plan.
 */
export async function extractEntitiesForEvent(
  event: NormalizedEvent,
  provider: EntityExtractionProvider,
  entityGraphStore: EntityGraphStore,
  config: EntityExtractionConfig,
): Promise<ExtractEntitiesForEventResult> {
  const supabase = client(config)
  const sourceText = `${event.title}\n${event.description}`
  const contentHash = await computeContentHash(event)

  let result: EntityExtractionResult
  try {
    result = await provider.extractEntities({ event })
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'entityExtraction.provider.failed',
        eventId: event.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return { acceptedEntities: 0, rejectedEntities: 0, acceptedRelationships: 0, rejectedRelationships: 0 }
  }

  let acceptedEntities = 0
  let rejectedEntities = 0
  const acceptedEntityIdByName = new Map<string, string>()

  for (const candidate of result.entities) {
    const accepted = evidenceAppearsInSource(sourceText, candidate.evidenceSnippet) && candidate.confidence >= CONFIDENCE_THRESHOLD

    const { error: extractionError } = await supabase.from('entity_extractions').insert({
      event_id: event.id,
      entity_type: candidate.type,
      extracted_name: candidate.name,
      confidence: candidate.confidence,
      evidence_snippet: candidate.evidenceSnippet,
      extraction_method: 'gemini',
      model: result.model,
      extraction_version: PROMPT_VERSION,
      content_hash: contentHash,
      accepted,
    })
    if (extractionError) throw new Error(`extractEntitiesForEvent: entity_extractions insert failed: ${extractionError.message}`)

    if (accepted) {
      const entity = await entityGraphStore.findOrCreateEntity(candidate.type, candidate.name)
      const eventEntity = await entityGraphStore.findOrCreateEntity('event', event.id)
      await entityGraphStore.addRelationship(eventEntity.id, entity.id, 'mentions')
      acceptedEntityIdByName.set(normalizeForLookup(candidate.name), entity.id)
      acceptedEntities += 1
    } else {
      rejectedEntities += 1
    }
  }

  let acceptedRelationships = 0
  let rejectedRelationships = 0

  for (const rel of result.relationships) {
    const subjectId = acceptedEntityIdByName.get(normalizeForLookup(rel.subjectName))
    const objectId = acceptedEntityIdByName.get(normalizeForLookup(rel.objectName))
    const accepted = Boolean(subjectId) && Boolean(objectId) && evidenceAppearsInSource(sourceText, rel.evidenceSnippet) && rel.confidence >= CONFIDENCE_THRESHOLD

    if (accepted && subjectId && objectId) {
      const { error: relationshipError } = await supabase.from('entity_relationships').upsert(
        {
          entity_id: subjectId,
          related_entity_id: objectId,
          relationship_type: rel.relationshipType,
          confidence: rel.confidence,
          evidence_event_id: event.id,
          evidence_snippet: rel.evidenceSnippet,
          model: result.model,
          extraction_version: PROMPT_VERSION,
        },
        { onConflict: 'entity_id,related_entity_id,relationship_type,evidence_event_id', ignoreDuplicates: false },
      )
      if (relationshipError) throw new Error(`extractEntitiesForEvent: entity_relationships upsert failed: ${relationshipError.message}`)
      acceptedRelationships += 1
    } else {
      rejectedRelationships += 1
    }
  }

  return { acceptedEntities, rejectedEntities, acceptedRelationships, rejectedRelationships }
}

/**
 * Idempotency check for the batch runner: has this exact content (by hash)
 * already been extracted at the current prompt/schema version? If the
 * event's text changes (a real edit, not just a re-fetch of the same
 * content), the hash changes and it's correctly re-selected — "do not
 * re-run AI extraction unnecessarily for unchanged content," not "never
 * re-run it at all."
 */
export async function hasCurrentExtraction(config: EntityExtractionConfig, eventId: string, contentHash: string): Promise<boolean> {
  const { data, error } = await client(config)
    .from('entity_extractions')
    .select('id')
    .eq('event_id', eventId)
    .eq('content_hash', contentHash)
    .eq('extraction_version', PROMPT_VERSION)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`hasCurrentExtraction failed: ${error.message}`)
  return data !== null
}

/**
 * How many real, most-recently-updated events get looked at per scheduled
 * tick before giving up on finding `batchSize` that actually need
 * extraction. A real ceiling so this query stays cheap even once most
 * events already have a current extraction (the common steady-state case),
 * not a sample used to decide what "counts" — every event is eventually
 * reconsidered as it moves through "most recently updated."
 */
const CANDIDATE_POOL_SIZE = 30

/**
 * Rate-limiting by construction: called once per scheduled tick (every 5
 * minutes, see wrangler.toml), returns at most `batchSize` real events, so
 * Gemini gets called at most `batchSize` times per tick — never once per
 * ingested event. Idempotent by construction too: an event already
 * extracted at its current content hash + the current PROMPT_VERSION is
 * skipped; an event that previously failed (no successful row exists) is
 * naturally retried on the next tick without any separate retry bookkeeping.
 */
export async function selectEventsNeedingExtraction(config: EntityExtractionConfig, batchSize: number): Promise<NormalizedEvent[]> {
  const supabase = client(config)
  // Defensive: InsightWire is not a weather platform, so weather events
  // should never be Gemini extraction candidates. This is mostly belt-and-
  // braces since NWS is disabled and GDACS only produces natural_disasters
  // going forward — but the category-correction fix in dedupe.ts bumps
  // `updated_at` on already-stored GDACS rows being corrected, which could
  // otherwise transiently pull a legacy weather row back into this
  // most-recently-updated pool.
  const { data, error } = await supabase.from('normalized_events').select(SELECT_COLUMNS).neq('category', 'weather').order('updated_at', { ascending: false }).limit(CANDIDATE_POOL_SIZE)
  if (error) throw new Error(`selectEventsNeedingExtraction failed: ${error.message}`)

  const candidates = ((data ?? []) as NormalizedEventRow[]).map((row) => fromNormalizedEventRow(row, []))
  const selected: NormalizedEvent[] = []
  for (const event of candidates) {
    if (selected.length >= batchSize) break
    const contentHash = await computeContentHash(event)
    const alreadyExtracted = await hasCurrentExtraction(config, event.id, contentHash)
    if (!alreadyExtracted) selected.push(event)
  }
  return selected
}

/** Default kept small deliberately — "do not make hundreds of Gemini API calls for every event." A handful per 5-minute tick works steadily through real backlog without approaching Gemini rate limits. */
export const DEFAULT_EXTRACTION_BATCH_SIZE = 5

export interface EntityExtractionBatchSummary {
  eventsProcessed: number
  acceptedEntities: number
  rejectedEntities: number
  acceptedRelationships: number
  rejectedRelationships: number
}

const EMPTY_BATCH_SUMMARY: EntityExtractionBatchSummary = {
  eventsProcessed: 0,
  acceptedEntities: 0,
  rejectedEntities: 0,
  acceptedRelationships: 0,
  rejectedRelationships: 0,
}

/**
 * The single entry point `worker.ts`'s `scheduled()` handler calls. Absent
 * `geminiApiKey`, this is a complete no-op (`EMPTY_BATCH_SUMMARY`) — Entity
 * Explorer keeps working on deterministic data alone, exactly as in v1, no
 * behavior change. Every per-event failure is isolated by
 * `extractEntitiesForEvent`'s own internal try/catch (a Gemini failure there
 * returns a zero-effect result rather than throwing) — this function adds
 * one more layer of isolation around the *selection* query and the loop
 * itself, so a single bad event can never stop the rest of the batch, and a
 * failure here can never reach `queue()`'s ingestion path (a completely
 * separate call site).
 */
export async function runEntityExtractionBatch(
  config: EntityExtractionConfig,
  geminiApiKey: string | undefined,
  entityGraphStore: EntityGraphStore,
  batchSize: number = DEFAULT_EXTRACTION_BATCH_SIZE,
): Promise<EntityExtractionBatchSummary> {
  if (!geminiApiKey) return EMPTY_BATCH_SUMMARY

  const provider = new GeminiEntityExtractionProvider({ apiKey: geminiApiKey })
  const summary: EntityExtractionBatchSummary = { ...EMPTY_BATCH_SUMMARY }

  let events: NormalizedEvent[]
  try {
    events = await selectEventsNeedingExtraction(config, batchSize)
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', event: 'entityExtraction.batch.selection_failed', error: err instanceof Error ? err.message : String(err) }),
    )
    return summary
  }

  for (const event of events) {
    try {
      const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
      summary.eventsProcessed += 1
      summary.acceptedEntities += result.acceptedEntities
      summary.rejectedEntities += result.rejectedEntities
      summary.acceptedRelationships += result.acceptedRelationships
      summary.rejectedRelationships += result.rejectedRelationships
    } catch (err) {
      // extractEntitiesForEvent already isolates provider failures; a throw
      // here means a real infrastructure problem (e.g. a Supabase write
      // failure) — logged, and the batch moves on to the next event rather
      // than aborting the whole tick.
      console.error(
        JSON.stringify({ level: 'error', event: 'entityExtraction.batch.event_failed', eventId: event.id, error: err instanceof Error ? err.message : String(err) }),
      )
    }
  }

  return summary
}
