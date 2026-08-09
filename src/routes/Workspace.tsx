import { useEffect, useMemo, useState } from 'react'
import { AddBookmarkModal } from '../components/workspace/AddBookmarkModal'
import { BookmarksPanel } from '../components/workspace/BookmarksPanel'
import { NeedsAttention } from '../components/workspace/NeedsAttention'
import { NotificationsPanel } from '../components/workspace/NotificationsPanel'
import { RecentResearch } from '../components/workspace/RecentResearch'
import { SavedSearchEditorModal } from '../components/workspace/SavedSearchEditorModal'
import { SavedSearchesPanel } from '../components/workspace/SavedSearchesPanel'
import { WorkspaceFilterBar } from '../components/workspace/WorkspaceFilterBar'
import { WorkspaceHeader } from '../components/workspace/WorkspaceHeader'
import { WorkspaceInsights } from '../components/workspace/WorkspaceInsights'
import { WorkspaceOverviewBar } from '../components/workspace/WorkspaceOverviewBar'
import { EmptyState } from '../components/feed/EmptyState'
import { ErrorState } from '../components/feed/ErrorState'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { useAlerts } from '../hooks/useAlerts'
import { useBookmarks } from '../hooks/useBookmarks'
import { useNotifications } from '../hooks/useNotifications'
import { useRecentActivity } from '../hooks/useRecentActivity'
import { useWatchlists } from '../hooks/useWatchlists'
import { useWorkspaceOverview } from '../hooks/useWorkspaceOverview'
import { describeActiveFilters } from '../lib/api/types'
import { fromWatchlistFilters, type WatchlistRecord } from '../lib/api/workspace'
import { logRecentActivity } from '../lib/recentActivity'

interface EditorState {
  open: boolean
  watchlist?: WatchlistRecord
}

