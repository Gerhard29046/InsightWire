import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Bell, BookmarkCheck, CheckCircle2, Rss, TrendingUp } from 'lucide-react'
import type { AttentionItem } from '../../lib/api/workspace'

const KIND_META: Record<AttentionItem['kind'], { label: string; icon: LucideIcon; colorVar: string }> = {
  new_matches: { label: 'New activity', icon: Rss, colorVar: '--cat-government' },
  developing_spike: { label: 'Developing', icon: TrendingUp, colorVar: '--status-serious' },
  bookmark_updated: { label: 'Bookmark updated', icon: BookmarkCheck, colorVar: '--cat-markets' },
  unread_notification: { label: 'System', icon: Bell, colorVar: '--status-warning' },
}

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

function AttentionAction({ href, label }: { href: string; label: string }) {
  if (href.startsWith('/workspace#')) {
    const sectionId = href.split('#')[1]
    return (
      <button
        type="button"
        onClick={() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className="shrink-0 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
      >
        {label} →
      </button>
    )
  }
  return (
    <Link to={href} className="shrink-0 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
      {label} →
    </Link>
  )
}

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">You're caught up.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nothing needs your attention right now — new matches, developing stories, and bookmark updates will show up here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, i) => {
        const meta = KIND_META[item.kind]
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03, ease: 'easeOut' }}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `color-mix(in srgb, var(${meta.colorVar}) 16%, transparent)` }}
            >
              <meta.icon className="h-4 w-4" style={{ color: `var(${meta.colorVar})` }} aria-hidden />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{meta.label}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{timeAgo(item.timestamp)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{item.description}</p>
            </div>
            <AttentionAction href={item.actionHref} label={item.actionLabel} />
          </motion.div>
        )
      })}
    </div>
  )
}
