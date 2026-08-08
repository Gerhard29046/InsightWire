import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getGeoReadiness } from './mapApi'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

interface QueryResult {
  data: unknown
  error: { message: string } | null
  count?: number | null
}

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    is: vi.fn(() => chain),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

function makeSequencedClient(results: QueryResult[]) {
  const chains = results.map(makeChain)
  let callIndex = 0
  const client = { from: vi.fn(() => chains[callIndex++]) }
  return { client, chains }
}

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getGeoReadiness', () => {
  it('returns exact counts of events with vs. without coordinates', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: null, count: 823 },
      { data: null, error: null, count: 4102 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    const readiness = await getGeoReadiness(config)
    expect(readiness.withCoordinates).toBe(823)
    expect(readiness.withoutCoordinates).toBe(4102)
  })

  it('queries with .not(lat, is, null) for the with-coordinates count and .is(lat, null) for the other', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getGeoReadiness(config)
    expect(chains[0].not).toHaveBeenCalledWith('lat', 'is', null)
    expect(chains[1].is).toHaveBeenCalledWith('lat', null)
  })

  it('excludes scheduled events from both counts, same as every other real-time query', async () => {
    const { client, chains } = makeSequencedClient([
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await getGeoReadiness(config)
    for (const chain of chains) {
      expect(chain.neq).toHaveBeenCalledWith('status', 'scheduled')
    }
  })

  it('throws rather than silently returning a partial result when a query errors', async () => {
    const { client } = makeSequencedClient([
      { data: null, error: { message: 'connection reset' }, count: null },
      { data: null, error: null, count: 0 },
    ])
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(getGeoReadiness(config)).rejects.toThrow(/connection reset/)
  })
})
