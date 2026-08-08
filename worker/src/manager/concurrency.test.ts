import { describe, expect, it } from 'vitest'
import { runWithConcurrency } from './concurrency'

describe('runWithConcurrency', () => {
  it('resolves all items in input order', async () => {
    const results = await runWithConcurrency([1, 2, 3], 2, async (n) => n * 2)
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([2, 4, 6])
  })

  it('isolates a rejection to its own item', async () => {
    const results = await runWithConcurrency([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(results[1].status).toBe('rejected')
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 })
  })

  it('never runs more than `limit` items concurrently', async () => {
    let active = 0
    let maxActive = 0
    await runWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      },
    )
    expect(maxActive).toBeLessThanOrEqual(3)
  })
})
