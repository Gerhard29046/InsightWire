import { apiFetch } from './client'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

// ---------------------------------------------------------------------------
// Overview / system health / database
// ---------------------------------------------------------------------------

export interface PipelineStageHealth {
  stage: string
  status: 'healthy' | 'warning' | 'error' | 'not_monitored'
  detail: string
}

export interface AdminOverview {
  database: { connected: boolean; error?: string }
  ingestion: {
    activeSources: number
    totalSources: number
    connectorsRegistered: number
    lastSuccessfulRunAt: string | null
    lastFailedRunAt: string | null
    lastError: string | null
    failedRunsLast24h: number
    eventsIngestedTotal: number
    eventsIngestedLast24h: number
  }
  services: { supabaseConfigured: boolean; geminiConfigured: boolean; anthropicConfigured: boolean }
  pipeline: PipelineStageHealth[]
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>('/admin/overview')
}

export interface DatabaseMetric {
  label: string
  count: number | null
  unavailable?: boolean
}

export function fetchAdminDatabase(): Promise<DatabaseMetric[]> {
  return apiFetch<{ metrics: DatabaseMetric[] }>('/admin/database').then((r) => r.metrics)
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceRecord {
  id: string
  name: string
  description: string
  type: string
  version: string
  refreshIntervalMs: number
  enabled: boolean
  country: string | null
  category: string | null
  language: string
  feedUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  eventCount: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastStatus: 'success' | 'partial' | 'failed' | null
  lastError: string | null
  trustCategory: string
  trustScore: number
}

export function fetchAdminSources(): Promise<SourceRecord[]> {
  return apiFetch<{ sources: SourceRecord[] }>('/admin/sources').then((r) => r.sources)
}

export interface UpdateSourcePatch {
  enabled?: boolean
  country?: string | null
  category?: string | null
  language?: string
  notes?: string | null
}

export function updateAdminSource(id: string, patch: UpdateSourcePatch): Promise<SourceRecord> {
  return apiFetch<SourceRecord>(`/admin/sources/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) })
}

export interface SourceTestResult {
  connectorId: string
  healthy: boolean
  message?: string
  checkedAt: string
}

export function testAdminSource(id: string): Promise<SourceTestResult> {
  return apiFetch<SourceTestResult>(`/admin/sources/${encodeURIComponent(id)}/test`, { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string
  actor: string
  action: string
  resourceType: string
  resourceId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export function fetchAuditLog(): Promise<AuditLogEntry[]> {
  return apiFetch<{ entries: AuditLogEntry[] }>('/admin/audit-log').then((r) => r.entries)
}

// ---------------------------------------------------------------------------
// Site configuration
// ---------------------------------------------------------------------------

export interface ConfigEntry {
  key: string
  value: Record<string, unknown>
  description: string | null
  updatedAt: string
}

export function fetchConfig(): Promise<ConfigEntry[]> {
  return apiFetch<{ entries: ConfigEntry[] }>('/admin/config').then((r) => r.entries)
}

export function updateConfigEntry(key: string, value: Record<string, unknown>): Promise<ConfigEntry> {
  return apiFetch<ConfigEntry>(`/admin/config/${encodeURIComponent(key)}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ value }) })
}

// ---------------------------------------------------------------------------
// Profiles (future users)
// ---------------------------------------------------------------------------

export interface ProfileRecord {
  id: string
  displayName: string | null
  avatarUrl: string | null
  role: 'administrator' | 'editor' | 'journalist' | 'viewer'
  status: 'active' | 'suspended' | 'invited'
  createdAt: string
  updatedAt: string
}

export function fetchAdminProfiles(): Promise<ProfileRecord[]> {
  return apiFetch<{ profiles: ProfileRecord[] }>('/admin/profiles').then((r) => r.profiles)
}

// ---------------------------------------------------------------------------
// Content moderation
// ---------------------------------------------------------------------------

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

export function fetchAdminReports(status?: ReportStatus): Promise<ContentReport[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiFetch<{ reports: ContentReport[] }>(`/admin/reports${qs}`).then((r) => r.reports)
}

export interface CreateReportInput {
  category: ReportCategory
  targetType: ContentReport['targetType']
  targetId?: string
  description: string
  reporterContact?: string
}

/** The public submission path — anyone can file a report, no admin access required. */
export function submitReport(input: CreateReportInput): Promise<ContentReport> {
  return apiFetch<ContentReport>('/reports', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) })
}

export function updateAdminReport(id: string, status: ReportStatus, resolutionNotes?: string): Promise<ContentReport> {
  return apiFetch<ContentReport>(`/admin/reports/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status, resolutionNotes }),
  })
}

// ---------------------------------------------------------------------------
// Legal documents
// ---------------------------------------------------------------------------

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

export function fetchLegalDocuments(): Promise<LegalDocument[]> {
  return apiFetch<{ documents: LegalDocument[] }>('/legal/documents').then((r) => r.documents)
}

export function fetchLegalDocument(slug: string): Promise<LegalDocument> {
  return apiFetch<LegalDocument>(`/legal/documents/${encodeURIComponent(slug)}`)
}

export function fetchLegalDocumentHistory(slug: string): Promise<LegalDocument[]> {
  return apiFetch<{ versions: LegalDocument[] }>(`/admin/legal/documents/${encodeURIComponent(slug)}/history`).then((r) => r.versions)
}

export interface CreateLegalDocumentInput {
  slug: string
  title: string
  version: string
  effectiveDate: string
  summary?: string
  content: string
  category?: LegalDocumentCategory
}

/** Supersedes the current active version for `slug` (if any) and inserts the new one — see legalApi.ts's createDocumentVersion. */
export function createLegalDocumentVersion(input: CreateLegalDocumentInput): Promise<LegalDocument> {
  return apiFetch<LegalDocument>('/admin/legal/documents', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) })
}
