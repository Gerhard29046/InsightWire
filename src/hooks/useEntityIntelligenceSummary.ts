import { useEffect, useState } from 'react'
import { fetchEntities, type EntityRecord } from '../lib/api/entities'
import { entityTypes } from '../lib/entityTypes'

export interface EntityTypeCount {
  type: (typeof entityTypes)[number]['id']
  count: number
}

export interface EntityIntelligenceSummary {
  totalCount: number
  /** Real per-type totals — one lightweight pageSize=1 request per type reusing the existing exact PostgREST count, never a fabricated breakdown. Only non-zero types are kept. */
  typeCounts: EntityTypeCount[]
  /** The 5 most recently active real entities (same endpoint, sort=recent, pageSize=5) — no separate heavy query. */
  recentlyActive: EntityRecord[]
}

export type EntityIntelligenceSummaryStatus = 'loading' | 'ready' | 'error'

export interface UseEntityIntelligenceSummaryResult {
  summary: EntityIntelligenceSummary | null
  status: EntityIntelligenceSummaryStatus
}

/**
 * Deliberately independent of the main list's own filters/pagination — this
 * is a page-level overview, refreshed once per mount (and whenever
 * `refreshKey` changes), not on every keystroke of the search box. All of it
 * comes from the same real `/entities` endpoint the main list already uses;
 * nothing here loads events/articles.
 */
export function useEntityIntelligenceSummary(refreshKey: number): UseEntityIntelligenceSummaryResult {
  const [summary, setSummary] = useState<EntityIntelligenceSummary | null>(null)
  const [status, setStatus] = useState<EntityIntelligenceSummaryStatus>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const totalPromise = fetchEntities({ pageSize: 1 })
    const perTypePromises = entityTypes.map((t) => fetchEntities({ types: [t.id], pageSize: 1 }))
    const recentPromise = fetchEntities({ sort: 'recent', pageSize: 5 })

    Promise.all([totalPromise, Promise.all(perTypePromises), recentPromise])
      .then(([totalRes, perTypeResults, recentRes]) => {
        if (cancelled) return
        const typeCounts: EntityTypeCount[] = entityTypes
          .map((t, i) => ({ type: t.id, count: perTypeResults[i].totalCount ?? 0 }))
          .filter((c) => c.count > 0)
          .sort((a, b) => b.count - a.count)

        setSummary({ totalCount: totalRes.totalCount ?? 0, typeCounts, recentlyActive: recentRes.entities })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return { summary, status }
}
