import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEventsFeed } from '../hooks/useEventsFeed'
import { EventFeed } from '../components/feed/EventFeed'
import { EventFilters } from '../components/feed/EventFilters'
import { EventToolbar } from '../components/feed/EventToolbar'
import {
  createEmptyFilters,
  describeActiveFilters,
  hasActiveFilters,
  type EventFiltersState,
  type EventSortMode,
  type EventTimeRange,
} from '../lib/api/types'
import type { CategoryId } from '../lib/categories'
import type { Severity } from '../lib/severity'
import type { EventStatusId } from '@insightwire/shared'

/**
 * Reads the initial filter/sort state from the URL so links elsewhere in the
 * app (dashboard stat cards, regional "View all →" links, etc.) can deep-link
 * straight into a pre-filtered feed, e.g. `/feed?region=Africa&breaking=true`.
 * Mirrors the same param names the worker's `parseListEventsQuery` already
 * uses (`q`, `country`, `category`, ...) plus `region`, which is frontend-only.
 */
function filtersFromSearchParams(params: URLSearchParams): EventFiltersState {
  const base = createEmptyFilters()
  return {
    ...base,
    search: params.get('q') ?? '',
    countries: params.getAll('country'),
    regions: params.getAll('region'),
    categories: params.getAll('category') as CategoryId[],
    importance: params.getAll('importance') as Severity[],
    languages: params.getAll('language'),
    sources: params.getAll('source'),
    statuses: params.getAll('status') as EventStatusId[],
    verifiedOnly: params.get('verified') === 'true',
    liveOnly: params.get('live') === 'true',
    futureOnly: params.get('future') === 'true',
    breakingOnly: params.get('breaking') === 'true',
    dateFrom: params.get('from'),
    dateTo: params.get('to'),
    timeRange: (params.get('timeRange') as EventTimeRange) ?? 'any',
  }
}

function searchParamsFromFilters(filters: EventFiltersState, sort: EventSortMode): URLSearchParams {
  const params = new URLSearchParams()
  if (sort !== 'latest') params.set('sort', sort)
  if (filters.search) params.set('q', filters.search)
  filters.countries.forEach((v) => params.append('country', v))
  filters.regions.forEach((v) => params.append('region', v))
  filters.categories.forEach((v) => params.append('category', v))
  filters.importance.forEach((v) => params.append('importance', v))
  filters.languages.forEach((v) => params.append('language', v))
  filters.sources.forEach((v) => params.append('source', v))
  filters.statuses.forEach((v) => params.append('status', v))
  if (filters.verifiedOnly) params.set('verified', 'true')
  if (filters.liveOnly) params.set('live', 'true')
  if (filters.futureOnly) params.set('future', 'true')
  if (filters.breakingOnly) params.set('breaking', 'true')
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  if (filters.timeRange !== 'any') params.set('timeRange', filters.timeRange)
  return params
}

export default function EventsFeed() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams))
  const [sort, setSort] = useState<EventSortMode>(() => (searchParams.get('sort') as EventSortMode) ?? 'latest')
  const { events, status, error, hasMore, loadMore, refresh } = useEventsFeed(filters, sort)

  // Skip syncing back to the URL on the very first render (it was the source
  // of this state) — only writes when the user actually changes something.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setSearchParams(searchParamsFromFilters(filters, sort), { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort])

  const activeFiltersDescription = describeActiveFilters(filters)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Global Events Feed
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A live, filterable stream of detected events across government, business, courts,
          markets, and more — sourced from the ingestion backend.
        </p>
      </div>

      <EventFilters filters={filters} onChange={setFilters} />

      <EventToolbar
        sort={sort}
        onSortChange={setSort}
        resultCount={status === 'loading' ? null : events.length}
        onRefresh={refresh}
        isRefreshing={status === 'loading' || status === 'loading-more'}
        hasActiveFilters={hasActiveFilters(filters)}
        onClearFilters={() => setFilters(createEmptyFilters())}
      />

      <EventFeed
        events={events}
        status={status}
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onRetry={refresh}
        emptyTitle={activeFiltersDescription ? 'No events match these filters.' : 'No live events right now.'}
        emptyDescription={
          activeFiltersDescription
            ? `Nothing currently matches: ${activeFiltersDescription}. Try widening or clearing your filters.`
            : 'InsightWire has not detected any events yet. Check back shortly.'
        }
      />
    </div>
  )
}
