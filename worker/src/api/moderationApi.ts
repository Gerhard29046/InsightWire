import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { recordAuditEntry, type AdminApiConfig } from './adminApi'

function client({ url, serviceRoleKey }: AdminApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type ReportCategory =
  | 'inaccurate_information'
  | 'privacy_violation'
  | 'personal_information'
  | 'copyright_complaint'
  | 'unlawful_content'
  | 'harmful_content'
  | 'source_correction'
  | 'impersonation'
  | 'other'

export type ReportStatus = 'open' | 'in_review' | 'actioned' | 'dismissed'

export interface ContentReport {
  id: string
  category: ReportCategory
  targetType: 'event' | 'entity' | 'source' | 'other'
  targetId: string | null
  description: string
  reporterContact: string | null
  status: ReportStatus
  resolutionNotes: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ContentReportRow {
  id: string
  category: ReportCategory
  target_type: ContentReport['targetType']
  target_id: string | null
  description: string
  reporter_contact: string | null
  status: ReportStatus
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

function fromRow(row: ContentReportRow): ContentReport {
  return {
    id: row.id,
    category: row.category,
    targetType: row.target_type,
    targetId: row.target_id,
    description: row.description,
    reporterContact: row.reporter_contact,
    status: row.status,
    resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Report -> Review -> Restrict/Remove/Correct/Restore workflow (see the migration's own doc comment). Real rows only — an empty result means "No active reports," never a fabricated complaint. */
export async function listReports(config: AdminApiConfig, opts: { status?: ReportStatus } = {}): Promise<ContentReport[]> {
  const supabase = client(config)
  let q = supabase.from('content_reports').select('*').order('created_at', { ascending: false })
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new Error(`listReports failed: ${error.message}`)
  return ((data ?? []) as ContentReportRow[]).map(fromRow)
}

export interface CreateReportInput {
  category: ReportCategory
  targetType: ContentReport['targetType']
  targetId?: string
  description: string
  reporterContact?: string
}

/** The public submission path — anyone can file a report, no auth required (matches this app's current no-auth posture; server-side, not client-trusted). */
export async function createReport(config: AdminApiConfig, input: CreateReportInput): Promise<ContentReport> {
  const supabase = client(config)
  const { data, error } = await supabase
    .from('content_reports')
    .insert({
      category: input.category,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      description: input.description,
      reporter_contact: input.reporterContact ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createReport failed: ${error.message}`)
  return fromRow(data as ContentReportRow)
}

export interface UpdateReportInput {
  status: ReportStatus
  resolutionNotes?: string
}

export async function updateReport(config: AdminApiConfig, id: string, input: UpdateReportInput, actor: string): Promise<ContentReport | undefined> {
  const supabase = client(config)
  const resolved = input.status === 'actioned' || input.status === 'dismissed'
  const { data, error } = await supabase
    .from('content_reports')
    .update({
      status: input.status,
      resolution_notes: input.resolutionNotes ?? null,
      resolved_at: resolved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`updateReport failed: ${error.message}`)
  if (!data) return undefined

  await recordAuditEntry(config, {
    actor,
    action: `content_report.${input.status}`,
    resourceType: 'content_report',
    resourceId: id,
    metadata: { status: input.status },
  })

  return fromRow(data as ContentReportRow)
}
