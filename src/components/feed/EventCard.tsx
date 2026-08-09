import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Bookmark, Check, ExternalLink, FileSearch, HelpCircle, MapPin, Share2, ShieldAlert } from 'lucide-react'
import { clsx } from 'clsx'
import { CategoryBadge } from '../dashboard/CategoryBadge'
import { EventBadge } from './EventBadge'
import { EventStatus } from './EventStatus'
import { EventImportance } from './EventImportance'
import { useBookmarkStatus } from '../../hooks/useBookmarkStatus'
import type { NormalizedEvent, VerificationStatus } from '../../lib/api/types'

const verificationMeta: Record<VerificationStatus, { label: string; icon: LucideIcon; className: string }> = {
  verified: { label: 'Verified', icon: Check, className: 'text-emerald-600 dark:text-emerald-400' },
  unverified: { label: 'Unverified', icon: HelpCircle, className: 'text-slate-400 dark:text-slate-500' },
  disputed: { label: 'Disputed', icon: ShieldAlert, className: 'text-amber-600 dark:text-amber-400' },
}

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

export function EventCard({ event, index = 0 }: { event: NormalizedEvent; index?: number }) {
  const { bookmarked, toggle: toggleBookmark } = useBookmarkStatus(event.id)
  const navigate = useNavigate()
  const verification = verificationMeta[event.verificationStatus]
  const body = event.summary ?? event.description
  const detailPath = `/feed/${encodeURIComponent(event.id)}`

  const handleShare = async () => {
    const shareUrl = event.sourceUrl ?? window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: body, url: shareUrl })
      } catch {
        // user dismissed the share sheet — no-op
      }
      return
    }
    if (navigator.clipboard) await navigator.clipboard.writeText(shareUrl)
  }

  /** The card opens the journalist detail view; "Read original source" (below) is the separate, explicit path to the real source URL — never fabricated, only rendered when event.sourceUrl actually exists. */
  const openDetail = () => navigate(detailPath)

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03, ease: 'easeOut' }}
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openDetail()
      }}
      className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-colors hover:border-[var(--accent)]/40 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={event.category} />
        <EventImportance importance={event.importance} />
        <EventStatus status={event.status} />
        <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', verification.className)}>
          <verification.icon className="h-3 w-3" aria-hidden />
          {verification.label}
        </span>
        <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {timeAgo(event.publishedAt)}
        </span>
      </div>

      <h3 className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-white">{event.title}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>

      {event.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {event.tags.map((tag) => (
            <EventBadge key={tag}>{tag}</EventBadge>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
        {event.sourceUrl ? (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 hover:text-[var(--accent)]"
          >
            {event.source}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : (
          <span>{event.source}</span>
        )}
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" aria-hidden />
          {event.city ? `${event.city}, ${event.country}` : event.country}
        </span>
        <span>Updated {timeAgo(event.updatedAt)}</span>
        <span className="ml-auto font-medium text-slate-500 dark:text-slate-300">
          {Math.round(event.confidence * 100)}% confidence
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleBookmark()
          }}
          aria-pressed={bookmarked}
          className={clsx(
            'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800',
            bookmarked ? 'text-[var(--accent)]' : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? 'currentColor' : 'none'} aria-hidden />
          Bookmark
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void handleShare()
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Share
        </button>
        {/* Explicit, separate "read original" action — never fabricated, only rendered when the connector actually captured a real source URL. */}
        {event.sourceUrl && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <FileSearch className="h-3.5 w-3.5" aria-hidden />
            Read original source
          </a>
        )}
      </div>
    </motion.article>
  )
}
