import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { fetchEvents } from '../../lib/api/events'
import { createEmptyFilters } from '../../lib/api/types'
import type { NormalizedEvent } from '../../lib/api/types'
import { WorkspaceModal } from './WorkspaceModal'

interface AddBookmarkModalProps {
  onClose: () => void
  onAdd: (eventId: string) => Promise<unknown>
}

const SEARCH_DEBOUNCE_MS = 350

/**
 * There's no existing "paste a URL to bookmark" flow anywhere in this app,
 * and inventing one would mean resolving an arbitrary URL back to a real
 * `normalized_events` row with no guarantee it corresponds to anything this
 * pipeline has ingested. Searching the real Intelligence API (the same
 * `fetchEvents` the Global Events Feed already uses) and picking a real
 * result is the only honest way to resolve "which event."
 */
export function AddBookmarkModal({ onClose, onAdd }: AddBookmarkModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NormalizedEvent[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    const timeout = setTimeout(() => {
      fetchEvents({ filters: { ...createEmptyFilters(), search: query.trim() }, sort: 'latest', pageSize: 8 })
        .then((res) => {
          setResults(res.events)
          setStatus('ready')
        })
        .catch(() => setStatus('error'))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query])

  const handleAdd = async (eventId: string) => {
    setAddingId(eventId)
    try {
      await onAdd(eventId)
      onClose()
    } finally {
      setAddingId(null)
    }
  }

  return (
    <WorkspaceModal title="Add bookmark" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search real events to bookmark…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {status === 'loading' && <p className="text-xs text-slate-400 dark:text-slate-500">Searching…</p>}
        {status === 'error' && <p className="text-xs text-red-600 dark:text-red-400">Couldn't search events. Try again.</p>}
        {status === 'ready' && results.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">No real events match "{query}".</p>
        )}

        <div className="flex flex-col gap-1.5">
          {results.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => handleAdd(event.id)}
              disabled={addingId !== null}
              className="rounded-lg border border-slate-100 p-3 text-left transition-colors hover:border-[var(--accent)]/40 disabled:opacity-60 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50"
            >
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{event.title}</p>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {event.source} · {new Date(event.publishedAt).toLocaleDateString()}
              </p>
              {addingId === event.id && <p className="mt-1 text-xs text-[var(--accent)]">Saving…</p>}
            </button>
          ))}
        </div>
      </div>
    </WorkspaceModal>
  )
}
