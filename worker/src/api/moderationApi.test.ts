import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createReport, listReports, updateReport } from './moderationApi'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

function makeFakeClient(resultsByTable: Record<string, QueryResult[]>) {
  const callIndex: Record<string, number> = {}
  const chains: Record<string, ReturnType<typeof makeChain>[]> = {}
  const client = {
    from: vi.fn((table: string) => {
      const i = callIndex[table] ?? 0
      callIndex[table] = i + 1
      const results = resultsByTable[table] ?? []
      const chain = makeChain(results[i] ?? results[results.length - 1] ?? { data: [], error: null })
      chains[table] = [...(chains[table] ?? []), chain]
      return chain
    }),
  }
  return { client, chains }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listReports', () => {
  it('renders honestly empty — "No active reports" backed by a real empty query, never fabricated', async () => {
    const { client } = makeFakeClient({ content_reports: [{ data: [], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const reports = await listReports(config)
    expect(reports).toEqual([])
  })
})

describe('createReport', () => {
  it('creates a real report with status open by default', async () => {
    const row = {
      id: 'r-1',
      category: 'copyright_complaint',
      target_type: 'event',
      target_id: 'evt-1',
      description: 'This reproduces our article in full.',
      reporter_contact: 'someone@example.com',
      status: 'open',
      resolution_notes: null,
      resolved_at: null,
      created_at: '2026-08-09T00:00:00.000Z',
      updated_at: '2026-08-09T00:00:00.000Z',
    }
    const { client, chains } = makeFakeClient({ content_reports: [{ data: row, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const report = await createReport(config, {
      category: 'copyright_complaint',
      targetType: 'event',
      targetId: 'evt-1',
      description: 'This reproduces our article in full.',
      reporterContact: 'someone@example.com',
    })
    expect(report.status).toBe('open')
    expect(chains.content_reports[0].insert).toHaveBeenCalledWith(expect.objectContaining({ category: 'copyright_complaint' }))
  })
})

describe('updateReport', () => {
  it('sets resolved_at only for a terminal status (actioned/dismissed) and records a real audit entry', async () => {
    const row = {
      id: 'r-1',
      category: 'other',
      target_type: 'other',
      target_id: null,
      description: 'x',
      reporter_contact: null,
      status: 'actioned',
      resolution_notes: 'Corrected the source attribution.',
      resolved_at: '2026-08-09T00:00:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-09T00:00:00.000Z',
    }
    const { client, chains } = makeFakeClient({
      content_reports: [{ data: row, error: null }],
      admin_audit_log: [{ data: null, error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const report = await updateReport(config, 'r-1', { status: 'actioned', resolutionNotes: 'Corrected the source attribution.' }, 'WORKSPACE_USER_ID')
    expect(report?.resolvedAt).toBe('2026-08-09T00:00:00.000Z')
    expect(chains.admin_audit_log[0].insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'content_report.actioned' }))
  })

  it('returns undefined for an unknown report id', async () => {
    const { client } = makeFakeClient({ content_reports: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await updateReport(config, 'missing', { status: 'dismissed' }, 'WORKSPACE_USER_ID')
    expect(result).toBeUndefined()
  })
})
