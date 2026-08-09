import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bookmark, BookmarkPlus, Search } from 'lucide-react'
import { EventFeed } from '../components/feed/EventFeed'
import { entityTypeById } from '../lib/entityTypes'
import { useEventsFeed } from '../hooks/useEventsFeed'
import { useEntitySearch } from '../hooks/useEntitySearch'
import { useWatchlists } from '../hooks/useWatchlists'
import { useBookmarks } from '../hooks/useBookmarks'
import { createEmptyFilters, describeActiveFilters } from '../lib/api/types'
import { fromWatchlistFilters, toWatchlistFilters } from '../lib/api/workspace'
import { logRecentActivity } from '../lib/recentActivity'

/**
 * Enter on the navbar search (or "See all results") lands here — a real
 * results page over the same Intelligence API the Feed and Entity Explorer
 * already use, plus a "Save Search" action that writes into the existing
 * watchlist/saved-search infrastructure (see docs/decisions/0015 and
 * `workspaceApi.ts`) rather than inventing a second saved-search system.
 */
export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const filters = useMemo(() => ({ ...createEmptyFilters(), search: query }), [query])
  const { events, status, error, hasMore, loadMore, refresh } = useEventsFeed(filters, 'latest')
  const { entities, status: entityStatus } = useEntitySearch({ search: query, types: [], countries: [], sort: 'recent' })
  const watchlistsResult = useWatchlists()
  const bookmarksResult = useBookmarks()

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const matchingWatchlists = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return watchlistsResult.watchlists.filter((w) => {
      const criteria = describeActiveFilters(fromWatchlistFilters(w.filters)) ?? ''
      return w.name.toLowerCase().includes(q) || criteria.toLowerCase().includes(q)
    })
  }, [watchlistsResult.watchlists, query])

  const matchingBookmarks = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return bookmarksResult.bookmarks.filter(
      (b) => b.event.title.toLowerCase().includes(q) || b.tags.some((t) => t.toLowerCase().includes(q)) || (b.notes ?? '').toLowerCase().includes(q),
    )
  }, [bookmarksResult.bookmarks, query])

  const alreadySaved = matchingWatchlists.some((w) => w.name.toLowerCase() === query.trim().toLowerCase())

  const handleSaveSearch = async () => {
    if (!query.trim()) return
    setSaveState('saving')
    try {
      await watchlistsResult.createWatchlist({ name: query.trim(), filters: toWatchlistFilters(filters) })
      logRecentActivity({ kind: 'ran_search', label: query.trim(), href: `/search?q=${encodeURIComponent(query.trim())}` })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  if (!query.trim()) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
        <Search className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden />
        <p className="text-sm text-slate-500 dark:text-slate-400">Search the navbar above to see results here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Results for "{query}"</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real matches from the Intelligence API — the same data the Global Events Feed and Entity Explorer use.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveSearch}
          disabled={saveState === 'saving' || saveState === 'saved' || alreadySaved}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
          {saveState === 'saved' || alreadySaved ? 'Saved to Workspace' : saveState === 'saving' ? 'Saving…' : 'Save Search'}
        </button>
      </div>

      {(matchingWatchlists.length > 0 || matchingBookmarks.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Already in your Workspace</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {matchingWatchlists.map((w) => (
              <Link
                key={w.id}
                to="/workspace#saved-searches"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-2.5 py-1 text-xs font-medium text-[var(--accent-hover)] dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]"
              >
                <Search className="h-3 w-3" aria-hidden />
                Saved search: {w.name}
              </Link>
            ))}
            {matchingBookmarks.map((b) => (
              <Link
                key={b.id}
                to="/workspace#bookmarks"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
              >
                <Bookmark className="h-3 w-3" aria-hidden />
                Bookmarked: {b.event.title.length > 40 ? `${b.event.title.slice(0, 40)}…` : b.event.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-3 xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Events</h2>
          <EventFeed
            events={events}
            status={status}
            error={error}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onRetry={refresh}
            emptyTitle="No real events match this search."
            emptyDescription={`Nothing currently matches "${query}". Save it as a search — you'll be notified if something matches later.`}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Entities</h2>
          {entityStatus === 'loading' && <p className="text-xs text-slate-400 dark:text-slate-500">Searching…</p>}
          {entityStatus !== 'loading' && entities.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">No real entities match this search.</p>
          )}
          <div className="flex flex-col gap-1.5">
            {entities.map((entity) => {
              const meta = entityTypeById[entity.type]
              return (
                <Link
                  key={entity.id}
                  to={`/entities/${encodeURIComponent(entity.id)}`}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-100 p-2.5 text-sm transition-colors hover:border-[var(--accent)]/40 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50"
                >
                  <meta.icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{entity.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{meta.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
