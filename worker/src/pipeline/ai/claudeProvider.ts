import { CATEGORY_IDS, SEVERITY_LEVELS, type NormalizedEvent } from '@insightwire/shared'
import type { AiEnrichmentContext, AiEnrichmentResult, AiProvider } from './types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-5'
const PROMPT_VERSION = '1'
const TOOL_NAME = 'submit_enrichment'

const ENRICHMENT_TOOL = {
  name: TOOL_NAME,
  description: 'Submit structured enrichment for a single news event.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'A concise, neutral 1-3 sentence summary of the event.' },
      keywords: { type: 'array', items: { type: 'string' } },
      people: { type: 'array', items: { type: 'string' } },
      organizations: { type: 'array', items: { type: 'string' } },
      suggestedCategory: { type: 'string', enum: [...CATEGORY_IDS] },
      importance: { type: 'string', enum: [...SEVERITY_LEVELS] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      language: { type: 'string', description: 'ISO 639-1 language code of the source text.' },
    },
    required: ['summary', 'keywords', 'importance', 'confidence'],
  },
} as const

interface AnthropicToolUseBlock {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}

interface AnthropicResponse {
  content: Array<AnthropicToolUseBlock | { type: string }>
}

export interface ClaudeAiProviderConfig {
  apiKey: string
  /** Injectable for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

/**
 * Real implementation via a direct `fetch()` call to the Anthropic Messages
 * API — not the Node-oriented SDK, which doesn't reliably target the
 * Workers runtime. Selected automatically only when `ANTHROPIC_API_KEY` is
 * present (see enrichmentPipeline.ts); never called against the real API in
 * this environment (no key configured) — covered here by request-building
 * and response-parsing unit tests against a mocked `fetch` only.
 */
export class ClaudeAiProvider implements AiProvider {
  readonly name = 'claude'
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: ClaudeAiProviderConfig) {
    this.apiKey = config.apiKey
    // A bare `fetch` reference called later as `this.fetchImpl(...)` is
    // detached from the global scope Workers' runtime expects and throws
    // "Illegal invocation" — found live while building GeminiJournalistBriefProvider,
    // the first real (non-mocked) exercise of this exact pattern in this
    // codebase. Wrapping in a closure keeps the call properly bound.
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  async enrich(event: NormalizedEvent, context?: AiEnrichmentContext): Promise<AiEnrichmentResult> {
    const res = await this.fetchImpl(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [ENRICHMENT_TOOL],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildPrompt(event, context) }],
      }),
    })

    if (!res.ok) {
      throw new Error(`Claude enrichment request failed: HTTP ${res.status}`)
    }

    const body = (await res.json()) as AnthropicResponse
    const toolUse = body.content.find((block): block is AnthropicToolUseBlock => block.type === 'tool_use')
    if (!toolUse) {
      throw new Error('Claude enrichment response did not include a tool_use block')
    }

    return parseToolInput(toolUse.input)
  }

  async embed(_text: string): Promise<number[] | undefined> {
    // Anthropic doesn't currently offer a first-party embeddings endpoint.
    // Leaving this unset (rather than silently calling a different vendor)
    // keeps "which provider produced this" unambiguous — a dedicated
    // embedding provider is a separate, explicit choice for later.
    return undefined
  }
}

function buildPrompt(event: NormalizedEvent, context?: AiEnrichmentContext): string {
  const related = context?.relatedEvents?.length
    ? `\n\nPotentially related events:\n${context.relatedEvents.map((e) => `- ${e.title}`).join('\n')}`
    : ''
  return [
    'Analyze this news event and submit structured enrichment via the tool.',
    `Title: ${event.title}`,
    `Description: ${event.description}`,
    `Source: ${event.source}`,
    `Category (source-assigned): ${event.category}`,
    related,
  ]
    .filter(Boolean)
    .join('\n')
}

function parseToolInput(input: Record<string, unknown>): AiEnrichmentResult {
  return {
    summary: typeof input.summary === 'string' ? input.summary : undefined,
    keywords: Array.isArray(input.keywords) ? input.keywords.map(String) : [],
    people: Array.isArray(input.people) ? input.people.map(String) : [],
    organizations: Array.isArray(input.organizations) ? input.organizations.map(String) : [],
    suggestedCategory: isCategoryId(input.suggestedCategory) ? input.suggestedCategory : undefined,
    importance: isSeverity(input.importance) ? input.importance : undefined,
    confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
    language: typeof input.language === 'string' ? input.language : undefined,
    relatedEventIds: [],
    model: MODEL,
    promptVersion: PROMPT_VERSION,
  }
}

function isCategoryId(value: unknown): value is AiEnrichmentResult['suggestedCategory'] {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value)
}

function isSeverity(value: unknown): value is AiEnrichmentResult['importance'] {
  return typeof value === 'string' && (SEVERITY_LEVELS as readonly string[]).includes(value)
}
