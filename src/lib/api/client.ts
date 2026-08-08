const REQUEST_TIMEOUT_MS = 10_000

export class ApiNotConfiguredError extends Error {
  constructor() {
    super('VITE_API_BASE_URL is not configured')
    this.name = 'ApiNotConfiguredError'
  }
}

export class ApiOfflineError extends Error {
  constructor() {
    super('Network is offline')
    this.name = 'ApiOfflineError'
  }
}

export class ApiTimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'ApiTimeoutError'
  }
}

export class ApiAuthError extends Error {
  status: number
  constructor(status: number) {
    super(`Authentication failed (${status})`)
    this.name = 'ApiAuthError'
    this.status = status
  }
}

export class ApiServerError extends Error {
  status: number
  constructor(status: number) {
    super(`Backend request failed (${status})`)
    this.name = 'ApiServerError'
    this.status = status
  }
}

/**
 * `timeoutMs` is per-call, not a single global constant: most endpoints hit
 * Postgres via PostgREST (milliseconds) and should fail fast if genuinely
 * broken, but AI generation calls (POST /events/:id/brief) hit a real LLM
 * with "thinking" enabled — measured live at ~12s for a real event, well
 * past the original hardcoded 10s default, which is exactly what produced
 * a false "Request timed out" for a request that had actually succeeded
 * server-side. See docs/decisions/0012-brief-timeout-fix.md.
 */
export async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  if (!baseUrl) {
    throw new ApiNotConfiguredError()
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiOfflineError()
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init?.headers },
    })

    if (res.status === 401 || res.status === 403) {
      throw new ApiAuthError(res.status)
    }
    if (!res.ok) {
      throw new ApiServerError(res.status)
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof ApiServerError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw new ApiTimeoutError()
    throw new ApiOfflineError()
  } finally {
    clearTimeout(timeoutId)
  }
}
