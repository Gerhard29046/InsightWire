import { motion } from 'framer-motion'
import { Bell, Bookmark, Plus, Search } from 'lucide-react'

interface WorkspaceHeaderProps {
  unreadCount: number
  onNewSearch: () => void
  onAddBookmark: () => void
  onManageNotifications: () => void
}

export function WorkspaceHeader({ unreadCount, onNewSearch, onAddBookmark, onManageNotifications }: WorkspaceHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-wrap items-start justify-between gap-4"
    >
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">My Workspace</h1>
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--status-critical)' }}
            >
              {unreadCount} new
            </span>
          )}
        </div>
        <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          Your personal newsroom — follow stories, save research, and stay ahead of developing events.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onNewSearch}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <Plus className="-ml-1 h-3 w-3" aria-hidden />
          New Saved Search
        </button>
        <button
          type="button"
          onClick={onAddBookmark}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Bookmark className="h-3.5 w-3.5" aria-hidden />
          <Plus className="-ml-1 h-3 w-3" aria-hidden />
          Add Bookmark
        </button>
        <button
          type="button"
          onClick={onManageNotifications}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden />
          Manage Notifications
        </button>
      </div>
    </motion.div>
  )
}
