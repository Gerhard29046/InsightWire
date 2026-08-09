import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchMapSummary, type MapSummary } from '../lib/api/map'

export type MapSummaryStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseMapSummaryResult {
  summary: MapSummary | null
  status: MapSummaryStatus
  refresh: () => void
}

/** One-shot, not polled — aggregate geography (which countries are reporting) doesn't need the Feed/Dashboard's 60s cadence. */
export function useMapSummary(): UseMapSummaryResult {
  const [summary, setSummary] = useState<MapSummary | null>(null)
  const [status, setStatus] = useState<MapSummaryStatus>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    fetchMapSummary()
      .then((res) => {
        setSummary(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { summary, status, refresh: load }
}
