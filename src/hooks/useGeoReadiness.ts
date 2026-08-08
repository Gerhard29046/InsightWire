import { useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchGeoReadiness, type GeoReadiness } from '../lib/api/map'

export type GeoReadinessStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseGeoReadinessResult {
  readiness: GeoReadiness | null
  status: GeoReadinessStatus
}

/** One-shot, not polled — map readiness (how much of the real dataset has coordinates) changes slowly; no reason to re-fetch every 60s like the live Feed/Dashboard do. */
export function useGeoReadiness(): UseGeoReadinessResult {
  const [readiness, setReadiness] = useState<GeoReadiness | null>(null)
  const [status, setStatus] = useState<GeoReadinessStatus>('loading')

  useEffect(() => {
    let cancelled = false
    fetchGeoReadiness()
      .then((res) => {
        if (cancelled) return
        setReadiness(res)
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

  return { readiness, status }
}
