import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEventsFeed } from '../hooks/useEventsFeed'
import { EventFeed } from '../components/feed/EventFeed'
import { EventFilters } from '../components/feed/EventFilters'
import { EventToolbar } from '../components/feed/EventToolbar'
import { createEmptyFilters, describeActiveFilters, hasActiveFilters, type EventSortMode } from '../lib/api/types'
import { filtersFromSearchParams, searchParamsFromFilters } from '../lib/feedUrl'

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
