import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchEvents } from '../lib/api/events'
import type { EventFiltersState, EventSortMode, NormalizedEvent } from '../lib/api/types'

export type FeedStatus = 'loading' | 'loading-more' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseEventsFeedResult {
  events: NormalizedEvent[]
  status: FeedStatus
  error: unknown
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

/** Fallback for "realtime updates" until Supabase Realtime is wired up. */
const POLL_INTERVAL_MS = 60_000

export function useEventsFeed(
  filters: EventFiltersState,
  sort: EventSortMode,
  pageSize?: number,
): UseEventsFeedResult {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [status, setStatus] = useState<FeedStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [hasMore, setHasMore] = useState(false)
  const cursorRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(
    (mode: 'replace' | 'append') => {
      const requestId = ++requestIdRef.current
      setStatus(mode === 'append' ? 'loading-more' : 'loading')
      if (mode === 'replace') setError(null)

      fetchEvents({ filters, sort, cursor: mode === 'append' ? cursorRef.current : null, pageSize })
        .then((res) => {
          if (requestId !== requestIdRef.current) return
          setEvents((prev) => (mode === 'append' ? [...prev, ...res.events] : res.events))
          cursorRef.current = res.nextCursor
          setHasMore(res.nextCursor !== null)
          const total = mode === 'append' ? events.length + res.events.length : res.events.length
          setStatus(total === 0 ? 'empty' : 'ready')
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return
          setError(err)
          setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
        })
    },
    [filters, sort, pageSize, events.length],
  )

  useEffect(() => {
    cursorRef.current = null
    load('replace')
    // Refetching should only be driven by filters/sort/pageSize changing,
    // not by `load`'s own identity (it changes every render via `events.length`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, pageSize])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load('replace')
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, pageSize])

  return {
    events,
    status,
    error,
    hasMore,
    loadMore: () => load('append'),
    refresh: () => load('replace'),
  }
}
