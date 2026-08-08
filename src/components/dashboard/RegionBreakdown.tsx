import { Link } from 'react-router-dom'
import type { RegionCount } from '../../lib/api/dashboard'

/**
 * Real, exact per-region counts computed server-side by GET
 * /dashboard/summary (worker/src/api/dashboardApi.ts) from every real row's
 * `country` in the window, mapped through the same shared REGION_COUNTRIES
 * geography the Events Feed's region filter uses. Regions with zero real
 * events this window still render at 0 (never omitted) so this never implies
 * a region wasn't checked — matching CategoryBreakdown's own reasoning.
 */
export function RegionBreakdown({ breakdown }: { breakdown: RegionCount[] }) {
  const rows = breakdown.filter((r) => r.region !== 'Global').sort((a, b) => b.count - a.count)
  const max = Math.max(...rows.map((r) => r.count), 1)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Signal by region</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tracked events, current window</p>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.region} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              {r.region}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className="block h-full rounded-full bg-sky-500 dark:bg-sky-400"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {r.count}
            </span>
            {r.count > 0 ? (
              <Link
                to={`/feed?region=${encodeURIComponent(r.region)}`}
                className="shrink-0 text-xs font-medium text-sky-500 hover:text-sky-600 hover:underline"
              >
                View →
              </Link>
            ) : (
              <span className="w-9 shrink-0" aria-hidden />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
