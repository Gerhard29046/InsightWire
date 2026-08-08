import { apiFetch } from './client'

/** Mirrors worker/src/pipeline/ai/journalistBrief.ts's JournalistBrief — the on-demand "AI button" result. */
export type EvidenceLevel = 'confirmed' | 'reported' | 'claim' | 'inference' | 'unverified' | 'unknown'
export type ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high'
export type EditorialPriority = 'breaking' | 'emerging' | 'significant' | 'monitor' | 'background'
export type GovernmentStatementNature =
  | 'government_announcement'
  | 'government_claim'
  | 'confirmed_external_fact'
  | 'proposed_policy'
  | 'scheduled_event'
  | 'completed_event'
  | 'not_applicable'

export interface JournalistBrief {
  summary: string
  whatHappened: string
  whyItMattersKnown: string
  whyItMattersPotential: string
  keyFacts: string[]
  entities: { people: string[]; organizations: string[] }
  locations: string[]
  topics: string[]
  suggestedHeadline: string
  storyAngles: string[]
  followUpQuestions: string[]
  whatToWatch: string[]
  confirmedFacts: string[]
  reportedClaims: string[]
  unverifiedClaims: string[]
  contradictions: string[]
  sourceAssessment: string
  statementNature: GovernmentStatementNature
  confidence: ConfidenceLevel
  confidenceReason: string
  editorialPriority: EditorialPriority
  model: string
  generatedAt: string
}

export class BriefNotFoundError extends Error {
  constructor() {
    super('No brief has been generated for this event yet')
    this.name = 'BriefNotFoundError'
  }
}

/** GET {VITE_API_BASE_URL}/events/:id/brief — the most recently generated brief, or throws BriefNotFoundError if none exists yet. */
export async function fetchLatestBrief(eventId: string): Promise<JournalistBrief> {
  try {
    return await apiFetch<JournalistBrief>(`/events/${encodeURIComponent(eventId)}/brief`)
  } catch (err) {
    if (err instanceof Error && 'status' in err && (err as { status?: number }).status === 404) {
      throw new BriefNotFoundError()
    }
    throw err
  }
}

/**
 * POST {VITE_API_BASE_URL}/events/:id/brief — the "Summarize this event"
 * action. Generates a new brief via the real Gemini-backed pipeline
 * (worker/src/pipeline/ai/geminiJournalistBriefProvider.ts) and persists
 * it. 60s timeout, not the client's 10s default: a real call with Gemini's
 * "thinking" enabled measured ~12s for a real event — this needs headroom
 * for slower/longer articles, not the same budget as a Postgres read.
 */
const BRIEF_GENERATION_TIMEOUT_MS = 60_000

export function generateBrief(eventId: string): Promise<JournalistBrief> {
  return apiFetch<JournalistBrief>(`/events/${encodeURIComponent(eventId)}/brief`, { method: 'POST' }, BRIEF_GENERATION_TIMEOUT_MS)
}
