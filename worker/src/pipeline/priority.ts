import type { CategoryId, NormalizedEvent, Severity } from '@insightwire/shared'

/**
 * A real, deterministic weighted-sum formula — not AI-generated, a rules
 * engine, fully unit-testable. Weights sum to 1.0; the result is scaled to
 * 0-100 (more legible for sorting/display than a 0-1 fraction).
 */
export interface PriorityWeights {
  sourceTrust: number
  confirmingSources: number
  freshness: number
  aiConfidence: number
  geographicImpact: number
  politicalImpact: number
  economicImpact: number
  disasterSeverity: number
  categoryWeight: number
}

/**
 * Rebalanced from the original weights (sourceTrust .2, confirmingSources
 * .15, freshness .15, aiConfidence .1, geographicImpact .1, politicalImpact
 * .1, economicImpact .1, disasterSeverity .05, categoryWeight .05) to fix a
 * real, confirmed problem: `disasterSeverity` — the *only* signal that can
 * tell a routine weather alert apart from a major one — had the smallest
 * weight in the whole formula, while a static, category-wide
 * `geographicImpact` default (0.9 for every weather event, severe or not)
 * and a flat `categoryWeight` bonus (weather always scored high regardless
 * of severity) dominated instead. A fresh, trusted-source, routine
 * thunderstorm alert could already score ~45-50/100 before severity was
 * even factored in.
 *
 * `disasterSeverity`: .05 -> .20 (now the largest single weight after
 * sourceTrust, so a real Red/critical event and a real Green/low event are
 * clearly distinguishable in the final score).
 * `geographicImpact`: .10 -> .05 (this is a static per-category default,
 * not a per-event signal — it shouldn't outweigh a real per-event severity
 * reading).
 * `economicImpact`: .10 -> .05 (same reasoning — weather's economic-impact
 * default is a category-wide guess, not real per-event data).
 * `categoryWeight`: .05 -> .00 (a fixed "this category always matters"
 * bonus is exactly what let every weather event score similarly regardless
 * of real severity; removed rather than shrunk, since disasterSeverity now
 * covers that job for weather and every other category still has zero
 * real events today — see docs/decisions/0006-intelligence-quality.md).
 * Non-weather categories are only mildly affected (computeDisasterSeverity
 * returns 0 for them, same as before — see its own doc comment).
 * Weights still sum to exactly 1.0.
 */
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  sourceTrust: 0.2,
  confirmingSources: 0.15,
  freshness: 0.15,
  aiConfidence: 0.1,
  geographicImpact: 0.05,
  politicalImpact: 0.1,
  economicImpact: 0.05,
  disasterSeverity: 0.2,
  categoryWeight: 0.0,
}

export interface CategoryImpactDefaults {
  geographic: number
  political: number
  economic: number
}

/**
 * Stand-in for real per-event AI impact scoring (NullAiProvider supplies
 * none today — see pipeline/ai/). An honest, documented heuristic by
 * category, not fabricated per-event data; overridden by
 * `PriorityInputs.aiImpact` whenever a real provider actually returns one.
 */
export const CATEGORY_IMPACT_DEFAULTS: Record<CategoryId, CategoryImpactDefaults> = {
  government: { political: 0.8, economic: 0.4, geographic: 0.5 },
  business: { political: 0.2, economic: 0.8, geographic: 0.4 },
  courts: { political: 0.5, economic: 0.3, geographic: 0.3 },
  markets: { political: 0.3, economic: 0.9, geographic: 0.5 },
  elections: { political: 0.9, economic: 0.3, geographic: 0.6 },
  natural_disasters: { political: 0.1, economic: 0.5, geographic: 0.9 },
  conflicts: { political: 0.9, economic: 0.4, geographic: 0.8 },
  science: { political: 0.1, economic: 0.3, geographic: 0.3 },
}

/** A fixed editorial bias, independent of any single event's impact scores — how much a category generally warrants attention. */
export const CATEGORY_BASE_WEIGHT: Record<CategoryId, number> = {
  conflicts: 1.0,
  natural_disasters: 0.9,
  elections: 0.85,
  government: 0.7,
  markets: 0.7,
  courts: 0.6,
  business: 0.6,
  science: 0.5,
}

const SEVERITY_TO_SCORE: Record<Severity, number> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 }

const FRESHNESS_WINDOW_HOURS = 24
const CONFIRMING_SOURCE_STEP = 0.25

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function computeFreshness(publishedAt: string, now: Date): number {
  const hoursAgo = (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60)
  return clamp01(1 - hoursAgo / FRESHNESS_WINDOW_HOURS)
}

function computeConfirmingSourcesScore(confirmingSourceCount: number): number {
  return clamp01((confirmingSourceCount - 1) * CONFIRMING_SOURCE_STEP)
}

/** Only natural_disasters events carry a meaningful "disaster" reading today — everything else scores 0, not a guess. */
function computeDisasterSeverity(event: NormalizedEvent): number {
  return event.category === 'natural_disasters' ? SEVERITY_TO_SCORE[event.importance] : 0
}

export interface AiImpactScores {
  geographic?: number
  political?: number
  economic?: number
}

export interface PriorityInputs {
  event: NormalizedEvent
  sourceTrustScore: number
  /** Real per-event scores from an AI provider, when one supplies them — falls back to CATEGORY_IMPACT_DEFAULTS otherwise. */
  aiImpact?: AiImpactScores
  now?: Date
  weights?: PriorityWeights
}

/** The frontend will eventually sort by this instead of publication time. */
export function computePriorityScore(inputs: PriorityInputs): number {
  const { event, sourceTrustScore, aiImpact, weights = DEFAULT_PRIORITY_WEIGHTS } = inputs
  const now = inputs.now ?? new Date()
  const categoryDefaults = CATEGORY_IMPACT_DEFAULTS[event.category]

  const geographic = aiImpact?.geographic ?? categoryDefaults.geographic
  const political = aiImpact?.political ?? categoryDefaults.political
  const economic = aiImpact?.economic ?? categoryDefaults.economic
  const confirmingSourcesScore = computeConfirmingSourcesScore(event.confirmingSources?.length ?? 1)
  const freshness = computeFreshness(event.publishedAt, now)
  const disasterSeverity = computeDisasterSeverity(event)
  const categoryWeight = CATEGORY_BASE_WEIGHT[event.category]

  const weighted =
    clamp01(sourceTrustScore) * weights.sourceTrust +
    confirmingSourcesScore * weights.confirmingSources +
    freshness * weights.freshness +
    clamp01(event.confidence) * weights.aiConfidence +
    clamp01(geographic) * weights.geographicImpact +
    clamp01(political) * weights.politicalImpact +
    clamp01(economic) * weights.economicImpact +
    disasterSeverity * weights.disasterSeverity +
    categoryWeight * weights.categoryWeight

  return Math.round(clamp01(weighted) * 100)
}
