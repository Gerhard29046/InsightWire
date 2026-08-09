import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import {
  fetchAlerts,
  markAlertRead as markAlertReadApi,
  markAllAlertsRead as markAllAlertsReadApi,
  type AlertRecord,
} from '../lib/api/workspace'

export type AlertsStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseAlertsResult {
  alerts: AlertRecord[]
  status: AlertsStatus
  error: unknown
  refresh: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<number>
}

/** Backs the "Breaking"/"Saved Search" sections of the Notification Center — real materialized `alerts` rows, tagged breaking server-side (see workspaceApi.ts's listAlerts). */
export function useAlerts(): UseAlertsResult {
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [status, setStatus] = useState<AlertsStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    fetchAlerts()
      .then((res) => {
        if (requestId !== requestIdRef.current) return
        setAlerts(res)
        setError(null)
        setStatus(res.length === 0 ? 'empty' : 'ready')
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

  return {
    alerts,
    status,
    error,
    refresh: load,
    markRead: (id) => markAlertReadApi(id).then(() => load()),
    markAllRead: () =>
      markAllAlertsReadApi().then((count) => {
        load()
        return count
      }),
  }
}
