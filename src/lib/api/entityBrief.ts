import { apiFetch } from './client'

/** Mirrors worker/src/pipeline/ai/entityBriefProvider.ts's EntityBrief — the entity-page "AI Intelligence Summary." */
export interface CitedStatement {
  statement: string
  /** Always a real event id this brief was actually built from — validated server-side before storage, never trusted from the model alone. */
  eventId: string
}

export interface EntityBrief {
  summary: string
  whatChanged: string
  confirmedFacts: CitedStatement[]
  aiInterpretation: string[]
  whatToWatch: string[]
  sourcesConfirming: string[]
  model: string
  generatedAt: string
}

export class EntityBriefNotFoundError extends Error {
  constructor() {
    super('No brief has been generated for this entity yet')
    this.name = 'EntityBriefNotFoundError'
  }
}

/** GET {VITE_API_BASE_URL}/entities/:id/brief — the most recently generated brief, or throws EntityBriefNotFoundError if none exists yet. */
export async function fetchLatestEntityBrief(entityId: string): Promise<EntityBrief> {
  try {
    return await apiFetch<EntityBrief>(`/entities/${encodeURIComponent(entityId)}/brief`)
  } catch (err) {
    if (err instanceof Error && 'status' in err && (err as { status?: number }).status === 404) {
      throw new EntityBriefNotFoundError()
    }
    throw err
  }
}

/** POST {VITE_API_BASE_URL}/entities/:id/brief — same generous timeout as the event brief (real Gemini "thinking" latency, not a fast Postgres read). */
const ENTITY_BRIEF_GENERATION_TIMEOUT_MS = 60_000

export function generateEntityBrief(entityId: string): Promise<EntityBrief> {
  return apiFetch<EntityBrief>(`/entities/${encodeURIComponent(entityId)}/brief`, { method: 'POST' }, ENTITY_BRIEF_GENERATION_TIMEOUT_MS)
}
