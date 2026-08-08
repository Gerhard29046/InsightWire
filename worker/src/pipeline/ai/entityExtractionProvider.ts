import type { NormalizedEvent } from '@insightwire/shared'
import type { EntityType } from '../entityGraph'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const PROMPT_VERSION = '1'

/** Matches supabase/migrations/20260808080000_entity_intelligence.sql's entity_relationships.relationship_type check constraint exactly. */
export type EntityRelationshipType =
  | 'works_for'
  | 'member_of'
  | 'represents'
  | 'affiliated_with'
  | 'located_in'
  | 'associated_with'
  | 'related_to'
  | 'mentioned_with'

const ENTITY_TYPES: EntityType[] = [
  'person',
  'organization',
  'government',
  'company',
  'agency',
  'country',
  'location',
  'political_party',
  'international_organization',
  'topic',
  'other',
]

const RELATIONSHIP_TYPES: EntityRelationshipType[] = [
  'works_for',
  'member_of',
  'represents',
  'affiliated_with',
  'located_in',
  'associated_with',
  'related_to',
  'mentioned_with',
]

export interface ExtractedEntityCandidate {
  type: EntityType
  name: string
  confidence: number
  evidenceSnippet: string
}

export interface ExtractedRelationshipCandidate {
  subjectName: string
  relationshipType: EntityRelationshipType
  objectName: string
  confidence: number
  evidenceSnippet: string
}

export interface EntityExtractionResult {
  entities: ExtractedEntityCandidate[]
  relationships: ExtractedRelationshipCandidate[]
  model: string
}

/** Exactly what the ingestion system already collected for this event — same discipline as JournalistBriefInput (journalistBrief.ts): the provider must never be given anything else, and must never be asked to fetch or infer beyond it. */
export interface EntityExtractionInput {
  event: Pick<NormalizedEvent, 'title' | 'description' | 'source' | 'country'>
}

export interface EntityExtractionProvider {
  readonly name: string
  extractEntities(input: EntityExtractionInput): Promise<EntityExtractionResult>
}

/**
 * Deliberately narrow — this is a text-mining task, not an editorial one
 * (that's JournalistBriefProvider's job). Every rule here exists to make a
 * specific failure mode structurally harder: "quote it or drop it" is
 * enforced again in code by entityExtraction.ts (which verifies the quote
 * actually appears in the source text before anything is stored) — the
 * prompt rule and the code check are two independent layers, not a
 * substitute for each other.
 */
const SYSTEM_INSTRUCTION = `You are an entity-extraction engine for a journalism intelligence platform. You extract only what is literally stated in the supplied text — you never infer, assume, or add outside knowledge.

RULES (all mandatory):

1. Every entity you report must be a real name or phrase that appears verbatim (or as a clear direct reference, e.g. a title used in place of a name) in the supplied title/description. Do not extract generic role descriptions with no name attached (e.g. "government officials," "a spokesperson") as a named entity.

2. Every entity needs an evidenceSnippet: a short, VERBATIM quote (copied exactly, not paraphrased) from the supplied text that supports it. If you cannot quote the text verbatim, do not report that entity.

3. Every relationship needs its own verbatim evidenceSnippet from the supplied text — a quote that actually states or clearly implies the relationship. If the text only shows two entities appearing near each other with no stated relationship, use relationshipType "mentioned_with" rather than guessing a more specific type like "works_for."

4. confidence reflects how directly the text supports the extraction: 0.9+ only for something the text states plainly and unambiguously; use lower values for anything requiring interpretation. When genuinely unsure, use a low number rather than omitting the confidence or inflating it.

5. Do not infer a person's job title, employer, or affiliation beyond what the text explicitly states. If the text says "President Ramaphosa," you may extract the person "Ramaphosa" — you may NOT additionally assert he "works_for" a specific government body unless the text itself states that connection.

6. Do not extract the country/location the event is filed under unless that country/location is also substantively discussed in the text itself (the ingestion pipeline already records the event's filing country separately — duplicating it here adds no value).

7. If the text contains no extractable named entities beyond what's obvious from the headline alone, return empty arrays. An empty result is correct and expected for most short procedural announcements — never invent content to produce a non-empty answer.

Return only entities/relationships you would be comfortable defending with the exact quote you provided.`

