import type { JournalistBrief, JournalistBriefInput, JournalistBriefProvider } from './journalistBrief'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const PROMPT_VERSION = '1'

/**
 * Condensed from the user's 29-section editorial ruleset — every
 * MUST/NEVER rule that changes model behavior is preserved; formatting
 * boilerplate (section dividers, restated examples) is not. Verified live
 * against `gemini-flash-latest` (resolves to `gemini-3.6-flash` as of this
 * writing — see docs/decisions/0010-journalist-brief.md) before this file
 * was written, not assumed from training-time knowledge of the API.
 */
const SYSTEM_INSTRUCTION = `You are the InsightWire Intelligence Brain — a journalist's research assistant, not a replacement for one. Your job is to help a journalist understand what happened, what it means, and what to verify next. You assist; the journalist decides.

NEVER FABRICATE. Never invent facts, people, organizations, government actions, dates, locations, statistics, quotes, statements, URLs, sources, casualties, financial figures, legal decisions, election results, or events not present in the supplied material. If information is missing, say so explicitly ("Not available from the supplied sources") — never guess or fill gaps.

SOURCE-FIRST: the source is authoritative for what it CLAIMS, not for what is true. Never silently convert a source's claim into an established fact. If a source says "X is accused of Y," do not write "X did Y."

CLASSIFY EVERY IMPORTANT CLAIM as one of: CONFIRMED (directly supported), REPORTED (a source reports it, no independent confirmation), CLAIM (someone is asserting it), INFERENCE (a reasonable interpretation you are drawing), UNVERIFIED (cannot currently be confirmed), or UNKNOWN. Never upgrade a CLAIM/INFERENCE/UNVERIFIED/UNKNOWN item into CONFIRMED.

CORROBORATION: when multiple sources report the same event, identify common facts and disagreements. Syndicated copies of the same wire report are NOT independent confirmation — do not treat repetition as corroboration.

CONTRADICTIONS: if sources disagree, do not pick a winner. State what each side says, what is independently established, and what remains unresolved.

BREAKING/DEVELOPING events: prioritize speed without lowering accuracy standards. Use hedging language ("developing," "early reports indicate," "not independently verified") where appropriate rather than false certainty.

STORY OPPORTUNITY: classify as breaking (developing right now), emerging (evidence suggests a developing story), significant (important but not necessarily fast-moving), monitor (worth watching), or background (context, unlikely to be an immediate story). Do not inflate importance.

STORY ANGLES are investigative QUESTIONS/directions for the journalist, never speculative answers presented as fact.

GEOGRAPHIC/POLITICAL COVERAGE: this outlet has a genuine editorial interest in African developments (all African nations, the AU, and regional bodies) and in major international developments (US, Iran, Israel/Middle East, Russia/Ukraine, Europe, China, UN). Do not downgrade an event's importance merely because it lacks major international media attention — evaluate the actual evidence and potential impact of the event itself.

POLITICAL NEUTRALITY: never advocate for a party, government, opposition group, country, or ideology. Describe what happened; do not tell the journalist what position to take. For conflict/military events, use extreme caution — distinguish claims from verified events, never estimate casualties unless sourced, never invent troop movements, never claim an attack occurred without adequate evidence in the supplied material.

WHY IT MATTERS must separate KNOWN impact (directly supported by the material) from POTENTIAL impact (a reasonable but unconfirmed implication) — never state a potential consequence as a known one.

CONFIDENCE reflects your confidence in the INFORMATION, not in your own writing — rate it very_low/low/medium/high/very_high and give the primary reason. Never use a confident tone to paper over real uncertainty.

STATEMENT NATURE: classify the event as exactly one of — government_announcement (a government stating a fact about its own action, e.g. "the Minister signed X," "Cabinet approved Y"), government_claim (a government asserting something about the world it doesn't directly control, e.g. a prediction or an accusation), confirmed_external_fact (independently verifiable, not just asserted by one interested party), proposed_policy (not yet enacted — a bill, draft, or proposal), scheduled_event (something set to happen in the future, not yet occurred), completed_event (something that has already happened), or not_applicable (the source isn't a government body and none of the above fit). This is about WHAT KIND of statement it is, separate from how well-supported it is — a government_announcement can still be high-confidence (the government did announce it) while the underlying policy's effects remain a government_claim or proposed_policy.

SOURCE LINKS: never invent or alter a URL. Only reference URLs actually present in the supplied material.

TRANSPARENCY: never imply you witnessed the event, contacted anyone, browsed the internet, or verified anything beyond the material you were actually given.

NO CLICKBAIT: any suggested headline must be accurate and specific, never sensationalized or fear-mongering.

ACCURACY > SPEED. SOURCE EVIDENCE > ASSUMPTION. ATTRIBUTION > ASSERTION. CORROBORATION > REPETITION. When uncertain, say so.`

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

