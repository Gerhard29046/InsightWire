import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchAdminSources, testAdminSource, updateAdminSource, type SourceRecord, type SourceTestResult, type UpdateSourcePatch } from '../lib/api/admin'

export type AdminSourcesStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseAdminSourcesResult {
  sources: SourceRecord[]
  status: AdminSourcesStatus
  error: unknown
  refresh: () => void
  updateSource: (id: string, patch: UpdateSourcePatch) => Promise<SourceRecord>
  testSource: (id: string) => Promise<SourceTestResult>
}

export function useAdminSources(): UseAdminSourcesResult {
  const [sources, setSources] = useState<SourceRecord[]>([])
  const [status, setStatus] = useState<AdminSourcesStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchAdminSources()
      .then((res) => {
        setSources(res)
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

  return {
    sources,
    status,
    error,
    refresh: load,
    updateSource: (id, patch) =>
      updateAdminSource(id, patch).then((r) => {
        load()
        return r
      }),
    testSource: (id) => testAdminSource(id),
  }
}
