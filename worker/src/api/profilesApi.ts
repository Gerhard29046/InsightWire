import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AdminApiConfig } from './adminApi'

function client({ url, serviceRoleKey }: AdminApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type UserRole = 'administrator' | 'editor' | 'journalist' | 'viewer'
export type UserStatus = 'active' | 'suspended' | 'invited'

export interface ProfileRecord {
  id: string
  displayName: string | null
  avatarUrl: string | null
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
}

interface ProfileRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
}

/**
 * The `profiles` table is genuinely empty today (see the migration's own
 * doc comment) — no Supabase Auth flow exists to ever create a row here.
 * This always returns a real (possibly empty) query result; the frontend
 * renders "No registered users yet" for an empty array, never a fabricated
 * account. Note this deliberately does NOT read `auth.users` directly: the
 * one row there (WORKSPACE_USER_ID, see docs/decisions/0015) is a synthetic
 * single-tenant scoping id, not a real registered person, and must never be
 * presented to an admin as if it were a real user.
 */
export async function listProfiles(config: AdminApiConfig): Promise<ProfileRecord[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(`listProfiles failed: ${error.message}`)
  return ((data ?? []) as ProfileRow[]).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}
