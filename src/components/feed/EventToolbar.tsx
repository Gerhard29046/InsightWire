import { clsx } from 'clsx'
import { RefreshCw, Rss } from 'lucide-react'
import { sortOptions } from '../../lib/api/taxonomy'
import type { EventSortMode } from '../../lib/api/types'

interface EventToolbarProps {
  sort: EventSortMode
  onSortChange: (sort: EventSortMode) => void
  resultCount: number | null
  onRefresh: () => void
  isRefreshing: boolean
  hasActiveFilters: boolean
  onClearFilters: () => void
}

export function EventToolbar({
  sort,
  onSortChange,
  resultCount,
  onRefresh,
  isRefreshing,
  hasActiveFilters,
  onClearFilters,
}: EventToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Rss className="h-3.5 w-3.5" aria-hidden />
        {resultCount === null ? 'Loading…' : `${resultCount} event${resultCount === 1 ? '' : 's'}`}
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span>Auto-refreshes every 60s</span>
      </div>
      <div className="flex items-center gap-2">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs font-medium text-slate-500 hover:text-[var(--accent)] dark:text-slate-400"
          >
            Clear filters
          </button>
        )}
        <label className="sr-only" htmlFor="feed-sort">
          Sort events
        </label>
        <select
          id="feed-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as EventSortMode)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          <RefreshCw className={clsx('h-3.5 w-3.5', isRefreshing && 'animate-spin')} aria-hidden />
          Refresh
        </button>
      </div>
    </div>
  )
}
