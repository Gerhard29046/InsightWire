import { useState } from 'react'
import { useEventsFeed } from '../hooks/useEventsFeed'
import { EventFeed } from '../components/feed/EventFeed'
import { EventFilters } from '../components/feed/EventFilters'
import { EventToolbar } from '../components/feed/EventToolbar'
import { createEmptyFilters, hasActiveFilters, type EventSortMode } from '../lib/api/types'

export default function EventsFeed() {
  const [filters, setFilters] = useState(createEmptyFilters)
  const [sort, setSort] = useState<EventSortMode>('latest')
  const { events, status, error, hasMore, loadMore, refresh } = useEventsFeed(filters, sort)

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
      />
    </div>
  )
}
