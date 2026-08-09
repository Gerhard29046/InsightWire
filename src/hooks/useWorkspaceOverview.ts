import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchWorkspaceOverview, type WorkspaceOverview } from '../lib/api/workspace'

export type WorkspaceOverviewStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseWorkspaceOverviewResult {
  overview: WorkspaceOverview | null
  status: WorkspaceOverviewStatus
  error: unknown
  refresh: () => void
}

/** Matches the Global Events Feed/Dashboard's own polling cadence (see useEventsFeed.ts) — the overview re-refreshes every active watchlist on each load (see workspaceApi.ts's getWorkspaceOverview), so this is also what keeps "new matches" genuinely current without a background job. */
const POLL_INTERVAL_MS = 60_000

export function useWorkspaceOverview(): UseWorkspaceOverviewResult {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null)
  const [status, setStatus] = useState<WorkspaceOverviewStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    fetchWorkspaceOverview()
      .then((res) => {
        if (requestId !== requestIdRef.current) return
        setOverview(res)
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  return { overview, status, error, refresh: load }
}
