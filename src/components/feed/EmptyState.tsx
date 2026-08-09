import { motion } from 'framer-motion'
import { PlugZap, RefreshCw, Rss } from 'lucide-react'

interface EmptyStateProps {
  variant: 'no-events' | 'not-configured'
  onRefresh?: () => void
  /** Overrides the default "no-events" copy — used by pages (e.g. Calendar) whose truthful empty state reads differently than the Feed's. Ignored for "not-configured". */
  title?: string
  description?: string
}

export function EmptyState({ variant, onRefresh, title, description }: EmptyStateProps) {
  const isNotConfigured = variant === 'not-configured'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
        {isNotConfigured ? (
          <PlugZap className="h-6 w-6" aria-hidden />
        ) : (
          <Rss className="h-6 w-6" aria-hidden />
        )}
      </div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
        {isNotConfigured ? 'Backend not connected yet' : (title ?? 'No live events are currently available.')}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {isNotConfigured
          ? 'Set VITE_API_BASE_URL (see .env.example) once the ingestion API is live to start streaming real events here.'
          : (description ?? "The ingestion pipeline hasn't surfaced anything matching these filters yet.")}
      </p>
      {!isNotConfigured && onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Refresh
        </button>
      )}
    </motion.div>
  )
}
