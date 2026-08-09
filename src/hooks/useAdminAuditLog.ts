import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchAuditLog, type AuditLogEntry } from '../lib/api/admin'

export type AdminAuditLogStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseAdminAuditLogResult {
  entries: AuditLogEntry[]
  status: AdminAuditLogStatus
  error: unknown
  refresh: () => void
}

export function useAdminAuditLog(): UseAdminAuditLogResult {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [status, setStatus] = useState<AdminAuditLogStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchAuditLog()
      .then((res) => {
        setEntries(res)
        setError(null)
        setStatus(res.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { entries, status, error, refresh: load }
}
