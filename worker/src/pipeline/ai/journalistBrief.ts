import type { ConfirmingSource, EventUpdate, NormalizedEvent } from '@insightwire/shared'

/**
 * The on-demand "AI button" capability (Phase 9) — deliberately separate
 * from `AiProvider`/`enrichEvent` (pipeline/ai/types.ts,
 * pipeline/ai/enrichmentPipeline.ts), which runs automatically for every
 * ingested event as part of `processMessage`. A journalist brief is much
 * richer, user-triggered per event ("Summarize this event"), and must never
 * run automatically for every one of the hundreds of events ingested per
 * tick — a different cost/trigger model entirely, not a bigger version of
 * the same thing. The automatic ingestion-time enrichment pipeline is
 * untouched by this feature.
 */

export type EvidenceLevel = 'confirmed' | 'reported' | 'claim' | 'inference' | 'unverified' | 'unknown'
export type ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high'
export type EditorialPriority = 'breaking' | 'emerging' | 'significant' | 'monitor' | 'background'

/**
 * What KIND of statement this event actually is — orthogonal to
 * `EvidenceLevel` (which is about how well-supported a claim is).
 * "government_announcement" and "government_claim" can both be
 * `evidenceLevel: reported`; the difference is whether the government is
 * stating a fact about its own action (an announcement — "the Minister
 * signed X") vs. asserting something about the world it doesn't directly
 * control (a claim — "inflation will fall next quarter"). Requested
 * specifically for government-sourced connectors (SAnews, gov.za, etc.)
 * but applies to any event — `not_applicable` covers non-government
 * sources with nothing to classify here.
 */
export type GovernmentStatementNature =
  | 'government_announcement'
  | 'government_claim'
  | 'confirmed_external_fact'
  | 'proposed_policy'
  | 'scheduled_event'
  | 'completed_event'
  | 'not_applicable'

/** Exactly what the ingestion system already collected for this event — the brief provider must never be given anything else, and must never be asked to fetch or infer beyond it. */
export interface JournalistBriefInput {
  event: NormalizedEvent
  timeline: EventUpdate[]
  confirmingSources: ConfirmingSource[] | undefined
}

export interface JournalistBrief {
  /** One-line, non-sensational breaking-news summary. */
  summary: string
  whatHappened: string
  /** Rule 23: known vs. potential impact must never be conflated. */
  whyItMattersKnown: string
  whyItMattersPotential: string
  keyFacts: string[]
  entities: { people: string[]; organizations: string[] }
  locations: string[]
  topics: string[]
  suggestedHeadline: string
  /** Investigative questions/directions (rule 11) — never speculative answers. */
  storyAngles: string[]
  followUpQuestions: string[]
  whatToWatch: string[]
  /** Rule 4: never promoted into a higher evidence level than the source actually supports. */
  confirmedFacts: string[]
  reportedClaims: string[]
  unverifiedClaims: string[]
  /** Rule 7: both sides stated, no side chosen unless independently established. */
  contradictions: string[]
  sourceAssessment: string
  /** See GovernmentStatementNature's doc comment — the type of statement this is, not how well-supported it is. */
  statementNature: GovernmentStatementNature
  confidence: ConfidenceLevel
  confidenceReason: string
  editorialPriority: EditorialPriority
  model: string
  generatedAt: string
}

export interface JournalistBriefProvider {
  readonly name: string
  generateBrief(input: JournalistBriefInput): Promise<JournalistBrief>
}
