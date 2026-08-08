import type { RawEvent } from './connectors/types'
import { InMemoryRepository, type Repository } from './pipeline/repository'
import { SupabaseRepository } from './pipeline/supabaseRepository'

/**
 * Split out of worker.ts so worker.ts and api/router.ts can both depend on
 * it without importing each other (worker.ts wires the router in; the
 * router needs the same Env/repository-selection logic worker.ts's queue()
 * handler already used).
 */
export interface Env {
  RAW_EVENTS_QUEUE: Queue<RawEvent>
  /** Absent -> NullAiProvider (see pipeline/ai/enrichmentPipeline.ts's selectAiProvider). */
  ANTHROPIC_API_KEY?: string
  /** Both absent -> InMemoryRepository (see selectRepository below). Both present -> SupabaseRepository. Service-role key: bypasses RLS by design, never reaches the frontend. */
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  /** Absent -> the journalist-brief endpoint (POST /events/:id/brief) returns 503, same "not configured -> honest error" pattern as everything else. Never reaches the frontend. */
  GEMINI_API_KEY?: string
}

/**
 * Env-based factory — the same "not configured -> honest default" pattern as
 * `selectAiProvider` (pipeline/ai/enrichmentPipeline.ts). `InMemoryRepository`
 * remains the default so local `wrangler dev` without Supabase credentials
 * behaves exactly as it did in every prior phase.
 */
export function selectRepository(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>): Repository {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
  }
  return new InMemoryRepository()
}
