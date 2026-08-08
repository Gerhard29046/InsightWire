import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GeminiJournalistBriefProvider, PROMPT_VERSION } from '../pipeline/ai/geminiJournalistBriefProvider'
import type { JournalistBrief, JournalistBriefProvider } from '../pipeline/ai/journalistBrief'
import type { Repository } from '../pipeline/repository'
import { getTimeline } from '../pipeline/timeline'

export interface BriefApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: BriefApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

interface JournalistBriefRow {
  brief: JournalistBrief
  model: string
  generated_at: string
}

/** Most recent brief for this event, or `undefined` if none has ever been generated — the frontend uses this to decide whether to show "Summarize this event" or the cached result first. */
export async function getLatestBrief(config: BriefApiConfig, normalizedEventId: string): Promise<JournalistBrief | undefined> {
  const { data, error } = await client(config)
    .from('journalist_briefs')
    .select('brief, model, generated_at')
    .eq('normalized_event_id', normalizedEventId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`getLatestBrief query failed: ${error.message}`)
  if (!data) return undefined
  const row = data as JournalistBriefRow
  return row.brief
}

export interface GenerateBriefDeps {
  config: BriefApiConfig
  repository: Repository
  provider?: JournalistBriefProvider
  geminiApiKey?: string
}

/**
 * The "AI button": fetches exactly what the ingestion system already
 * collected for this event (never anything else — see JournalistBriefInput's
 * doc comment), calls the provider, and appends the result. Never called
 * automatically — only from the API's POST handler, one event at a time,
 * user-triggered.
 */
export async function generateBrief(deps: GenerateBriefDeps, normalizedEventId: string): Promise<JournalistBrief | undefined> {
  const event = await deps.repository.getNormalizedEvent(normalizedEventId)
  if (!event) return undefined

  const timeline = await getTimeline(deps.repository, normalizedEventId)
  const provider =
    deps.provider ?? (deps.geminiApiKey ? new GeminiJournalistBriefProvider({ apiKey: deps.geminiApiKey }) : undefined)
  if (!provider) throw new Error('No journalist brief provider configured (GEMINI_API_KEY missing)')

  const brief = await provider.generateBrief({ event, timeline, confirmingSources: event.confirmingSources })

  const { error } = await client(deps.config).from('journalist_briefs').insert({
    normalized_event_id: normalizedEventId,
    model: brief.model,
    prompt_version: PROMPT_VERSION,
    brief,
    generated_at: brief.generatedAt,
  })
  if (error) throw new Error(`generateBrief insert failed: ${error.message}`)

  return brief
}
