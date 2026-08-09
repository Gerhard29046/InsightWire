import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { recordAuditEntry, type AdminApiConfig } from './adminApi'

function client({ url, serviceRoleKey }: AdminApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface ConfigEntry {
  key: string
  value: Record<string, unknown>
  description: string | null
  updatedAt: string
}

interface ConfigRow {
  key: string
  value: Record<string, unknown>
  description: string | null
  updated_at: string
}

/**
 * The single source of truth for site configuration (Appearance/Navigation/
 * Notification defaults) — see the migration's own doc comment. The
 * frontend fetches this once via `GET /admin/config` and provides it through
 * a React context; no component keeps its own copy of these settings.
 */
export async function listConfig(config: AdminApiConfig): Promise<ConfigEntry[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('app_config').select('key, value, description, updated_at').order('key')
  if (error) throw new Error(`listConfig failed: ${error.message}`)
  return ((data ?? []) as ConfigRow[]).map((r) => ({ key: r.key, value: r.value, description: r.description, updatedAt: r.updated_at }))
}

export async function updateConfig(config: AdminApiConfig, key: string, value: Record<string, unknown>, actor: string): Promise<ConfigEntry | undefined> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('app_config')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select('key, value, description, updated_at')
    .maybeSingle()
  if (error) throw new Error(`updateConfig failed: ${error.message}`)
  if (!data) return undefined

  await recordAuditEntry(config, { actor, action: 'config.updated', resourceType: 'app_config', resourceId: key, metadata: { value } })

  const row = data as ConfigRow
  return { key: row.key, value: row.value, description: row.description, updatedAt: row.updated_at }
}
