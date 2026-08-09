import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchAdminOverview, type AdminOverview } from '../lib/api/admin'

export type AdminOverviewStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseAdminOverviewResult {
  overview: AdminOverview | null
  status: AdminOverviewStatus
  error: unknown
  refresh: () => void
}

const POLL_INTERVAL_MS = 60_000

export function useAdminOverview(): UseAdminOverviewResult {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [status, setStatus] = useState<AdminOverviewStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchAdminOverview()
      .then((res) => {
        setOverview(res)
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
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
