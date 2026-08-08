import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GeminiEntityBriefProvider, PROMPT_VERSION, type EntityBrief, type EntityBriefEvidenceEvent, type EntityBriefInput, type EntityBriefProvider } from '../pipeline/ai/entityBriefProvider'
import { getEntityDetail, type EntitiesApiConfig } from './entitiesApi'
import type { NormalizedEvent } from '@insightwire/shared'

export type EntityBriefApiConfig = EntitiesApiConfig

function client({ url, serviceRoleKey }: EntityBriefApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

interface EntityBriefRow {
  brief: EntityBrief
  model: string
  generated_at: string
}

/** Most recent brief for this entity, or `undefined` if none has ever been generated — same "cached-first" pattern as getLatestBrief (briefApi.ts). */
export async function getLatestEntityBrief(config: EntityBriefApiConfig, entityId: string): Promise<EntityBrief | undefined> {
  const { data, error } = await client(config)
    .from('entity_briefs')
    .select('brief, model, generated_at')
    .eq('entity_id', entityId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`getLatestEntityBrief query failed: ${error.message}`)
  if (!data) return undefined
  return (data as EntityBriefRow).brief
}

function toEvidenceEvent(event: NormalizedEvent): EntityBriefEvidenceEvent {
  return { id: event.id, title: event.title, source: event.source, sourceUrl: event.sourceUrl ?? null, publishedAt: event.publishedAt }
}

export interface GenerateEntityBriefDeps {
  config: EntityBriefApiConfig
  provider?: EntityBriefProvider
  geminiApiKey?: string
}

/**
 * The "AI button" for an entity: gathers exactly what `getEntityDetail`
 * already computed from real data (never a separate, looser query), calls
 * the provider, then validates the result against that same real evidence
 * before it's ever stored — a `confirmedFacts` citation naming an event id
 * we didn't actually supply is dropped, `whatToWatch` is forced empty if no
 * real upcoming events existed to ground it, and `sourcesConfirming` is
 * filtered to sources we actually supplied. The model is trusted to
 * classify and summarize; the database evidence is what's trusted to be
 * true — this function is where that boundary is enforced, not just assumed
 * from the prompt.
 */
export async function generateEntityBrief(deps: GenerateEntityBriefDeps, entityId: string): Promise<EntityBrief | undefined> {
  const detail = await getEntityDetail(deps.config, entityId)
  if (!detail) return undefined

  const provider = deps.provider ?? (deps.geminiApiKey ? new GeminiEntityBriefProvider({ apiKey: deps.geminiApiKey }) : undefined)
  if (!provider) throw new Error('No entity brief provider configured (GEMINI_API_KEY missing)')

  const input: EntityBriefInput = {
    entityName: detail.entity.name,
    entityType: detail.entity.type,
    recentEvents: detail.recentEvents.map(toEvidenceEvent),
    breakingEvents: detail.breakingEvents.map(toEvidenceEvent),
    upcomingEvents: detail.upcomingEvents.map(toEvidenceEvent),
    relationships: detail.relationships.map((r) => ({
      relatedEntityName: r.relatedEntity.name,
      relationshipType: r.relationshipType,
      evidenceSnippet: r.evidenceSnippet,
      eventId: r.evidenceEvent.id,
    })),
    sources: detail.sources.map((s) => s.label),
  }

  const brief = await provider.generateBrief(input)

  const validEventIds = new Set([...detail.recentEvents, ...detail.breakingEvents].map((e) => e.id))
  const hasUpcomingEvidence = detail.upcomingEvents.length > 0
  const validSources = new Set(detail.sources.map((s) => s.label))

  const validatedBrief: EntityBrief = {
    ...brief,
    confirmedFacts: brief.confirmedFacts.filter((f) => validEventIds.has(f.eventId)),
    whatToWatch: hasUpcomingEvidence ? brief.whatToWatch : [],
    sourcesConfirming: brief.sourcesConfirming.filter((s) => validSources.has(s)),
  }

  const { error } = await client(deps.config).from('entity_briefs').insert({
    entity_id: entityId,
    model: validatedBrief.model,
    prompt_version: PROMPT_VERSION,
    brief: validatedBrief,
    generated_at: validatedBrief.generatedAt,
  })
  if (error) throw new Error(`generateEntityBrief insert failed: ${error.message}`)

  return validatedBrief
}
