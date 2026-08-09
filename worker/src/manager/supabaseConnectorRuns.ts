import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CollectionResult } from './types'

export interface SupabaseConnectorRunsConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: SupabaseConnectorRunsConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Real persistence for `connector_runs` — the table has existed since Phase
 * 6 (`supabase/migrations/20260807180002_sources.sql`) and is documented
 * there as "what would back a Postgres MetricsStore implementation later,
 * without changing ConnectorManager," but nothing in this codebase ever
 * wrote to it (confirmed by a full audit — every run's history lived only
 * in `InMemoryMetricsStore`, reset on every Worker restart, with no way to
 * answer "which feeds are stale or failing" after the fact).
 *
 * Deliberately NOT a `MetricsStore` implementation: `MetricsStore.record()`
 * is synchronous (`ConnectorManager`'s due-connector check calls
 * `getSnapshot()` synchronously, in a hot path run once per connector per
 * tick), and a real Postgres write cannot honestly satisfy that contract —
 * making it async would mean threading `await` through every scheduling
 * decision in `ConnectorManager`, a much larger change than "persist a run
 * history" actually requires. Instead, `worker.ts`'s `scheduled()` handler
 * (which already has `env` and can genuinely `await`) calls this directly,
 * once per connector, after `collectDue()` returns — an additive audit
 * trail alongside the existing in-memory due-tracking, not a replacement
 * for it.
 */
export async function recordConnectorRun(config: SupabaseConnectorRunsConfig, result: CollectionResult): Promise<void> {
  const supabase = client(config)
  const { error } = await supabase.from('connector_runs').insert({
    source_id: result.connectorId,
    status: result.status === 'collected' ? 'success' : 'failed',
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    duration_ms: result.durationMs,
    attempts: result.attempts,
    items_fetched: result.itemsCollected,
    // Honest, not a bug: normalize()/validate() run downstream in the queue
    // consumer (see processMessage.ts), not at collection time — this row
    // reflects what a collection pass actually did, same reasoning already
    // documented at ConnectorManager.collectOne's in-memory metrics.record call.
    items_normalized: 0,
    items_valid: 0,
    items_invalid: 0,
    sample_errors: result.error ? [result.error] : [],
  })
  if (error) throw new Error(`recordConnectorRun failed for "${result.connectorId}": ${error.message}`)
}
