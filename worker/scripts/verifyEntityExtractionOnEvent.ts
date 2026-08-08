// One-off live verification: runs the REAL extractEntitiesForEvent (not a
// reimplementation) against one specific, real, rich event, then reads back
// what actually landed in Supabase to confirm the whole pipeline — Gemini
// call, evidence validation, confidence gating, entity/relationship
// persistence — works end-to-end against real infrastructure.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { extractEntitiesForEvent } from '../src/pipeline/entityExtraction'
import { GeminiEntityExtractionProvider } from '../src/pipeline/ai/entityExtractionProvider'
import { SupabaseEntityGraphStore } from '../src/pipeline/supabaseEntityGraphStore'
import { fromNormalizedEventRow, SELECT_COLUMNS, type NormalizedEventRow } from '../src/pipeline/supabaseRepository'

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

const EVENT_ID = 'south-africa-gov:845521 at https://www.gov.za'

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase.from('normalized_events').select(SELECT_COLUMNS).eq('id', EVENT_ID).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`event ${EVENT_ID} not found`)
  const event = fromNormalizedEventRow(data as NormalizedEventRow, [])

  const provider = new GeminiEntityExtractionProvider({ apiKey: env.GEMINI_API_KEY })
  const entityGraphStore = new SupabaseEntityGraphStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
  const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }

  const result = await extractEntitiesForEvent(event, provider, entityGraphStore, config)
  console.log('extractEntitiesForEvent result:', JSON.stringify(result, null, 2))

  const { data: extractionRows } = await supabase.from('entity_extractions').select('extracted_name, entity_type, confidence, accepted').eq('event_id', EVENT_ID)
  console.log('\nentity_extractions rows for this event:')
  console.log(JSON.stringify(extractionRows, null, 2))

  const { data: linkRows } = await supabase
    .from('entity_event_links')
    .select('relationship_type, entities(name, entity_type)')
    .eq('event_id', EVENT_ID)
  console.log('\nentity_event_links rows for this event (real entities now linked):')
  console.log(JSON.stringify(linkRows, null, 2))

  const { data: relRows } = await supabase.from('entity_relationships').select('relationship_type, confidence, evidence_snippet').eq('evidence_event_id', EVENT_ID)
  console.log('\nentity_relationships rows evidenced by this event:')
  console.log(JSON.stringify(relRows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
