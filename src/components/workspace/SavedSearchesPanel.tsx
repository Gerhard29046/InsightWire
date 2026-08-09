import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Pause, Pencil, Play, RefreshCw, Search, Trash2 } from 'lucide-react'
import { EmptyState } from '../feed/EmptyState'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { searchParamsFromFilters } from '../../lib/feedUrl'
import { describeActiveFilters } from '../../lib/api/types'
import { fromWatchlistFilters, type WatchlistRecord } from '../../lib/api/workspace'
import type { WatchlistsStatus } from '../../hooks/useWatchlists'

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

interface SavedSearchesPanelProps {
  watchlists: WatchlistRecord[]
  status: WatchlistsStatus
  onCreate: () => void
  onEdit: (watchlist: WatchlistRecord) => void
  onTogglePause: (watchlist: WatchlistRecord) => void
  onDelete: (watchlist: WatchlistRecord) => void
  onRefresh: (watchlist: WatchlistRecord) => void
  onOpen: (watchlist: WatchlistRecord) => void
  refreshingId: string | null
}

export function SavedSearchesPanel({ watchlists, status, onCreate, onEdit, onTogglePause, onDelete, onRefresh, onOpen, refreshingId }: SavedSearchesPanelProps) {
  if (status === 'loading') return <LoadingSkeleton count={2} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />

  if (status === 'empty' || watchlists.length === 0) {
    return (
      <div className="flex min-h-[16vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Search className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No saved searches yet.</p>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          Save a set of criteria from any real event filter — you'll be notified when new matches come in.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
        >
          New saved search
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {watchlists.map((w, i) => {
        const criteria = describeActiveFilters(fromWatchlistFilters(w.filters)) ?? 'Any event — no filters set'
        const feedHref = `/feed?${searchParamsFromFilters(fromWatchlistFilters(w.filters), 'latest').toString()}`
        const isRefreshing = refreshingId === w.id
        return (
          <motion.div
            key={w.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03, ease: 'easeOut' }}
            className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{w.name}</h3>
                  {w.quiet && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Quiet
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{criteria}</p>
              </div>
              <span
                className={
                  w.active
                    ? 'inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'
                    : 'inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500'
                }
              >
                <span className={w.active ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-slate-400'} aria-hidden />
                {w.active ? 'Monitoring' : 'Paused'}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {w.newResultsCount > 0 && (
                <span className="font-semibold text-[var(--accent-hover)] dark:text-[var(--accent)]">
                  {w.newResultsCount} new result{w.newResultsCount === 1 ? '' : 's'}
                </span>
              )}
              <span>Last activity: {timeAgo(w.lastActivityAt)}</span>
              <span>Last checked: {timeAgo(w.lastCheckedAt)}</span>
            </div>

            <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
              <Link
                to={feedHref}
                onClick={() => onOpen(w)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Open
              </Link>
              <button
                type="button"
                onClick={() => onEdit(w)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onTogglePause(w)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {w.active ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                {w.active ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={() => onRefresh(w)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <RefreshCw className={isRefreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => onDelete(w)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
