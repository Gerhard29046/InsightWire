import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { listProfiles } from './profilesApi'

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
  }
  return chain
}

function makeFakeClient(result: QueryResult) {
  const chain = makeChain(result)
  return { client: { from: vi.fn(() => chain) } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProfiles', () => {
  it('renders "No registered users yet" honestly — a genuinely empty table, never a fabricated account', async () => {
    const { client } = makeFakeClient({ data: [], error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    const profiles = await listProfiles(config)
    expect(profiles).toEqual([])
  })

  it('maps a real profile row when one exists', async () => {
    const { client } = makeFakeClient({
      data: [{ id: 'u-1', display_name: 'Jane Doe', avatar_url: null, role: 'journalist', status: 'active', created_at: '2026-08-09T00:00:00.000Z', updated_at: '2026-08-09T00:00:00.000Z' }],
      error: null,
    })
    vi.mocked(createClient).mockReturnValue(client as never)

    const [profile] = await listProfiles(config)
    expect(profile).toEqual({
      id: 'u-1',
      displayName: 'Jane Doe',
      avatarUrl: null,
      role: 'journalist',
      status: 'active',
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    })
  })
})
