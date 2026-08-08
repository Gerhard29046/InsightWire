import type { CategoryId, NormalizedEvent, Severity } from '@insightwire/shared'

/**
 * One consolidated result per event rather than 8 separate calls (language
 * detection, entity extraction, summary, ...) — matches how this is
 * actually prompted against a real LLM: one structured (tool-call/JSON)
 * response, not eight round trips per event.
 */
export interface AiEnrichmentResult {
  summary?: string
  keywords: string[]
  people: string[]
  organizations: string[]
  suggestedCategory?: CategoryId
  importance?: Severity
  confidence?: number
  language?: string
  /** Ids of other known events this one appears related to. */
  relatedEventIds: string[]
  model: string
  promptVersion?: string
}

export interface AiEnrichmentContext {
  relatedEvents?: NormalizedEvent[]
}

export interface AiProvider {
  readonly name: string
  enrich(event: NormalizedEvent, context?: AiEnrichmentContext): Promise<AiEnrichmentResult>
  /** Embedding models are typically a distinct call from chat/completion — kept separate on purpose. */
  embed(text: string): Promise<number[] | undefined>
}
