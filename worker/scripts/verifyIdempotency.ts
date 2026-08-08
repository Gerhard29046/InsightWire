// One-off verification script for Phase 7 live testing — not part of the
// test suite, not imported anywhere. Exercises the real SupabaseRepository
// against the real database to prove replaying identical writes doesn't
// create duplicate rows. Deletes its own test event afterward.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '@insightwire/shared'
import { SupabaseRepository } from '../src/pipeline/supabaseRepository'

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

const repo = new SupabaseRepository({ url, serviceRoleKey })
const admin = createClient(url, serviceRoleKey)

const TEST_EVENT_ID = 'nasa-news:__idempotency-probe__'

async function countWhere(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(column, value)
  if (error) throw error
  return count ?? 0
}

async function main() {
  const event: NormalizedEvent = {
    id: TEST_EVENT_ID,
    title: 'Idempotency probe event',
    description: 'Written twice on purpose to verify no duplicate rows result.',
    country: 'Global',
    category: 'science',
    source: 'NASA News',
    publishedAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: ['idempotency-probe'],
    status: 'developing',
    sourceTrustScore: 0.9,
    priorityScore: 42,
    confirmingSources: [{ connectorId: 'nasa-news', reportedAt: '2026-08-07T00:00:00.000Z' }],
  }
  const rawEvent = { connectorId: 'nasa-news', externalId: '__idempotency-probe__', fetchedAt: '2026-08-07T00:00:00.000Z', payload: { probe: true } }
  const update = { at: '2026-08-07T00:00:00.000Z', label: 'Probe update' }
  const summary = { normalizedEventId: TEST_EVENT_ID, model: 'test-model', summary: 'Probe summary.', generatedAt: '2026-08-07T00:00:00.000Z' }

  // Clean slate in case a prior run left rows behind.
  await admin.from('normalized_events').delete().eq('id', TEST_EVENT_ID)
  await admin.from('raw_events').delete().eq('source_id', 'nasa-news').eq('external_id', '__idempotency-probe__')

  // Write everything twice — simulating a redelivered queue message.
  for (let i = 0; i < 2; i++) {
    await repo.upsertRawEvent(rawEvent)
    await repo.upsertNormalizedEvent(event)
    await repo.recordEventUpdate(TEST_EVENT_ID, update)
    await repo.recordAiSummary(summary)
  }

  const rawCount = await countWhere('raw_events', 'external_id', '__idempotency-probe__')
  const normCount = await countWhere('normalized_events', 'id', TEST_EVENT_ID)
  const updateCount = await countWhere('event_updates', 'normalized_event_id', TEST_EVENT_ID)
  const summaryCount = await countWhere('ai_summaries', 'normalized_event_id', TEST_EVENT_ID)
  const confirmingCount = await countWhere('event_confirming_sources', 'normalized_event_id', TEST_EVENT_ID)

  const fetched = await repo.getNormalizedEvent(TEST_EVENT_ID)

  console.log(
    JSON.stringify(
      {
        rawEventRows: rawCount,
        normalizedEventRows: normCount,
        eventUpdateRows: updateCount,
        aiSummaryRows: summaryCount,
        confirmingSourceRows: confirmingCount,
        roundTrippedTags: fetched?.tags,
        roundTrippedPriorityScore: fetched?.priorityScore,
        roundTrippedSourceTrustScore: fetched?.sourceTrustScore,
        roundTrippedConfirmingSources: fetched?.confirmingSources,
      },
      null,
      2,
    ),
  )

  // Clean up so this probe leaves no trace in the real dataset.
  await admin.from('normalized_events').delete().eq('id', TEST_EVENT_ID)
  await admin.from('raw_events').delete().eq('source_id', 'nasa-news').eq('external_id', '__idempotency-probe__')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
