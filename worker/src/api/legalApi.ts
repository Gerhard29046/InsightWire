import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { recordAuditEntry, type AdminApiConfig } from './adminApi'

function client({ url, serviceRoleKey }: AdminApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type LegalDocumentCategory = 'core' | 'content' | 'platform'

export interface LegalDocument {
  id: string
  slug: string
  title: string
  version: string
  effectiveDate: string
  status: 'draft' | 'active' | 'superseded'
  category: LegalDocumentCategory
  summary: string | null
  content: string
  createdAt: string
}

interface LegalDocumentRow {
  id: string
  slug: string
  title: string
  version: string
  effective_date: string
  status: 'draft' | 'active' | 'superseded'
  category: LegalDocumentCategory
  summary: string | null
  content: string
  created_at: string
}

function fromRow(row: LegalDocumentRow): LegalDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    version: row.version,
    effectiveDate: row.effective_date,
    status: row.status,
    category: row.category,
    summary: row.summary,
    content: row.content,
    createdAt: row.created_at,
  }
}

/** The active version of every real legal document — what the public footer/index links to. Real, versioned rows only (see the migration's own doc comment); an empty result means no documents have been published yet, never a fabricated list. */
export async function listActiveDocuments(config: AdminApiConfig): Promise<LegalDocument[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('legal_documents').select('*').eq('status', 'active').order('title')
  if (error) throw new Error(`listActiveDocuments failed: ${error.message}`)
  return ((data ?? []) as LegalDocumentRow[]).map(fromRow)
}

export async function getActiveDocument(config: AdminApiConfig, slug: string): Promise<LegalDocument | undefined> {
  const supabase = client(config)
  const { data, error } = await supabase.from('legal_documents').select('*').eq('slug', slug).eq('status', 'active').maybeSingle()
  if (error) throw new Error(`getActiveDocument failed: ${error.message}`)
  return data ? fromRow(data as LegalDocumentRow) : undefined
}

/** Every version of a document, most recent first — the version-history/audit view an admin sees; a public reader only ever sees `getActiveDocument`. */
export async function getDocumentHistory(config: AdminApiConfig, slug: string): Promise<LegalDocument[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('legal_documents').select('*').eq('slug', slug).order('created_at', { ascending: false })
  if (error) throw new Error(`getDocumentHistory failed: ${error.message}`)
  return ((data ?? []) as LegalDocumentRow[]).map(fromRow)
}

export interface CreateDocumentVersionInput {
  slug: string
  title: string
  version: string
  effectiveDate: string
  summary?: string
  content: string
  /** Which section the Legal & Compliance library groups this document under. Defaults to 'platform' when omitted (matches the DB column default) — the admin publish form always sends this explicitly. */
  category?: LegalDocumentCategory
  /** Defaults to true — the new version immediately supersedes the current active one. Set false to save as a draft for review first. */
  activateImmediately?: boolean
}

/**
 * Creates a new version and, unless `activateImmediately` is false, marks
 * any other `active` row for the same slug as `superseded` — the prior
 * version's content is never deleted, only its status changes, so it
 * remains available for future consent/acknowledgement history once real
 * authentication exists (see the migration's own doc comment).
 */
export async function createDocumentVersion(config: AdminApiConfig, input: CreateDocumentVersionInput, actor: string): Promise<LegalDocument> {
  const supabase = client(config)
  const activate = input.activateImmediately ?? true

  if (activate) {
    const { error: supersedeError } = await supabase
      .from('legal_documents')
      .update({ status: 'superseded' })
      .eq('slug', input.slug)
      .eq('status', 'active')
    if (supersedeError) throw new Error(`createDocumentVersion(supersede) failed: ${supersedeError.message}`)
  }

  const { data, error } = await supabase
    .from('legal_documents')
    .insert({
      slug: input.slug,
      title: input.title,
      version: input.version,
      effective_date: input.effectiveDate,
      status: activate ? 'active' : 'draft',
      category: input.category ?? 'platform',
      summary: input.summary ?? null,
      content: input.content,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createDocumentVersion failed: ${error.message}`)

  await recordAuditEntry(config, {
    actor,
    action: 'legal_document.published',
    resourceType: 'legal_document',
    resourceId: input.slug,
    metadata: { version: input.version, status: activate ? 'active' : 'draft' },
  })

  return fromRow(data as LegalDocumentRow)
}
