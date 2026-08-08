import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchDashboardSummary, type DashboardSummary } from '../lib/api/dashboard'
import type { RegionLabel } from '@insightwire/shared'

export type DashboardStatus = 'loading' | 'ready' | 'error' | 'not-configured'

export interface UseDashboardSummaryResult {
  summary: DashboardSummary | null
  status: DashboardStatus
  error: unknown
  /** Real local time of the last successful fetch — never a fabricated/optimistic timestamp; null until the first real response lands. */
  lastUpdatedAt: Date | null
  refresh: () => void
}

/**
 * Matches the Global Events Feed's own polling cadence (see useEventsFeed.ts)
 * — the Dashboard is a live-intelligence overview of the same real data,
 * not a Calendar-style hourly snapshot (see useCalendarEvents.ts for that
 * distinction and why it exists).
 */
const POLL_INTERVAL_MS = 60_000

export function useDashboardSummary(regions: RegionLabel[] = []): UseDashboardSummaryResult {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [status, setStatus] = useState<DashboardStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const requestIdRef = useRef(0)
  // Array identity changes every render for an inline literal like `[]` —
  // keying on the joined value keeps the effect from refetching every render.
  const regionsKey = regions.join(',')

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    fetchDashboardSummary(regions)
      .then((res) => {
        if (requestId !== requestIdRef.current) return
        setSummary(res)
        setLastUpdatedAt(new Date())
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionsKey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  return { summary, status, error, lastUpdatedAt, refresh: load }
}
