import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { clsx } from 'clsx'

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
}

export function StatCard({ icon: Icon, label, value, delta }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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
      <p className="mt-4 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
