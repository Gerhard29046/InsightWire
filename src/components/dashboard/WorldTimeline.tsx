import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { clsx } from 'clsx'
import { useHistoricalMoments } from '../../hooks/useHistoricalMoments'
import { categoryById } from '../../lib/categories'

function formatYear(iso: string): string {
  return new Date(iso).getFullYear().toString()
}

/**
 * "What shaped the world we live in today" — real, curated historical spans
 * (see historical_moments migration), never an event InsightWire ingested
 * being auto-promoted to "historic." This table starts empty and stays
 * empty until a real curation workflow adds rows; the honest empty state
 * below is the expected default, not a bug. Horizontally scrollable by
 * design — this is meant to hold many decades of moments without vertically
 * dominating the Dashboard.
 */
export function WorldTimeline() {
  const { moments, status } = useHistoricalMoments()

  // 'error' (e.g. the historical_moments table/endpoint genuinely isn't
  // available yet) is deliberately NOT rendered as "no historical moments
  // have been curated yet" — that would misrepresent a real fetch failure
  // as an honest empty dataset. Hiding the section entirely here is more
  // honest than either a fake empty state or a scary error box for what is,
  // for now, an optional/foundational feature.
  if (status === 'not-configured' || status === 'loading' || status === 'error') return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Historical timeline</h2>
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        What shaped the world we live in today — curated, not auto-generated.
      </p>

      {moments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
          No historical moments have been curated yet.
        </p>
      ) : (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {moments.map((m) => {
            const cat = m.category ? categoryById[m.category] : undefined
            return (
              <Link
                key={m.id}
                to={`/history/${encodeURIComponent(m.id)}`}
                className="flex w-56 shrink-0 flex-col gap-1.5 rounded-xl border border-slate-200 p-3 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/50 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50 dark:hover:bg-[var(--accent-hover)]/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                    {formatYear(m.startDate)}
                    {m.endDate && m.endDate.slice(0, 4) !== m.startDate.slice(0, 4) ? `–${formatYear(m.endDate)}` : ''}
                  </span>
                  <span
                    className={clsx(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      m.significance === 'major'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {m.significance}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-white">{m.title}</p>
                {cat && <p className="text-xs text-slate-400 dark:text-slate-500">{cat.label}</p>}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
