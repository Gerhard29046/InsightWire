import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import {
  fetchNotifications,
  markAllNotificationsRead as markAllNotificationsReadApi,
  markNotificationRead as markNotificationReadApi,
  type NotificationRecord,
} from '../lib/api/workspace'

export type NotificationsStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseNotificationsResult {
  notifications: NotificationRecord[]
  status: NotificationsStatus
  error: unknown
  refresh: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<number>
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [status, setStatus] = useState<NotificationsStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    fetchNotifications()
      .then((res) => {
        if (requestId !== requestIdRef.current) return
        setNotifications(res)
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
    notifications,
    status,
    error,
    refresh: load,
    markRead: (id) => markNotificationReadApi(id).then(() => load()),
    markAllRead: () =>
      markAllNotificationsReadApi().then((count) => {
        load()
        return count
      }),
  }
}
