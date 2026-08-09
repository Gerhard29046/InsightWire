import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createDocumentVersion, getActiveDocument, listActiveDocuments } from './legalApi'

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

function makeDocRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'd-1',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    version: '1.0',
    effective_date: '2026-08-09',
    status: 'active',
    category: 'core',
    summary: 'How we handle information.',
    content: '## What we collect\n...',
    created_at: '2026-08-09T00:00:00.000Z',
    ...overrides,
  }
}

describe('listActiveDocuments / getActiveDocument', () => {
  it('returns only active documents', async () => {
    const { client, chains } = makeFakeClient({ legal_documents: [{ data: [makeDocRow()], error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const docs = await listActiveDocuments(config)
    expect(docs).toHaveLength(1)
    expect(chains.legal_documents[0].eq).toHaveBeenCalledWith('status', 'active')
  })

  it('returns undefined when no active document exists for a slug', async () => {
    const { client } = makeFakeClient({ legal_documents: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const doc = await getActiveDocument(config, 'missing-policy')
    expect(doc).toBeUndefined()
  })
})

describe('createDocumentVersion', () => {
  it('supersedes the prior active version rather than deleting it, then inserts the new one', async () => {
    const { client, chains } = makeFakeClient({
      legal_documents: [{ data: null, error: null }, { data: makeDocRow({ version: '1.1' }), error: null }],
      admin_audit_log: [{ data: null, error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const doc = await createDocumentVersion(
      config,
      { slug: 'privacy-policy', title: 'Privacy Policy', version: '1.1', effectiveDate: '2026-09-01', content: '## Updated' },
      'WORKSPACE_USER_ID',
    )

    expect(chains.legal_documents[0].update).toHaveBeenCalledWith({ status: 'superseded' })
    expect(chains.legal_documents[1].insert).toHaveBeenCalledWith(expect.objectContaining({ slug: 'privacy-policy', status: 'active' }))
    expect(doc.version).toBe('1.1')
    expect(chains.admin_audit_log[0].insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'legal_document.published' }))
  })

  it('saves as a draft without superseding anything when activateImmediately is false', async () => {
    const { client, chains } = makeFakeClient({
      legal_documents: [{ data: makeDocRow({ status: 'draft' }), error: null }],
      admin_audit_log: [{ data: null, error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    await createDocumentVersion(
      config,
      { slug: 'privacy-policy', title: 'Privacy Policy', version: '2.0-draft', effectiveDate: '2026-09-01', content: '## Draft', activateImmediately: false },
      'WORKSPACE_USER_ID',
    )

    expect(chains.legal_documents[0].insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }))
    expect(chains.legal_documents[0].update).not.toHaveBeenCalled()
  })
})
