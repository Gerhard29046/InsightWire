// One-off backfill: `populateEntityGraph` (pipeline/processMessage.ts) has
// always run for every event processed by the live queue consumer, but
// before Phase 11 it wrote into an in-memory store that vanished on every
// Worker restart. This script runs that exact same function — imported, not
// reimplemented — against every real event already sitting in
// normalized_events, so entities/entity_event_links reflect the full real
// history, not just events ingested after this migration landed. Idempotent:
// safe to re-run (findOrCreateEntity/addRelationship both upsert on their
// real unique constraints).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { populateEntityGraph } from '../src/pipeline/processMessage'
import { SupabaseEntityGraphStore } from '../src/pipeline/supabaseEntityGraphStore'
import { createDefaultTrustRegistry } from '../src/pipeline/trust'
import { fromNormalizedEventRow, type NormalizedEventRow } from '../src/pipeline/supabaseRepository'
import { SELECT_COLUMNS } from '../src/api/eventsApi'

const __dirname = dirname(fileURLToPath(import.meta.url))
const devVarsPath = resolve(__dirname, '../.dev.vars')
const env: Record<string, string> = {}
for (const line of readFileSync(devVarsPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const trustRegistry = createDefaultTrustRegistry()
const entityGraphStore = new SupabaseEntityGraphStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })

/** `NormalizedEvent.id` is always `${connectorId}:${externalId}` — same real invariant `supabaseRepository.ts`'s own `parseConnectorId` relies on. */
function connectorIdFromEventId(id: string): string {
  const i = id.indexOf(':')
  return i > 0 ? id.slice(0, i) : id
}

const PAGE_SIZE = 200

async function main() {
  let offset = 0
  let totalProcessed = 0
  const errors: string[] = []
  const startedAt = Date.now()

  for (;;) {
    const { data, error } = await supabase.from('normalized_events').select(SELECT_COLUMNS).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`fetch page at offset ${offset} failed: ${error.message}`)
    const rows = (data ?? []) as NormalizedEventRow[]
    if (rows.length === 0) break

    for (const row of rows) {
      const event = fromNormalizedEventRow(row, [])
      const category = trustRegistry.getProfile(connectorIdFromEventId(event.id)).category
      try {
        await populateEntityGraph(entityGraphStore, event, category)
        totalProcessed += 1
      } catch (err) {
        errors.push(`${event.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log(`processed ${totalProcessed} events so far (offset ${offset}, ${((Date.now() - startedAt) / 1000).toFixed(1)}s elapsed)`)
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  console.log(
    JSON.stringify(
      { totalProcessed, errorCount: errors.length, errors: errors.slice(0, 20), elapsedSeconds: (Date.now() - startedAt) / 1000 },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
