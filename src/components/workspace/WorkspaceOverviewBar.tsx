import type { LucideIcon } from 'lucide-react'
import { Bell, Bookmark, Radar, RefreshCw, Search } from 'lucide-react'
import type { WorkspaceOverview } from '../../lib/api/workspace'

interface StatChipProps {
  icon: LucideIcon
  label: string
  value: number
  sectionId: string
  emphasize?: boolean
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function StatChip({ icon: Icon, label, value, sectionId, emphasize }: StatChipProps) {
  return (
    <button
      type="button"
      onClick={() => scrollToSection(sectionId)}
      className="group flex flex-1 min-w-[9.5rem] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[var(--accent-hover)]/50 dark:hover:bg-[var(--accent-hover)]/30"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={emphasize ? { backgroundColor: 'color-mix(in srgb, var(--status-critical) 16%, transparent)' } : undefined}
      >
        <Icon
          className="h-4 w-4"
          style={emphasize ? { color: 'var(--status-critical)' } : undefined}
          aria-hidden
        />
      </span>
      <span>
        <span className="block text-lg font-semibold tabular-nums leading-tight text-slate-900 dark:text-white">{value}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </span>
    </button>
  )
}

/** Editorial stat row, not a dashboard — each chip is an anchor-scroll into the section it summarizes, not a separate analytics view. */
export function WorkspaceOverviewBar({ counts }: { counts: WorkspaceOverview['counts'] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <StatChip icon={Search} label="Saved searches" value={counts.savedSearches} sectionId="saved-searches" />
      <StatChip icon={Bookmark} label="Bookmarks" value={counts.bookmarks} sectionId="bookmarks" />
      <StatChip icon={Bell} label="Unread alerts" value={counts.unreadAlerts} sectionId="notifications" emphasize={counts.unreadAlerts > 0} />
      <StatChip icon={Radar} label="Active monitoring" value={counts.activeMonitoring} sectionId="saved-searches" />
      <StatChip icon={RefreshCw} label="Recently updated" value={counts.recentlyUpdated} sectionId="recent-research" />
    </div>
  )
}
