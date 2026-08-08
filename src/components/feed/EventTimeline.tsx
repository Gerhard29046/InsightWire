import { Clock } from 'lucide-react'
import type { EventUpdate } from '../../lib/api/types'

export function EventTimeline({ updates }: { updates: EventUpdate[] }) {
  if (updates.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">No status history yet.</p>
  }
  return (
    <ol className="flex flex-col gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
      {updates.map((update, i) => (
        <li key={i} className="text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-200">{update.label}</span>
          <span className="ml-2 inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3" aria-hidden />
            {new Date(update.at).toLocaleString()}
          </span>
        </li>
      ))}
    </ol>
  )
}