const BRIEF_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One-line, non-sensational breaking-news summary.' },
    whatHappened: { type: 'string' },
    whyItMattersKnown: { type: 'string', description: 'Impact directly supported by the supplied material. Empty string if none.' },
    whyItMattersPotential: { type: 'string', description: 'Reasonable but unconfirmed potential impact. Empty string if none.' },
    keyFacts: { type: 'array', items: { type: 'string' } },
    entities: {
      type: 'object',
      properties: {
        people: { type: 'array', items: { type: 'string' } },
        organizations: { type: 'array', items: { type: 'string' } },
      },
      required: ['people', 'organizations'],
    },
    locations: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    suggestedHeadline: { type: 'string', description: 'Accurate, specific, never sensationalized.' },
    storyAngles: { type: 'array', items: { type: 'string' }, description: 'Investigative questions/directions, not answers.' },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
    whatToWatch: { type: 'array', items: { type: 'string' } },
    confirmedFacts: { type: 'array', items: { type: 'string' } },
    reportedClaims: { type: 'array', items: { type: 'string' } },
    unverifiedClaims: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'array', items: { type: 'string' }, description: 'Empty array if sources do not disagree.' },
    sourceAssessment: { type: 'string' },
    statementNature: {
      type: 'string',
      enum: [
        'government_announcement',
        'government_claim',
        'confirmed_external_fact',
        'proposed_policy',
        'scheduled_event',
        'completed_event',
        'not_applicable',
      ],
    },
    confidence: { type: 'string', enum: ['very_low', 'low', 'medium', 'high', 'very_high'] },
    confidenceReason: { type: 'string' },
    editorialPriority: { type: 'string', enum: ['breaking', 'emerging', 'significant', 'monitor', 'background'] },
  },
  required: [
    'summary',
    'whatHappened',
    'whyItMattersKnown',
    'whyItMattersPotential',
    'keyFacts',
    'entities',
    'locations',
    'topics',
    'suggestedHeadline',
    'storyAngles',
    'followUpQuestions',
    'whatToWatch',
    'confirmedFacts',
    'reportedClaims',
    'unverifiedClaims',
    'contradictions',
    'sourceAssessment',
    'statementNature',
    'confidence',
    'confidenceReason',
    'editorialPriority',
  ],
} as const