export default function Workspace() {
  const { overview, status: overviewStatus, error: overviewError, refresh: refreshOverview } = useWorkspaceOverview()
  const watchlistsResult = useWatchlists()
  const bookmarksResult = useBookmarks()
  const alertsResult = useAlerts()
  const notificationsResult = useNotifications()
  const { entries: recentEntries, refresh: refreshRecentActivity } = useRecentActivity()

  const [query, setQuery] = useState('')
  const [editorState, setEditorState] = useState<EditorState>({ open: false })
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  // The overview's own 60s poll is what actually runs the real matching
  // pass (see workspaceApi.ts's getWorkspaceOverview) — piggybacking the
  // other three lists' refreshes on it keeps everything in step without
  // each hook needing its own separate interval.
  useEffect(() => {
    if (!overview) return
    watchlistsResult.refresh()
    alertsResult.refresh()
    notificationsResult.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview])

  const filteredWatchlists = useMemo(() => {
    if (!query.trim()) return watchlistsResult.watchlists
    const q = query.trim().toLowerCase()
    return watchlistsResult.watchlists.filter((w) => {
      const criteria = describeActiveFilters(fromWatchlistFilters(w.filters)) ?? ''
      return w.name.toLowerCase().includes(q) || criteria.toLowerCase().includes(q)
    })
  }, [watchlistsResult.watchlists, query])

  const filteredBookmarks = useMemo(() => {
    if (!query.trim()) return bookmarksResult.bookmarks
    const q = query.trim().toLowerCase()
    return bookmarksResult.bookmarks.filter(
      (b) =>
        b.event.title.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q)) ||
        (b.notes ?? '').toLowerCase().includes(q) ||
        (b.collection ?? '').toLowerCase().includes(q),
    )
  }, [bookmarksResult.bookmarks, query])

  if (overviewStatus === 'not-configured') {
    return (
      <div className="flex flex-col gap-6">
        <WorkspaceHeader
          unreadCount={0}
          onNewSearch={() => setEditorState({ open: true })}
          onAddBookmark={() => setAddBookmarkOpen(true)}
          onManageNotifications={() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth' })}
        />
        <EmptyState variant="not-configured" />
      </div>
    )
  }

  if (overviewStatus === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <WorkspaceHeader
          unreadCount={0}
          onNewSearch={() => setEditorState({ open: true })}
          onAddBookmark={() => setAddBookmarkOpen(true)}
          onManageNotifications={() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth' })}
        />
        <ErrorState error={overviewError} onRetry={refreshOverview} title="Unable to load your workspace." />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <WorkspaceHeader
        unreadCount={overview?.counts.unreadAlerts ?? 0}
        onNewSearch={() => setEditorState({ open: true })}
        onAddBookmark={() => setAddBookmarkOpen(true)}
        onManageNotifications={() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {overviewStatus === 'loading' && !overview ? (
        <LoadingSkeleton count={5} />
      ) : (
        overview && (
          <>
            <WorkspaceOverviewBar counts={overview.counts} />
            <WorkspaceFilterBar query={query} onQueryChange={setQuery} />

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
              <div className="flex flex-col gap-8 xl:col-span-2">
                <section id="needs-attention" className="flex flex-col gap-3 scroll-mt-20">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Needs your attention</h2>
                    {/* This section recomputes fresh on every load — a card here reflects "what's new since your last check," not a persistent log. A card leaving this list (e.g. after the next refresh finds nothing new) is expected and unrelated to marking anything read; the full history always stays in Notifications on the right. */}
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      What's changed since you last checked — not a history. See Notifications for everything that's happened.
                    </p>
                  </div>
                  <NeedsAttention items={overview.attention} />
                </section>

                <section id="saved-searches" className="flex flex-col gap-3 scroll-mt-20">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Saved searches</h2>
                    <button
                      type="button"
                      onClick={() => setEditorState({ open: true })}
                      className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                    >
                      + New search
                    </button>
                  </div>
                  <SavedSearchesPanel
                    watchlists={filteredWatchlists}
                    status={watchlistsResult.status}
                    onCreate={() => setEditorState({ open: true })}
                    onEdit={(w) => setEditorState({ open: true, watchlist: w })}
                    onTogglePause={(w) => watchlistsResult.updateWatchlist(w.id, { active: !w.active })}
                    onDelete={(w) => {
                      if (window.confirm(`Delete saved search "${w.name}"? This can't be undone.`)) {
                        watchlistsResult.deleteWatchlist(w.id)
                      }
                    }}
                    onRefresh={(w) => {
                      setRefreshingId(w.id)
                      watchlistsResult.refreshWatchlist(w.id).finally(() => setRefreshingId(null))
                    }}
                    onOpen={(w) => {
                      logRecentActivity({ kind: 'opened_watchlist', label: w.name, href: '/workspace#saved-searches' })
                      refreshRecentActivity()
                    }}
                    refreshingId={refreshingId}
                  />
                </section>

                <section id="bookmarks" className="flex flex-col gap-3 scroll-mt-20">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Bookmarks &amp; research collection</h2>
                    <button type="button" onClick={() => setAddBookmarkOpen(true)} className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
                      + Add bookmark
                    </button>
                  </div>
                  <BookmarksPanel
                    bookmarks={filteredBookmarks}
                    status={bookmarksResult.status}
                    onUpdate={bookmarksResult.updateBookmark}
                    onRemove={bookmarksResult.removeBookmark}
                  />
                </section>

                <section id="recent-research" className="flex flex-col gap-3 scroll-mt-20">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent research</h2>
                  <RecentResearch entries={recentEntries} />
                </section>
              </div>

              <div className="flex flex-col gap-8 xl:sticky xl:top-20 xl:self-start">
                <section id="notifications" className="flex flex-col gap-3 scroll-mt-20 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h2>
                  <NotificationsPanel
                    alerts={alertsResult.alerts}
                    alertsStatus={alertsResult.status}
                    notifications={notificationsResult.notifications}
                    notificationsStatus={notificationsResult.status}
                    onMarkAlertRead={alertsResult.markRead}
                    onMarkAllAlertsRead={alertsResult.markAllRead}
                    onMarkNotificationRead={notificationsResult.markRead}
                    onMarkAllNotificationsRead={notificationsResult.markAllRead}
                  />
                </section>

                <WorkspaceInsights topSources={overview.topSources} quietSearches={overview.quietSearches} />
              </div>
            </div>
          </>
        )
      )}

      {editorState.open && (
        <SavedSearchEditorModal
          watchlist={editorState.watchlist}
          onClose={() => setEditorState({ open: false })}
          onSave={(input) =>
            editorState.watchlist
              ? watchlistsResult.updateWatchlist(editorState.watchlist.id, input)
              : watchlistsResult.createWatchlist(input)
          }
        />
      )}

      {addBookmarkOpen && (
        <AddBookmarkModal
          onClose={() => setAddBookmarkOpen(false)}
          onAdd={(eventId) =>
            bookmarksResult.addBookmark({ normalizedEventId: eventId }).then((bookmark) => {
              logRecentActivity({ kind: 'saved_bookmark', label: bookmark.event.title, href: `/feed/${encodeURIComponent(bookmark.event.id)}` })
              refreshRecentActivity()
            })
          }
        />
      )}
    </div>
  )
}
