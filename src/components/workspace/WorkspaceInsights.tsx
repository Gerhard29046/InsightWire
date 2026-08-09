import { Newspaper, VolumeX } from 'lucide-react'
import type { WorkspaceOverview } from '../../lib/api/workspace'

function timeAgo(iso: string | null): string {
  if (!iso) return 'no activity yet'
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

interface WorkspaceInsightsProps {
  topSources: WorkspaceOverview['topSources']
  quietSearches: WorkspaceOverview['quietSearches']
}

/** Two small, real, derived signals — not decorative charts. Both come straight from `getWorkspaceOverview`'s real aggregation, never fabricated. */
export function WorkspaceInsights({ topSources, quietSearches }: WorkspaceInsightsProps) {
  if (topSources.length === 0 && quietSearches.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      {topSources.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Newspaper className="h-3.5 w-3.5" aria-hidden />
            Sources you save most
          </h3>
          <div className="flex flex-col gap-1.5">
            {topSources.map(({ source, count }) => (
              <div key={source} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{source}</span>
                <span className="font-medium text-slate-400 dark:text-slate-500">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {quietSearches.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <VolumeX className="h-3.5 w-3.5" aria-hidden />
            Quiet searches
          </h3>
          <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">Active, but nothing new in a while — worth reconsidering.</p>
          <div className="flex flex-col gap-1.5">
            {quietSearches.map((w) => (
              <div key={w.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{w.name}</span>
                <span className="text-slate-400 dark:text-slate-500">{timeAgo(w.lastActivityAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