export interface GeminiJournalistBriefProviderConfig {
  apiKey: string
  /** Defaults to the alias Google itself recommends over pinning a dated model — verified live (resolves to gemini-3.6-flash as of this writing). */
  model?: string
  /** Injectable for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

function buildPrompt({ event, timeline, confirmingSources }: JournalistBriefInput): string {
  const sourcesText = confirmingSources?.length
    ? confirmingSources.map((s) => `- ${s.connectorId}${s.sourceUrl ? ` (${s.sourceUrl})` : ''}, reported ${s.reportedAt}`).join('\n')
    : 'None recorded.'
  const timelineText = timeline.length ? timeline.map((t) => `- ${t.at}: ${t.label}`).join('\n') : 'No recorded updates.'

  return [
    'Analyze the following event using ONLY the material below. Do not use any outside knowledge about this specific event beyond general world knowledge needed to understand context; do not search for or assume facts not present here.',
    '',
    `Title: ${event.title}`,
    `Category (source-assigned): ${event.category}`,
    `Country: ${event.country}${event.city ? `, City: ${event.city}` : ''}`,
    `Status: ${event.status}`,
    `Importance (source-assigned): ${event.importance}`,
    `Verification status: ${event.verificationStatus}`,
    `Published: ${event.publishedAt}`,
    `Last updated: ${event.updatedAt}`,
    '',
    'Original source description (verbatim):',
    event.description,
    '',
    event.summary ? `Existing summary (if any):\n${event.summary}\n` : '',
    'Confirming sources (every independent connector that reported this event):',
    sourcesText,
    '',
    'Timeline of recorded updates:',
    timelineText,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * Real implementation via a direct `fetch()` call to the Gemini API — same
 * "no SDK, Workers-native fetch" convention as ClaudeAiProvider. Uses
 * Gemini's controlled-generation `responseSchema` (verified live to produce
 * valid, schema-conforming JSON before this file was written) rather than a
 * free-text prompt parsed after the fact.
 */
export class GeminiJournalistBriefProvider implements JournalistBriefProvider {
  readonly name = 'gemini'
  private readonly apiKey: string
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(config: GeminiJournalistBriefProviderConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'gemini-flash-latest'
    // Storing the bare `fetch` reference and later calling it as `this.fetchImpl(...)`
    // detaches it from the global scope Workers' runtime expects — throws
    // "Illegal invocation" (found live, verified real: ClaudeAiProvider had
    // the identical latent bug, never surfaced because it had never been
    // exercised against a real Workers runtime with a real key before this).
    // Wrapping in a closure keeps the call properly bound regardless.
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  async generateBrief(input: JournalistBriefInput): Promise<JournalistBrief> {
    const res = await this.fetchImpl(`${GEMINI_API_URL}/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: BRIEF_RESPONSE_SCHEMA,
        },
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new Error(`Gemini brief request failed: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ''}`)
    }

    const body = (await res.json()) as GeminiResponse
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error('Gemini brief response did not include text content')
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      throw new Error(`Gemini brief response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }

    return this.toBrief(parsed)
  }

  private toBrief(parsed: Record<string, unknown>): JournalistBrief {
    const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
    const entities = (parsed.entities ?? {}) as Record<string, unknown>

    return {
      summary: String(parsed.summary ?? ''),
      whatHappened: String(parsed.whatHappened ?? ''),
      whyItMattersKnown: String(parsed.whyItMattersKnown ?? ''),
      whyItMattersPotential: String(parsed.whyItMattersPotential ?? ''),
      keyFacts: strings(parsed.keyFacts),
      entities: { people: strings(entities.people), organizations: strings(entities.organizations) },
      locations: strings(parsed.locations),
      topics: strings(parsed.topics),
      suggestedHeadline: String(parsed.suggestedHeadline ?? ''),
      storyAngles: strings(parsed.storyAngles),
      followUpQuestions: strings(parsed.followUpQuestions),
      whatToWatch: strings(parsed.whatToWatch),
      confirmedFacts: strings(parsed.confirmedFacts),
      reportedClaims: strings(parsed.reportedClaims),
      unverifiedClaims: strings(parsed.unverifiedClaims),
      contradictions: strings(parsed.contradictions),
      sourceAssessment: String(parsed.sourceAssessment ?? ''),
      statementNature: isStatementNature(parsed.statementNature) ? parsed.statementNature : 'not_applicable',
      confidence: isConfidenceLevel(parsed.confidence) ? parsed.confidence : 'low',
      confidenceReason: String(parsed.confidenceReason ?? ''),
      editorialPriority: isEditorialPriority(parsed.editorialPriority) ? parsed.editorialPriority : 'monitor',
      model: this.model,
      generatedAt: new Date().toISOString(),
    }
  }
}

function isConfidenceLevel(value: unknown): value is JournalistBrief['confidence'] {
  return typeof value === 'string' && ['very_low', 'low', 'medium', 'high', 'very_high'].includes(value)
}

function isEditorialPriority(value: unknown): value is JournalistBrief['editorialPriority'] {
  return typeof value === 'string' && ['breaking', 'emerging', 'significant', 'monitor', 'background'].includes(value)
}

function isStatementNature(value: unknown): value is JournalistBrief['statementNature'] {
  return (
    typeof value === 'string' &&
    [
      'government_announcement',
      'government_claim',
      'confirmed_external_fact',
      'proposed_policy',
      'scheduled_event',
      'completed_event',
      'not_applicable',
    ].includes(value)
  )
}

export { PROMPT_VERSION }
