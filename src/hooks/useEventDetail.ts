import { useCallback, useEffect, useState } from 'react'
import { fetchEventDetail, type EventDetail } from '../lib/api/events'

export type EventDetailStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseEventDetailResult {
  detail: EventDetail | undefined
  status: EventDetailStatus
  error: unknown
  refresh: () => void
}

export function useEventDetail(id: string | undefined): UseEventDetailResult {
  const [detail, setDetail] = useState<EventDetail | undefined>(undefined)
  const [status, setStatus] = useState<EventDetailStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(() => {
    if (!id) return
    setStatus('loading')
    setError(null)
    fetchEventDetail(id)
      .then((res) => {
        setDetail(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus('error')
      })
  }, [id])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey])

  return { detail, status, error, refresh: () => setRefreshKey((k) => k + 1) }
}
