import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Network, Rss, Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import { entityTypeById } from '../../lib/entityTypes'
import { getRecentSearches, logRecentSearch } from '../../lib/recentSearches'
import type { EntityRecord } from '../../lib/api/entities'
import type { NormalizedEvent } from '../../lib/api/types'

type SuggestionItem =
  | { kind: 'recent'; query: string }
  | { kind: 'entity'; entity: EntityRecord }
  | { kind: 'event'; event: NormalizedEvent }

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

/**
 * A real newsroom search, not decorative — built entirely on the existing
 * Intelligence API (`useGlobalSearch` -> `fetchEvents`/`fetchEntities`, the
 * same calls the Feed and Entity Explorer already make). No isolated second
 * search system, no fabricated suggestions.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { events, entities, status } = useGlobalSearch(query)

  const items: SuggestionItem[] = useMemo(() => {
    if (!query.trim()) return getRecentSearches().map((q): SuggestionItem => ({ kind: 'recent', query: q }))
    return [
      ...entities.map((entity): SuggestionItem => ({ kind: 'entity', entity })),
      ...events.map((event): SuggestionItem => ({ kind: 'event', event })),
    ]
  }, [query, events, entities])

  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  const runFullSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    logRecentSearch(trimmed)
    setOpen(false)
    inputRef.current?.blur()
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  const activateItem = (item: SuggestionItem) => {
    if (item.kind === 'recent') {
      setQuery(item.query)
      runFullSearch(item.query)
    } else if (item.kind === 'entity') {
      logRecentSearch(query)
      setOpen(false)
      navigate(`/entities/${encodeURIComponent(item.entity.id)}`)
    } else {
      logRecentSearch(query)
      setOpen(false)
      navigate(`/feed/${encodeURIComponent(item.event.id)}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1 >= items.length ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 < 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && items[activeIndex]) activateItem(items[activeIndex])
      else runFullSearch(query)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showDropdown = open && (query.trim().length > 0 || items.length > 0)

  return (
    <div
      className="relative flex-1 max-w-lg"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search events, entities, sources…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-listbox"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </label>

      {showDropdown && (
        <div
          id="global-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
          {!query.trim() && items.length > 0 && (
            <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recent searches</p>
          )}
          {!query.trim() && items.length === 0 && (
            <p className="px-2.5 py-3 text-xs text-slate-400 dark:text-slate-500">
              Try "Donald Trump", "NATO", "Ukraine", or "Cape Town infrastructure".
            </p>
          )}

          {!query.trim() &&
            items.map((item, i) =>
              item.kind === 'recent' ? (
                <button
                  key={item.query}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => activateItem(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                    activeIndex === i ? 'bg-[var(--accent)]/5 dark:bg-[var(--accent-hover)]/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                  )}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span className="text-slate-700 dark:text-slate-200">{item.query}</span>
                </button>
              ) : null,
            )}

          {query.trim() && status === 'loading' && <p className="px-2.5 py-3 text-xs text-slate-400 dark:text-slate-500">Searching…</p>}
          {query.trim() && status === 'error' && <p className="px-2.5 py-3 text-xs text-red-500">Couldn't search right now.</p>}
          {query.trim() && status === 'ready' && items.length === 0 && (
            <p className="px-2.5 py-3 text-xs text-slate-400 dark:text-slate-500">No real matches for "{query}" yet.</p>
          )}

          {query.trim() && entities.length > 0 && (
            <>
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Entities</p>
              {entities.map((entity, i) => {
                const meta = entityTypeById[entity.type]
                const index = i
                return (
                  <button
                    key={entity.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activateItem({ kind: 'entity', entity })}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                      activeIndex === index ? 'bg-[var(--accent)]/5 dark:bg-[var(--accent-hover)]/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    )}
                  >
                    {meta ? <meta.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden /> : <Network className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />}
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{entity.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{meta?.label ?? entity.type}</span>
                  </button>
                )
              })}
            </>
          )}

          {query.trim() && events.length > 0 && (
            <>
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Events</p>
              {events.map((event, i) => {
                const index = entities.length + i
                return (
                  <button
                    key={event.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activateItem({ kind: 'event', event })}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={clsx(
                      'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                      activeIndex === index ? 'bg-[var(--accent)]/5 dark:bg-[var(--accent-hover)]/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    )}
                  >
                    <Rss className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="flex-1">
                      <span className="block truncate text-slate-700 dark:text-slate-200">{event.title}</span>
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                        {event.source} · {timeAgo(event.publishedAt)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {query.trim() && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runFullSearch(query)}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-2.5 py-2 text-left text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/5 dark:border-slate-800 dark:hover:bg-[var(--accent-hover)]/40"
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
              See all results for "{query}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
