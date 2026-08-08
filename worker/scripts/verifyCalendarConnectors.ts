// One-off live verification for the two new South African calendar
// connectors — not part of the test suite, not imported anywhere. Fetches
// REAL data from the live gov.za/thepresidency.gov.za sites, normalizes and
// validates it exactly as the production pipeline would, seeds the two new
// `sources` rows (the same INSERT the new migration performs — done here via
// PostgREST since no `supabase db push` login is available in this
// environment), persists the real events via the real SupabaseRepository
// against the real linked project, and prints back what actually landed.
// This intentionally does NOT clean up afterward — unlike
// verifyIdempotency.ts's fabricated probe row, these are genuine real
// calendar events the production system is meant to serve.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { SupabaseRepository } from '../src/pipeline/supabaseRepository'
import { SouthAfricaGovEventsConnector } from '../src/connectors/sources/southAfricaGovEvents'
import { SouthAfricaPresidencyEventsConnector } from '../src/connectors/sources/southAfricaPresidencyEvents'
import type { SourceConnector } from '../src/connectors/types'

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

const url = env.SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in worker/.dev.vars')

const admin = createClient(url, serviceRoleKey)
const repo = new SupabaseRepository({ url, serviceRoleKey })

const SOURCE_ROWS = [
  {
    id: 'south-africa-gov-events',
    name: 'South African Government (Events Calendar)',
    description:
      "Official upcoming government activities (gov.za/news/events) — presidential/ministerial engagements, campaigns, summits, and other scheduled government events. No auth required, explicitly public; no RSS/API/ICS exists for this section, so it is fetched as structured HTML using the site's own real start_date/end_date filter.",
    type: 'dataset',
    version: '1.0.0',
    refresh_interval_ms: 3600000,
    enabled: true,
  },
  {
    id: 'south-africa-presidency-events',
    name: 'The South African Presidency (Principals Event Calendar)',
    description:
      "Official upcoming engagements for South Africa's government principals (thepresidency.gov.za/events-calendar) — presidential, deputy-presidential, and ministerial events. No auth required, explicitly public; no RSS/API/ICS exists, so it is fetched as structured HTML. No date filter/sort is exposed on the source, so coverage is a bounded page scan each poll, not a guaranteed-complete listing.",
    type: 'dataset',
    version: '1.0.0',
    refresh_interval_ms: 3600000,
    enabled: true,
  },
]

async function runConnector(connector: SourceConnector) {
  const health = await connector.healthCheck()
  const raw = await connector.fetch()
  const normalized = raw.map((r) => connector.normalize(r))
  const validations = normalized.map((e) => connector.validate(e))
  const validCount = validations.filter((v) => v.valid).length
  const invalidSamples = normalized
    .filter((_, i) => !validations[i].valid)
    .slice(0, 3)
    .map((e, i) => ({ title: e.title, errors: validations[i]?.errors }))

  for (const [i, event] of normalized.entries()) {
    if (!validations[i].valid) continue
    await repo.upsertRawEvent(raw[i])
    await repo.upsertNormalizedEvent(event)
  }

  return {
    connectorId: connector.id,
    healthy: health.healthy,
    itemsFetched: raw.length,
    itemsValid: validCount,
    itemsInvalid: raw.length - validCount,
    invalidSamples,
    sampleEvents: normalized.slice(0, 3).map((e) => ({
      title: e.title,
      country: e.country,
      category: e.category,
      status: e.status,
      startTime: e.startTime,
      endTime: e.endTime,
      sourceUrl: e.sourceUrl,
      tags: e.tags,
    })),
  }
}

async function main() {
  const { error: seedError } = await admin.from('sources').upsert(SOURCE_ROWS, { onConflict: 'id', ignoreDuplicates: true })
  if (seedError) throw new Error(`Failed to seed sources rows: ${seedError.message}`)

  const govResult = await runConnector(new SouthAfricaGovEventsConnector())
  const presidencyResult = await runConnector(new SouthAfricaPresidencyEventsConnector())

  const { count: govRowCount } = await admin
    .from('normalized_events')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'south-africa-gov-events')
  const { count: presidencyRowCount } = await admin
    .from('normalized_events')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'south-africa-presidency-events')
  const { count: scheduledFutureCount } = await admin
    .from('normalized_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gt('start_time', new Date().toISOString())

  console.log(
    JSON.stringify(
      {
        southAfricaGovEvents: govResult,
        southAfricaPresidencyEvents: presidencyResult,
        realRowsNowInDatabase: {
          'south-africa-gov-events': govRowCount,
          'south-africa-presidency-events': presidencyRowCount,
          totalScheduledFutureEventsAllSources: scheduledFutureCount,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
