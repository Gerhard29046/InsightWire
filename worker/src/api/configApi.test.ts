import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { listConfig, updateConfig } from './configApi'

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

describe('listConfig', () => {
  it('returns the real seeded config rows', async () => {
    const { client } = makeFakeClient({
      app_config: [{ data: [{ key: 'appearance', value: { defaultTheme: 'system' }, description: null, updated_at: '2026-08-09T00:00:00.000Z' }], error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const entries = await listConfig(config)
    expect(entries).toEqual([{ key: 'appearance', value: { defaultTheme: 'system' }, description: null, updatedAt: '2026-08-09T00:00:00.000Z' }])
  })
})

describe('updateConfig', () => {
  it('writes the new value and records a real audit entry', async () => {
    const { client, chains } = makeFakeClient({
      app_config: [{ data: { key: 'navigation', value: { visibleItems: ['dashboard'] }, description: null, updated_at: '2026-08-09T00:00:00.000Z' }, error: null }],
      admin_audit_log: [{ data: null, error: null }],
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const entry = await updateConfig(config, 'navigation', { visibleItems: ['dashboard'] }, 'WORKSPACE_USER_ID')
    expect(entry?.value).toEqual({ visibleItems: ['dashboard'] })
    expect(chains.admin_audit_log[0].insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'config.updated', resource_id: 'navigation' }))
  })

  it('returns undefined for an unknown config key', async () => {
    const { client } = makeFakeClient({ app_config: [{ data: null, error: null }] })
    vi.mocked(createClient).mockReturnValue(client as never)

    const result = await updateConfig(config, 'does-not-exist', {}, 'WORKSPACE_USER_ID')
    expect(result).toBeUndefined()
  })
})
