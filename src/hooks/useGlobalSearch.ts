import { useEffect, useRef, useState } from 'react'
import { fetchEntities, type EntityRecord } from '../lib/api/entities'
import { fetchEvents } from '../lib/api/events'
import { createEmptyFilters } from '../lib/api/types'
import type { NormalizedEvent } from '../lib/api/types'

export type GlobalSearchStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GlobalSearchResult {
  events: NormalizedEvent[]
  entities: EntityRecord[]
  status: GlobalSearchStatus
}

const SUGGESTION_DEBOUNCE_MS = 250
const SUGGESTION_LIMIT = 5

/**
 * The navbar's instant-suggestions dropdown, built entirely on the real
 * Intelligence API already used elsewhere (`fetchEvents`/`fetchEntities` —
 * the same calls EventsFeed and EntityExplorer make) rather than a second,
 * isolated search system. Runs both real queries in parallel and keeps
 * whichever settles last (via a request-id guard), same pattern as
 * `useEventsFeed`.
 */
export function useGlobalSearch(query: string): GlobalSearchResult {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [entities, setEntities] = useState<EntityRecord[]>([])
  const [status, setStatus] = useState<GlobalSearchStatus>('idle')
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setEvents([])
      setEntities([])
      setStatus('idle')
      return
    }

    setStatus('loading')
    const requestId = ++requestIdRef.current
    const timeout = setTimeout(() => {
      Promise.all([
        fetchEvents({ filters: { ...createEmptyFilters(), search: trimmed }, sort: 'latest', pageSize: SUGGESTION_LIMIT }),
        fetchEntities({ search: trimmed, pageSize: SUGGESTION_LIMIT }),
      ])
        .then(([eventsRes, entitiesRes]) => {
          if (requestId !== requestIdRef.current) return
          setEvents(eventsRes.events)
          setEntities(entitiesRes.entities)
          setStatus('ready')
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return
          setStatus('error')
        })
    }, SUGGESTION_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [query])

  return { events, entities, status }
}
