import type { NormalizedEvent } from '@insightwire/shared'
import { ClaudeAiProvider } from './claudeProvider'
import { NullAiProvider } from './nullProvider'
import type { AiEnrichmentContext, AiProvider } from './types'

export interface AiSummaryRecord {
  normalizedEventId: string
  model: string
  promptVersion?: string
  summary: string
  confidence?: number
  generatedAt: string
}

export interface EnrichmentOutcome {
  event: NormalizedEvent
  /** Set only when the provider actually produced a summary — the append-only ai_summaries history record (see Phase 6's schema). */
  summaryRecord?: AiSummaryRecord
  embedding?: number[]
}

export interface AiProviderEnv {
  ANTHROPIC_API_KEY?: string
}

/** Env-based factory — the same "not configured -> honest default" pattern as the frontend's ApiNotConfiguredError. */
export function selectAiProvider(env: AiProviderEnv): AiProvider {
  if (env.ANTHROPIC_API_KEY) {
    return new ClaudeAiProvider({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return new NullAiProvider()
}

/**
 * Calls the provider and merges its output into the event. Raw fields
 * (title, description, source, ...) are never touched here — only
 * AI-derived fields are conditionally updated, and only when the provider
 * actually returned something (NullAiProvider's empty arrays/undefined
 * correctly result in "no change"). Matches Phase 6's `ai_summaries` design:
 * store AI output separately, never overwrite raw source data.
 */
export async function enrichEvent(
  event: NormalizedEvent,
  provider: AiProvider,
  context?: AiEnrichmentContext,
): Promise<EnrichmentOutcome> {
  const result = await provider.enrich(event, context)

  const enrichedEvent: NormalizedEvent = {
    ...event,
    summary: result.summary ?? event.summary,
    keywords: result.keywords.length > 0 ? result.keywords : event.keywords,
    people: result.people.length > 0 ? result.people : event.people,
    organizations: result.organizations.length > 0 ? result.organizations : event.organizations,
    importance: result.importance ?? event.importance,
    confidence: result.confidence ?? event.confidence,
  }

  const summaryRecord: AiSummaryRecord | undefined = result.summary
    ? {
        normalizedEventId: event.id,
        model: result.model,
        promptVersion: result.promptVersion,
        summary: result.summary,
        confidence: result.confidence,
        generatedAt: new Date().toISOString(),
      }
    : undefined

  const embedding = await provider.embed(`${enrichedEvent.title}\n${enrichedEvent.description}`)

  return { event: enrichedEvent, summaryRecord, embedding }
}
