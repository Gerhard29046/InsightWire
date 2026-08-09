import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Bookmark, Clock, Network, Rss, Search } from 'lucide-react'
import type { RecentActivityEntry, RecentActivityKind } from '../../lib/recentActivity'

const KIND_META: Record<RecentActivityKind, { icon: LucideIcon; verb: string }> = {
  viewed_event: { icon: Rss, verb: 'Opened' },
  viewed_entity: { icon: Network, verb: 'Viewed entity' },
  ran_search: { icon: Search, verb: 'Ran search' },
  saved_bookmark: { icon: Bookmark, verb: 'Saved' },
  opened_watchlist: { icon: Search, verb: 'Opened saved search' },
}

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

/** "Pick up where you left off" — a real, client-local log of this browser's own activity (see lib/recentActivity.ts's own doc comment on why this isn't server-side). */
export function RecentResearch({ entries }: { entries: RecentActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 px-4 py-3 dark:border-slate-800">
        <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nothing recent yet — browse the Feed or Entity Explorer and this becomes your "pick up where you left off" list.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.slice(0, 10).map((entry, i) => {
        const meta = KIND_META[entry.kind]
        return (
          <Link
            key={`${entry.kind}-${entry.href}-${i}`}
            to={entry.href}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <meta.icon className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-[var(--accent)]" aria-hidden />
            <p className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">
              <span className="text-slate-400 dark:text-slate-500">{meta.verb}</span> {entry.label}
            </p>
            <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{timeAgo(entry.at)}</span>
          </Link>
        )
      })}
    </div>
  )
}
