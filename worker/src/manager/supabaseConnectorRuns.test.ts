import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { recordConnectorRun } from './supabaseConnectorRuns'
import type { CollectionResult } from './types'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' }

function makeResult(overrides: Partial<CollectionResult> = {}): CollectionResult {
  return {
    connectorId: 'us-federal-reserve',
    status: 'collected',
    startedAt: '2026-08-09T09:00:00.000Z',
    finishedAt: '2026-08-09T09:00:02.000Z',
    durationMs: 2000,
    attempts: 1,
    itemsCollected: 20,
    ...overrides,
  }
}

function makeFakeClient(result: { error: { message: string } | null }) {
  const insert = vi.fn(() => Promise.resolve(result))
  const client = { from: vi.fn(() => ({ insert })) }
  return { client, insert }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('recordConnectorRun', () => {
  it('inserts a real connector_runs row mapping CollectionResult fields honestly', async () => {
    const { client, insert } = makeFakeClient({ error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    await recordConnectorRun(config, makeResult())

    expect(client.from).toHaveBeenCalledWith('connector_runs')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'us-federal-reserve',
        status: 'success',
        items_fetched: 20,
        // Honest, not fabricated: normalize/validate haven't run at collection time.
        items_normalized: 0,
        items_valid: 0,
        items_invalid: 0,
        sample_errors: [],
      }),
    )
  })

  it('maps a failed collection to status="failed" with the real error in sample_errors', async () => {
    const { client, insert } = makeFakeClient({ error: null })
    vi.mocked(createClient).mockReturnValue(client as never)

    await recordConnectorRun(config, makeResult({ status: 'failed', itemsCollected: 0, error: 'HTTP 403' }))

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', sample_errors: ['HTTP 403'] }))
  })

  it('throws a clear, attributable error when the insert fails', async () => {
    const { client } = makeFakeClient({ error: { message: 'insert failed' } })
    vi.mocked(createClient).mockReturnValue(client as never)

    await expect(recordConnectorRun(config, makeResult())).rejects.toThrow(/us-federal-reserve.*insert failed/)
  })
})
