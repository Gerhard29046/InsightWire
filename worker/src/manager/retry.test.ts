import { describe, expect, it, vi } from 'vitest'
import { withRetry } from './retry'

describe('withRetry', () => {
  it('returns the result on the first successful attempt without delaying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const delay = vi.fn().mockResolvedValue(undefined)
    const result = await withRetry(fn, { policy: { maxAttempts: 3, baseDelayMs: 100 }, delay })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(delay).not.toHaveBeenCalled()
  })

  it('retries with exponential backoff and eventually succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw new Error(`fail ${calls}`)
      return 'ok'
    })
    const delays: number[] = []
    const result = await withRetry(fn, {
      policy: { maxAttempts: 3, baseDelayMs: 100 },
      delay: async (ms) => {
        delays.push(ms)
      },
    })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([100, 200])
  })

  it('throws the last error after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(
      withRetry(fn, { policy: { maxAttempts: 3, baseDelayMs: 10 }, delay: vi.fn().mockResolvedValue(undefined) }),
    ).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('calls onAttemptFailed once per failed attempt, with no trailing delay after the last', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'))
    const onAttemptFailed = vi.fn()
    const delay = vi.fn().mockResolvedValue(undefined)
    await expect(
      withRetry(fn, { policy: { maxAttempts: 2, baseDelayMs: 1 }, delay, onAttemptFailed }),
    ).rejects.toThrow()
    expect(onAttemptFailed).toHaveBeenCalledTimes(2)
    expect(onAttemptFailed).toHaveBeenNthCalledWith(1, 1, expect.any(Error))
    expect(onAttemptFailed).toHaveBeenNthCalledWith(2, 2, expect.any(Error))
    expect(delay).toHaveBeenCalledTimes(1)
  })
})
