import type { RetryPolicy } from './types'

const realDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface WithRetryOptions {
  policy: RetryPolicy
  onAttemptFailed?: (attempt: number, error: unknown) => void
  /** Injectable so tests don't have to wait out real backoff delays. */
  delay?: (ms: number) => Promise<void>
}

/**
 * Retries an async function with exponential backoff. Intended for the
 * network fetch step specifically — retrying a pure function (normalize/
 * validate) can't fix anything, so callers should only wrap I/O here.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> {
  const { policy, onAttemptFailed, delay = realDelay } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      onAttemptFailed?.(attempt, err)
      if (attempt < policy.maxAttempts) {
        await delay(policy.baseDelayMs * 2 ** (attempt - 1))
      }
    }
  }

  throw lastError
}
