import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import type { IntelEvent } from '../../lib/mockData'
import { timeAgo } from '../../lib/mockData'
import { CategoryBadge } from './CategoryBadge'
import { SeverityBadge } from './SeverityBadge'

export function EventCard({ event, index = 0 }: { event: IntelEvent; index?: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: 'easeOut' }}
      className="group rounded-xl border border-slate-200 p-4 transition-colors hover:border-sky-300 dark:border-slate-800 dark:hover:border-sky-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={event.category} />
        <SeverityBadge severity={event.severity} />
        <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {timeAgo(event.publishedAt)}
        </span>
      </div>
      <h3 className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-white">
        {event.headline}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
        <a href={event.sourceUrl} className="inline-flex items-center gap-1 hover:text-sky-500">
          {event.source}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <span>{event.region}</span>
        <span className="ml-auto font-medium text-slate-500 dark:text-slate-300">
          Signal {event.score}
        </span>
      </div>
    </motion.article>
  )
}
