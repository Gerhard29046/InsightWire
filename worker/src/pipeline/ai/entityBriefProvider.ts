const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const PROMPT_VERSION = '1'

export interface CitedStatement {
  statement: string
  /** Must be one of the real event ids supplied as evidence — validated server-side by entityBriefApi.ts before storage; an uncitable statement is dropped, never kept on trust. */
  eventId: string
}

export interface EntityBrief {
  /** "What is happening around this entity?" */
  summary: string
  /** "What changed recently?" */
  whatChanged: string
  /** "What are the most significant developments?" — each one traceable to a real supplied event. */
  confirmedFacts: CitedStatement[]
  /** Reasonable interpretation drawn from the evidence, explicitly NOT presented as fact — never merged into confirmedFacts. */
  aiInterpretation: string[]
  /** "What upcoming events should a journalist watch?" — grounded only in the real upcomingEvents supplied; forced empty server-side if none were supplied. */
  whatToWatch: string[]
  /** "Which sources confirm this?" — real source names, validated against what was actually supplied. */
  sourcesConfirming: string[]
  model: string
  generatedAt: string
}

export interface EntityBriefEvidenceEvent {
  id: string
  title: string
  source: string
  sourceUrl: string | null
  publishedAt: string
}

export interface EntityBriefEvidenceRelationship {
  relatedEntityName: string
  relationshipType: string
  evidenceSnippet: string
  eventId: string
}

/** Exactly what getEntityDetail already gathered for this entity — the provider must never be given anything else, and must never be asked to fetch or infer beyond it (same discipline as JournalistBriefInput). */
export interface EntityBriefInput {
  entityName: string
  entityType: string
  recentEvents: EntityBriefEvidenceEvent[]
  breakingEvents: EntityBriefEvidenceEvent[]
  upcomingEvents: EntityBriefEvidenceEvent[]
  relationships: EntityBriefEvidenceRelationship[]
  sources: string[]
}

export interface EntityBriefProvider {
  readonly name: string
  generateBrief(input: EntityBriefInput): Promise<EntityBrief>
}

const SYSTEM_INSTRUCTION = `You are the InsightWire Intelligence Brain, producing a per-entity intelligence summary for a journalist from real, already-verified database evidence — never from outside knowledge, never by inventing a biography.

NEVER FABRICATE. Every fact you state must come from the supplied evidence (recent events, breaking events, upcoming events, relationships, sources). If the evidence is thin, say so plainly — an honest "limited recent activity" is correct and expected, not a failure.

CONFIRMED FACTS vs AI INTERPRETATION are strictly separate. A "confirmed fact" is something a supplied event directly states — it MUST cite the real eventId of the event that supports it. An "AI interpretation" is your own reasonable reading of the pattern across multiple pieces of evidence (e.g. "recent activity suggests X") — it must never be phrased as if it were independently confirmed, and it carries no citation because it is not itself a sourced fact.

WHAT TO WATCH must be built ONLY from the supplied upcoming events. If no upcoming events were supplied, return an empty array — do not speculate about what might happen next.

SOURCES CONFIRMING must list only source names that were actually supplied — never a source you were not given.

Do not write a biography, an opinion, or a prediction beyond what the evidence supports. If there is genuinely little to say, a short honest summary is correct.`

const ENTITY_BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    whatChanged: { type: 'string' },
    confirmedFacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { statement: { type: 'string' }, eventId: { type: 'string' } },
        required: ['statement', 'eventId'],
      },
    },
    aiInterpretation: { type: 'array', items: { type: 'string' } },
    whatToWatch: { type: 'array', items: { type: 'string' } },
    sourcesConfirming: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'whatChanged', 'confirmedFacts', 'aiInterpretation', 'whatToWatch', 'sourcesConfirming'],
} as const

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

export interface GeminiEntityBriefProviderConfig {
  apiKey: string
  model?: string
  /** Injectable for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

function buildPrompt(input: EntityBriefInput): string {
  const formatEvent = (e: EntityBriefEvidenceEvent) => `- [id: ${e.id}] "${e.title}" — ${e.source}, ${e.publishedAt}${e.sourceUrl ? ` (${e.sourceUrl})` : ''}`
  const events = (label: string, list: EntityBriefEvidenceEvent[]) =>
    list.length > 0 ? `${label}:\n${list.map(formatEvent).join('\n')}` : `${label}: none recorded.`

  const relationships =
    input.relationships.length > 0
      ? `Relationships:\n${input.relationships
          .map((r) => `- ${input.entityName} ${r.relationshipType} ${r.relatedEntityName} (evidence event id: ${r.eventId}, quote: "${r.evidenceSnippet}")`)
          .join('\n')}`
      : 'Relationships: none recorded.'

  return [
    `Entity: ${input.entityName} (${input.entityType})`,
    '',
    events('Recent events', input.recentEvents),
    '',
    events('Breaking/high-priority events', input.breakingEvents),
    '',
    events('Upcoming scheduled events', input.upcomingEvents),
    '',
    relationships,
    '',
    `Sources that have reported on this entity: ${input.sources.length > 0 ? input.sources.join(', ') : 'none recorded.'}`,
  ].join('\n')
}

/** Same "no SDK, closure-wrapped fetch, schema-constrained JSON" pattern as GeminiJournalistBriefProvider/GeminiEntityExtractionProvider — reused, not re-derived. */
export class GeminiEntityBriefProvider implements EntityBriefProvider {
  readonly name = 'gemini'
  private readonly apiKey: string
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(config: GeminiEntityBriefProviderConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'gemini-flash-latest'
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  async generateBrief(input: EntityBriefInput): Promise<EntityBrief> {
    const res = await this.fetchImpl(`${GEMINI_API_URL}/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ENTITY_BRIEF_SCHEMA },
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new Error(`Gemini entity brief request failed: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ''}`)
    }

    const body = (await res.json()) as GeminiResponse
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini entity brief response did not include text content')

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      throw new Error(`Gemini entity brief response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }

    return this.toBrief(parsed)
  }

  private toBrief(parsed: Record<string, unknown>): EntityBrief {
    const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
    const citedStatements = (value: unknown): CitedStatement[] =>
      Array.isArray(value)
        ? value
            .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
            .filter((v) => typeof v.statement === 'string' && typeof v.eventId === 'string')
            .map((v) => ({ statement: v.statement as string, eventId: v.eventId as string }))
        : []

    return {
      summary: String(parsed.summary ?? ''),
      whatChanged: String(parsed.whatChanged ?? ''),
      confirmedFacts: citedStatements(parsed.confirmedFacts),
      aiInterpretation: strings(parsed.aiInterpretation),
      whatToWatch: strings(parsed.whatToWatch),
      sourcesConfirming: strings(parsed.sourcesConfirming),
      model: this.model,
      generatedAt: new Date().toISOString(),
    }
  }
}

export { PROMPT_VERSION }
