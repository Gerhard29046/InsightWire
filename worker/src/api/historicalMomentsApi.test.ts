import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getHistoricalMomentDetail, listHistoricalMoments } from './historicalMomentsApi'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

function momentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm1',
    title: 'COVID-19 pandemic',
    summary: 'A real, curated summary.',
    start_date: '2020-01-01',
    end_date: '2023-05-05',
    significance: 'major',
    category: 'science',
    region: 'Global',
    countries: [],
    source_urls: ['https://who.int/x'],
    created_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listHistoricalMoments', () => {
  it('returns a real empty array (not fabricated content) when the table has no curated rows yet', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const client = { from: vi.fn(() => chain) }
    vi.mocked(createClient).mockReturnValue(client as never)

    const moments = await listHistoricalMoments(config)
    expect(moments).toEqual([])
  })

  it('maps real rows from snake_case to camelCase, oldest first', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [momentRow()], error: null }),
    }
    const client = { from: vi.fn(() => chain) }
    vi.mocked(createClient).mockReturnValue(client as never)

    const moments = await listHistoricalMoments(config)
    expect(chain.order).toHaveBeenCalledWith('start_date', { ascending: true })
    expect(moments).toEqual([
      {
        id: 'm1',
        title: 'COVID-19 pandemic',
        summary: 'A real, curated summary.',
        startDate: '2020-01-01',
        endDate: '2023-05-05',
        significance: 'major',
        category: 'science',
        region: 'Global',
        countries: [],
        sourceUrls: ['https://who.int/x'],
        createdAt: '2026-08-08T00:00:00.000Z',
      },
    ])
  })

  it('throws rather than silently swallowing a query error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection reset' } }),
    }
    const client = { from: vi.fn(() => chain) }
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(listHistoricalMoments(config)).rejects.toThrow(/connection reset/)
  })
})

describe('getHistoricalMomentDetail', () => {
  it('returns undefined (not a fabricated placeholder) when no real row matches', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const client = { from: vi.fn(() => chain) }
    vi.mocked(createClient).mockReturnValue(client as never)

    const moment = await getHistoricalMomentDetail(config, 'missing')
    expect(moment).toBeUndefined()
  })

  it('maps a real matching row', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: momentRow(), error: null }),
    }
    const client = { from: vi.fn(() => chain) }
    vi.mocked(createClient).mockReturnValue(client as never)

    const moment = await getHistoricalMomentDetail(config, 'm1')
    expect(moment?.id).toBe('m1')
    expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
  })
})
