import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError, ApiServerError } from '../lib/api/client'
import { fetchEntityDetail, type EntityDetail } from '../lib/api/entities'

export type EntityDetailStatus = 'loading' | 'ready' | 'error' | 'not-configured' | 'not-found'

export interface UseEntityDetailResult {
  detail: EntityDetail | undefined
  status: EntityDetailStatus
  error: unknown
  refresh: () => void
}

export function useEntityDetail(id: string | undefined): UseEntityDetailResult {
  const [detail, setDetail] = useState<EntityDetail | undefined>(undefined)
  const [status, setStatus] = useState<EntityDetailStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(() => {
    if (!id) return
    setStatus('loading')
    setError(null)
    fetchEntityDetail(id)
      .then((res) => {
        setDetail(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        if (err instanceof ApiNotConfiguredError) setStatus('not-configured')
        else if (err instanceof ApiServerError && err.status === 404) setStatus('not-found')
        else setStatus('error')
      })
  }, [id])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey])

  return { detail, status, error, refresh: () => setRefreshKey((k) => k + 1) }
}
