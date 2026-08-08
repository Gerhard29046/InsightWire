import type { AiEnrichmentContext, AiEnrichmentResult, AiProvider } from './types'
import type { NormalizedEvent } from '@insightwire/shared'

/**
 * The default provider — selected whenever no real AI provider is
 * configured (see enrichmentPipeline.ts's selectAiProvider). Honestly
 * leaves events unenriched rather than fabricating AI output: "no mock
 * events" applies to AI-generated fields exactly as much as to raw ones.
 * Every event gets this today, in this environment — real, not simulated.
 */
export class NullAiProvider implements AiProvider {
  readonly name = 'null'

  async enrich(_event: NormalizedEvent, _context?: AiEnrichmentContext): Promise<AiEnrichmentResult> {
    return {
      keywords: [],
      people: [],
      organizations: [],
      relatedEventIds: [],
      model: 'null',
    }
  }

  async embed(_text: string): Promise<number[] | undefined> {
    return undefined
  }
}
