import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchAdminReports, updateAdminReport, type ContentReport, type ReportStatus } from '../lib/api/admin'

export type AdminReportsStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseAdminReportsResult {
  reports: ContentReport[]
  status: AdminReportsStatus
  error: unknown
  refresh: () => void
  updateReport: (id: string, status: ReportStatus, resolutionNotes?: string) => Promise<ContentReport>
}

export function useAdminReports(statusFilter?: ReportStatus): UseAdminReportsResult {
  const [reports, setReports] = useState<ContentReport[]>([])
  const [status, setStatus] = useState<AdminReportsStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchAdminReports(statusFilter)
      .then((res) => {
        setReports(res)
        setError(null)
        setStatus(res.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  return {
    reports,
    status,
    error,
    refresh: load,
    updateReport: (id, newStatus, resolutionNotes) =>
      updateAdminReport(id, newStatus, resolutionNotes).then((r) => {
        load()
        return r
      }),
  }
}
