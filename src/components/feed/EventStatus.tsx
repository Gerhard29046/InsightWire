import { clsx } from 'clsx'
import type { EventStatusId } from '../../lib/api/types'

const statusMeta: Record<EventStatusId, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-red-500 animate-pulse', text: 'text-red-600 dark:text-red-400' },
  developing: { label: 'Developing', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  scheduled: { label: 'Scheduled', dot: 'bg-[var(--accent)]', text: 'text-[var(--accent-hover)] dark:text-[var(--accent)]' },
  resolved: { label: 'Resolved', dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400' },
}

export function EventStatus({ status }: { status: EventStatusId }) {
  const meta = statusMeta[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', meta.text)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}
