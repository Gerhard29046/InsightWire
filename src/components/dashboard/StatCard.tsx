import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'

interface StatDelta {
  direction: 'up' | 'down'
  label: string
  /** What this movement means, not its sign — more alerts "up" is bad. */
  tone: 'good' | 'bad' | 'neutral'
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  delta?: StatDelta
  /**
   * A real, concrete destination this number's underlying data lives at
   * (e.g. `/feed?breaking=true`). Omit for a stat with no meaningful place
   * to send someone — rendering it as a plain, non-interactive card is more
   * honest than a decorative link that goes nowhere useful.
   */
  to?: string
}

export function StatCard({ icon: Icon, label, value, delta, to }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {delta && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              delta.tone === 'neutral' && 'text-slate-400 dark:text-slate-500',
            )}
            style={
              delta.tone !== 'neutral'
                ? { color: `var(--status-${delta.tone === 'good' ? 'good' : 'critical'})` }
                : undefined
            }
          >
            {delta.direction === 'up' ? (
              <ArrowUp className="h-3 w-3" aria-hidden />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden />
            )}
            {delta.label}
          </span>
        )}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
        {to && <ArrowRight className="h-4 w-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600" aria-hidden />}
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className="group block rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-sky-300 hover:bg-sky-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
      >
        {content}
      </Link>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      {content}
    </div>
  )
}
