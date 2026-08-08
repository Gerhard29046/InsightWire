import { categoryById } from '../../lib/categories'
import type { CategoryCount } from '../../lib/api/dashboard'

/**
 * Takes the real, exact per-category counts computed server-side by
 * GET /dashboard/summary (worker/src/api/dashboardApi.ts) over the full
 * reporting window — not derived from whatever small sample of events the
 * page happens to also be displaying elsewhere. An earlier version of this
 * component computed counts by filtering the Dashboard's own 6-event
 * "highest signal" list, which meant "Signal by category" only ever showed
 * numbers between 0 and 6 regardless of how many real events actually
 * existed — a real, silent bug, not a mock value, but just as misleading.
 */
export function CategoryBreakdown({ breakdown }: { breakdown: CategoryCount[] }) {
  const counts = breakdown.map((c) => ({ ...categoryById[c.category], count: c.count })).sort((a, b) => b.count - a.count)
  const max = Math.max(...counts.map((c) => c.count), 1)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
        Signal by category
      </h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Tracked events, last 24 hours
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {counts.map((cat) => (
          <li key={cat.id} className="flex items-center gap-3">
            <cat.icon
              className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
              aria-hidden
            />
            <span className="w-28 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              {cat.label}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(cat.count / max) * 100}%`,
                  backgroundColor: `var(${cat.colorVar})`,
                }}
              />
            </span>
            <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {cat.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
