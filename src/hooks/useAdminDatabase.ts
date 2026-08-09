import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchAdminDatabase, type DatabaseMetric } from '../lib/api/admin'

export type AdminDatabaseStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseAdminDatabaseResult {
  metrics: DatabaseMetric[]
  status: AdminDatabaseStatus
  error: unknown
  refresh: () => void
}

export function useAdminDatabase(): UseAdminDatabaseResult {
  const [metrics, setMetrics] = useState<DatabaseMetric[]>([])
  const [status, setStatus] = useState<AdminDatabaseStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchAdminDatabase()
      .then((res) => {
        setMetrics(res)
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

  return { metrics, status, error, refresh: load }
}
