import { useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchHistoricalMoments, type HistoricalMoment } from '../lib/api/historicalMoments'

export type HistoricalMomentsStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseHistoricalMomentsResult {
  moments: HistoricalMoment[]
  status: HistoricalMomentsStatus
}

/** One-shot — curated historical moments don't change on a live-feed cadence; no reason to poll every 60s. */
export function useHistoricalMoments(): UseHistoricalMomentsResult {
  const [moments, setMoments] = useState<HistoricalMoment[]>([])
  const [status, setStatus] = useState<HistoricalMomentsStatus>('loading')

  useEffect(() => {
    let cancelled = false
    fetchHistoricalMoments()
      .then((res) => {
        if (cancelled) return
        setMoments(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { moments, status }
}
