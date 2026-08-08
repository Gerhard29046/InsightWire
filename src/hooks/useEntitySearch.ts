import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchEntities, type EntityRecord, type EntitySortMode, type EntityType, type ListEntitiesParams } from '../lib/api/entities'

export type EntitySearchStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface EntitySearchFilters {
  search: string
  types: EntityType[]
  countries: string[]
  sort: EntitySortMode
  /** ISO timestamp, or undefined for "any time". */
  activeSince?: string
}

export interface UseEntitySearchResult {
  entities: EntityRecord[]
  status: EntitySearchStatus
  error: unknown
  totalCount: number | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

const PAGE_SIZE = 30

export function useEntitySearch(filters: EntitySearchFilters): UseEntitySearchResult {
  const [entities, setEntities] = useState<EntityRecord[]>([])
  const [status, setStatus] = useState<EntitySearchStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const filterKey = [filters.search, filters.types.join(','), filters.countries.join(','), filters.sort, filters.activeSince ?? ''].join('|')

  const load = useCallback(
    (mode: 'replace' | 'append') => {
      const params: ListEntitiesParams = {
        search: filters.search || undefined,
        types: filters.types.length > 0 ? filters.types : undefined,
        countries: filters.countries.length > 0 ? filters.countries : undefined,
        cursor: mode === 'append' ? cursor : null,
        pageSize: PAGE_SIZE,
        sort: filters.sort,
        activeSince: filters.activeSince,
      }
      setStatus('loading')
      fetchEntities(params)
        .then((res) => {
          setEntities((prev) => (mode === 'append' ? [...prev, ...res.entities] : res.entities))
          setCursor(res.nextCursor)
          setHasMore(res.nextCursor !== null)
          setTotalCount(res.totalCount)
          const total = mode === 'append' ? entities.length + res.entities.length : res.entities.length
          setStatus(total === 0 ? 'empty' : 'ready')
        })
        .catch((err: unknown) => {
          setError(err)
          setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  )

  useEffect(() => {
    setCursor(null)
    load('replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  return { entities, status, error, totalCount, hasMore, loadMore: () => load('append'), refresh: () => load('replace') }
}
