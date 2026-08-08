import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Globe2 } from 'lucide-react'
import { clsx } from 'clsx'
import {
  calendarCategories,
  calendarCategoryById,
  countries,
  industries,
  mockCalendarEvents,
  formatMonthYear,
  toDateKey,
  isSameDay,
  type CalendarCategoryId,
} from '../lib/calendarData'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ALL_COUNTRIES = 'All countries'
const ALL_INDUSTRIES = 'All industries'

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

export default function Calendar() {
  const today = new Date()
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [activeCategories, setActiveCategories] = useState<Set<CalendarCategoryId>>(new Set())
  const [country, setCountry] = useState(ALL_COUNTRIES)
  const [industry, setIndustry] = useState(ALL_INDUSTRIES)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const toggleCategory = (id: CalendarCategoryId) => {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredEvents = useMemo(
    () =>
      mockCalendarEvents.filter((e) => {
        if (activeCategories.size > 0 && !activeCategories.has(e.category)) return false
        if (country !== ALL_COUNTRIES && e.country !== country) return false
        if (industry !== ALL_INDUSTRIES && e.industry !== industry) return false
        return true
      }),
    [activeCategories, country, industry],
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof filteredEvents>()
    for (const e of filteredEvents) {
      const list = map.get(e.date)
      if (list) list.push(e)
      else map.set(e.date, [e])
    }
    return map
  }, [filteredEvents])

  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])

  const agendaEvents = useMemo(() => {
    if (selectedDate) {
      return filteredEvents
        .filter((e) => e.date === toDateKey(selectedDate))
        .sort((a, b) => a.time.localeCompare(b.time))
    }
    return [...filteredEvents].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8)
  }, [filteredEvents, selectedDate])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Calendars</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upcoming events, government and parliament sessions, court dates, and company earnings
          in one unified calendar.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-slate-400" aria-hidden />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option>{ALL_COUNTRIES}</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option>{ALL_INDUSTRIES}</option>
            {industries.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          {(activeCategories.size > 0 || country !== ALL_COUNTRIES || industry !== ALL_INDUSTRIES) && (
            <button
              type="button"
              onClick={() => {
                setActiveCategories(new Set())
                setCountry(ALL_COUNTRIES)
                setIndustry(ALL_INDUSTRIES)
              }}
              className="text-xs font-medium text-slate-500 hover:text-sky-500 dark:text-slate-400"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {calendarCategories.map((cat) => {
            const active = activeCategories.has(cat.id)
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? clsx('border-transparent text-white', cat.dot)
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300',
                )}
              >
                <cat.icon className="h-3 w-3" aria-hidden />
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-1 pb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {formatMonthYear(monthCursor)}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
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
                onClick={() =>
                  setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
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
                      isToday
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <div className="flex flex-wrap gap-0.5">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className={clsx('h-1.5 w-1.5 rounded-full', calendarCategoryById[e.category].dot)}
                        title={e.title}
                      />
                    ))}
                    {dayEvents.length > 4 && (
                      <span className="text-[10px] font-medium text-slate-400">
                        +{dayEvents.length - 4}
                      </span>
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
              ? selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })
              : 'Upcoming'}
          </h2>
          {agendaEvents.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No events match these filters.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {agendaEvents.map((e) => {
                const cat = calendarCategoryById[e.category]
                return (
                  <li key={e.id} className="flex items-start gap-2.5">
                    <span
                      className={clsx(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
                        cat.bg,
                      )}
                    >
                      <cat.icon className={clsx('h-3.5 w-3.5', cat.text)} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                        {e.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {!selectedDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden />
                          {e.time}
                        </span>
                        <span>{e.country}</span>
                        <span>{e.type}</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