const ENTITY_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ENTITY_TYPES },
          name: { type: 'string' },
          confidence: { type: 'number' },
          evidenceSnippet: { type: 'string' },
        },
        required: ['type', 'name', 'confidence', 'evidenceSnippet'],
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subjectName: { type: 'string' },
          relationshipType: { type: 'string', enum: RELATIONSHIP_TYPES },
          objectName: { type: 'string' },
          confidence: { type: 'number' },
          evidenceSnippet: { type: 'string' },
        },
        required: ['subjectName', 'relationshipType', 'objectName', 'confidence', 'evidenceSnippet'],
      },
    },
  },
  required: ['entities', 'relationships'],
} as const

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

export interface GeminiEntityExtractionProviderConfig {
  apiKey: string
  model?: string
  /** Injectable for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

function buildPrompt(input: EntityExtractionInput): string {
  return [
    'Extract entities and relationships from the following event using ONLY the text below.',
    '',
    `Title: ${input.event.title}`,
    `Source: ${input.event.source}`,
    '',
    'Description:',
    input.event.description,
  ].join('\n')
}

function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (ENTITY_TYPES as string[]).includes(value)
}

function isRelationshipType(value: unknown): value is EntityRelationshipType {
  return typeof value === 'string' && (RELATIONSHIP_TYPES as string[]).includes(value)
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Same "no SDK, Workers-native fetch, closure-wrapped, schema-constrained
 * JSON mode" pattern as GeminiJournalistBriefProvider — verified working
 * against the real Gemini API in that file; reused here rather than
 * re-derived, including the "Illegal invocation" fix (see that file's own
 * doc comment for why the closure wrap is load-bearing, not stylistic).
 */
export class GeminiEntityExtractionProvider implements EntityExtractionProvider {
  readonly name = 'gemini'
  private readonly apiKey: string
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(config: GeminiEntityExtractionProviderConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'gemini-flash-latest'
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  async extractEntities(input: EntityExtractionInput): Promise<EntityExtractionResult> {
    const res = await this.fetchImpl(`${GEMINI_API_URL}/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ENTITY_EXTRACTION_SCHEMA,
        },
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new Error(`Gemini entity extraction request failed: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ''}`)
    }

    const body = (await res.json()) as GeminiResponse
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error('Gemini entity extraction response did not include text content')
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      throw new Error(`Gemini entity extraction response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }

    return this.toResult(parsed)
  }

  private toResult(parsed: Record<string, unknown>): EntityExtractionResult {
    const rawEntities = Array.isArray(parsed.entities) ? parsed.entities : []
    const rawRelationships = Array.isArray(parsed.relationships) ? parsed.relationships : []

    const entities: ExtractedEntityCandidate[] = rawEntities
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .filter((e) => isEntityType(e.type) && typeof e.name === 'string' && e.name.trim().length > 0 && typeof e.evidenceSnippet === 'string' && e.evidenceSnippet.trim().length > 0)
      .map((e) => ({
        type: e.type as EntityType,
        name: (e.name as string).trim(),
        confidence: clampConfidence(e.confidence),
        evidenceSnippet: (e.evidenceSnippet as string).trim(),
      }))

    const relationships: ExtractedRelationshipCandidate[] = rawRelationships
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .filter(
        (r) =>
          isRelationshipType(r.relationshipType) &&
          typeof r.subjectName === 'string' &&
          r.subjectName.trim().length > 0 &&
          typeof r.objectName === 'string' &&
          r.objectName.trim().length > 0 &&
          typeof r.evidenceSnippet === 'string' &&
          r.evidenceSnippet.trim().length > 0,
      )
      .map((r) => ({
        subjectName: (r.subjectName as string).trim(),
        relationshipType: r.relationshipType as EntityRelationshipType,
        objectName: (r.objectName as string).trim(),
        confidence: clampConfidence(r.confidence),
        evidenceSnippet: (r.evidenceSnippet as string).trim(),
      }))

    return { entities, relationships, model: this.model }
  }
}

export { PROMPT_VERSION }
