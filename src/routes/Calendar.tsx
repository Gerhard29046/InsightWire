import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, Globe2 } from 'lucide-react'
import { clsx } from 'clsx'
import { categories, categoryById, type CategoryId } from '../lib/categories'
import { formatMonthYear, isSameDay, toDateKey } from '../lib/calendarData'
import type { NormalizedEvent } from '../lib/api/types'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { EmptyState } from '../components/feed/EmptyState'
import { ErrorState } from '../components/feed/ErrorState'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { EventImportance } from '../components/feed/EventImportance'
import { TagInput } from '../components/feed/TagInput'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildMonthGrid(monthStart: Date): Date[] {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Date[] = []
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(new Date(year, month, 1 - (firstWeekday - i)))
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d))
  }
  let trailing = 1
  while (cells.length % 7 !== 0) {
    cells.push(new Date(year, month + 1, trailing))
    trailing++
  }
  return cells
}

/** Local time-of-day with the viewer's own zone spelled out (e.g. "16:00 SAST") — never silently reinterprets the event's real UTC instant as an unlabeled local time. */
function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

function formatEventDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Calendar() {
  const today = new Date()
  const navigate = useNavigate()
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [activeCategories, setActiveCategories] = useState<Set<CategoryId>>(new Set())
  const [countries, setCountries] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const toggleCategory = (id: CategoryId) => {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // `[...activeCategories]` produces a brand-new array on every render even
  // when the Set's contents haven't changed. Passed unmemoized, that broke
  // useCalendarEvents' own useMemo (its `categories` dependency never
  // stayed referentially equal), which produced a new `filters` object on
  // every render, which re-triggered useEventsFeed's fetch effect on every
  // render — a perpetual refetch loop that never settled on 'ready'
  // (visible as the page endlessly flickering between loading and empty,
  // never actually showing data). Memoizing here, keyed on the Set itself,
  // fixes it: this only produces a new array when a category is actually toggled.
  const categoryList = useMemo(() => [...activeCategories], [activeCategories])

  const { events, status, error, refresh } = useCalendarEvents({
    categories: categoryList,
    countries,
    search,
  })

  // Events with no real startTime can't be placed on a calendar — excluded
  // from the grid/agenda rather than shown under a fabricated date. This
  // should be rare in practice (every connector feeding this view sets
  // startTime), but is a real, honest possibility the UI must not hide by crashing.
  const datedEvents = useMemo(() => events.filter((e): e is NormalizedEvent & { startTime: string } => !!e.startTime), [events])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof datedEvents>()
    for (const e of datedEvents) {
      const key = toDateKey(new Date(e.startTime))
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return map
  }, [datedEvents])

  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])

  const agendaEvents = useMemo(() => {
    if (selectedDate) {
      return eventsByDate.get(toDateKey(selectedDate)) ?? []
    }
    return datedEvents.slice(0, 12) // Already sorted soonest-first by the 'upcoming' sort mode.
  }, [datedEvents, eventsByDate, selectedDate])

  const coverage = useMemo(() => {
    const countrySet = new Set(datedEvents.map((e) => e.country))
    const sourceSet = new Set(datedEvents.map((e) => e.source))
    return { countries: countrySet.size, sources: sourceSet.size }
  }, [datedEvents])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Real, upcoming government, parliamentary, and public-sector events sourced from official
          connectors — no placeholder or demonstration events.
        </p>
        {status === 'ready' && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Coverage today: {coverage.countries} {coverage.countries === 1 ? 'country' : 'countries'} ·{' '}
            {coverage.sources} official {coverage.sources === 1 ? 'source' : 'sources'}. Real coverage grows as
            more verified connectors are added — this is never padded to look larger.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="text"
            aria-label="Search calendar events"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, people, institutions…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <TagInput label="Country" placeholder="Add a country…" values={countries} onChange={setCountries} />

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Category</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const active = activeCategories.has(cat.id)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-transparent text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300',
                  )}
                  style={active ? { backgroundColor: `var(${cat.colorVar})` } : undefined}
                >
                  <cat.icon className="h-3 w-3" aria-hidden />
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>

        {(activeCategories.size > 0 || countries.length > 0 || search !== '') && (
          <button
            type="button"
            onClick={() => {
              setActiveCategories(new Set())
              setCountries([])
              setSearch('')
            }}
            className="self-start text-xs font-medium text-slate-500 hover:text-sky-500 dark:text-slate-400"
          >
            Clear filters
          </button>
        )}
      </div>

      {status === 'not-configured' && <EmptyState variant="not-configured" />}
      {status === 'loading' && <LoadingSkeleton count={4} />}
      {status === 'error' && <ErrorState error={error} onRetry={refresh} />}
      {status === 'empty' && (
        <EmptyState
          variant="no-events"
          onRefresh={refresh}
          title="No upcoming events found for the selected filters."
          description="This calendar only ever shows real, sourced events — try widening the date range, or clearing the country/category filters."
        />
      )}

      {(status === 'ready' || status === 'loading-more') && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between px-1 pb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatMonthYear(monthCursor)}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1))
                    setSelectedDate(null)
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
              {WEEKDAY_LABELS.map((w) => (
                <div
                  key={w}
                  className="bg-white py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900 dark:text-slate-500"
                >
                  {w}
                </div>
              ))}
              {grid.map((day) => {
                const inMonth = day.getMonth() === monthCursor.getMonth()
                const dayEvents = eventsByDate.get(toDateKey(day)) ?? []
                const isToday = isSameDay(day, today)
                const isSelected = selectedDate !== null && isSameDay(day, selectedDate)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={clsx(
                      'flex min-h-[86px] flex-col items-start gap-1 bg-white p-1.5 text-left transition-colors dark:bg-slate-900',
                      !inMonth && 'opacity-40',
                      isSelected && 'ring-2 ring-inset ring-sky-400',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                        isToday ? 'bg-sky-500 text-white' : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {dayEvents.slice(0, 4).map((e) => (
                        <span
                          key={e.id}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: `var(${categoryById[e.category].colorVar})` }}
                          title={e.title}
                        />
                      ))}
                      {dayEvents.length > 4 && (
                        <span className="text-[10px] font-medium text-slate-400">+{dayEvents.length - 4}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {selectedDate
                ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                : 'Upcoming'}
            </h2>
            {agendaEvents.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No upcoming events found for the selected filters.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {agendaEvents.map((e) => {
                  const cat = categoryById[e.category]
                  const detailPath = `/feed/${encodeURIComponent(e.id)}`
                  const openDetail = () => navigate(detailPath)
                  return (
                    <li
                      key={e.id}
                      role="link"
                      tabIndex={0}
                      onClick={openDetail}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') openDetail()
                      }}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `color-mix(in srgb, var(${cat.colorVar}) 16%, transparent)` }}
                      >
                        <cat.icon className="h-3.5 w-3.5" style={{ color: `var(${cat.colorVar})` }} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                          {e.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
                          {!selectedDate && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" aria-hidden />
                              {formatEventDay(e.startTime)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden />
                            {formatEventTime(e.startTime)}
                          </span>
                          <span>{e.country}</span>
                          <span>{e.source}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <EventImportance importance={e.importance} />
                          {e.sourceUrl && (
                            <a
                              href={e.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                            >
                              View official source
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
