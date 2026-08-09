import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import {
  createWatchlist as createWatchlistApi,
  deleteWatchlist as deleteWatchlistApi,
  fetchWatchlists,
  refreshWatchlist as refreshWatchlistApi,
  updateWatchlist as updateWatchlistApi,
  type RefreshWatchlistResult,
  type UpdateWatchlistPatch,
  type WatchlistFilters,
  type WatchlistRecord,
} from '../lib/api/workspace'

export type WatchlistsStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseWatchlistsResult {
  watchlists: WatchlistRecord[]
  status: WatchlistsStatus
  error: unknown
  refresh: () => void
  createWatchlist: (input: { name: string; filters: WatchlistFilters }) => Promise<WatchlistRecord>
  updateWatchlist: (id: string, patch: UpdateWatchlistPatch) => Promise<WatchlistRecord>
  deleteWatchlist: (id: string) => Promise<void>
  refreshWatchlist: (id: string) => Promise<RefreshWatchlistResult>
}

/**
 * No optimistic updates — every mutation here re-fetches the real list
 * afterward rather than guessing what the server-side state (new-results
 * count, quiet flag, etc.) will look like. Simpler, and never shows a
 * number that turns out to have been wrong.
 */
export function useWatchlists(): UseWatchlistsResult {
  const [watchlists, setWatchlists] = useState<WatchlistRecord[]>([])
  const [status, setStatus] = useState<WatchlistsStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    fetchWatchlists()
      .then((res) => {
        if (requestId !== requestIdRef.current) return
        setWatchlists(res)
        setError(null)
        setStatus(res.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return {
    watchlists,
    status,
    error,
    refresh: load,
    createWatchlist: (input) =>
      createWatchlistApi(input).then((r) => {
        load()
        return r
      }),
    updateWatchlist: (id, patch) =>
      updateWatchlistApi(id, patch).then((r) => {
        load()
        return r
      }),
    deleteWatchlist: (id) =>
      deleteWatchlistApi(id).then((r) => {
        load()
        return r
      }),
    refreshWatchlist: (id) =>
      refreshWatchlistApi(id).then((r) => {
        load()
        return r
      }),
  }
}
