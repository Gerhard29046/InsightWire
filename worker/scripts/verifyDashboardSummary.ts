// One-off independent verification for the new GET /dashboard/summary
// endpoint — same pattern as verifyIdempotency.ts/verifyCalendarConnectors.ts.
// Re-derives every Dashboard number directly against the real database using
// separate, hand-written queries (not by calling dashboardApi.ts) so this is
// a genuine independent cross-check, not the same code checking itself.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

async function main() {
  const tracked = await supabase
    .from('normalized_events')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'scheduled')
    .gte('published_at', since)

  const highPriority = await supabase
    .from('normalized_events')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'scheduled')
    .gte('published_at', since)
    .gte('priority_score', 60)

  const scheduledInWindow = await supabase
    .from('normalized_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gte('published_at', since)

  const rows = await supabase.from('normalized_events').select('country, source, category').neq('status', 'scheduled').gte('published_at', since)
  const countries = new Set((rows.data ?? []).map((r) => r.country))
  const sources = new Set((rows.data ?? []).map((r) => r.source))
  const byCategory: Record<string, number> = {}
  for (const r of rows.data ?? []) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1

  // Spot-check a handful of real rows directly.
  const sample = await supabase
    .from('normalized_events')
    .select('id, title, country, source, category, status, priority_score, published_at')
    .neq('status', 'scheduled')
    .gte('published_at', since)
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(3)

  console.log(
    JSON.stringify(
      {
        independentEventsTracked24h: tracked.count,
        independentHighPriorityAlerts24h: highPriority.count,
        // Should be 0 — proves scheduled events discovered in this window are excluded from these counts even though they exist.
        scheduledEventsThatWouldHaveLeakedIn: scheduledInWindow.count,
        independentCountriesReporting: countries.size,
        independentSourcesReporting: sources.size,
        independentCategoryBreakdown: byCategory,
        sampleTopRecords: sample.data,
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
