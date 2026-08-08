import { useMemo, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { clsx } from 'clsx'
import { EventCard } from '../components/dashboard/EventCard'
import { categoryById } from '../lib/categories'
import { severityMeta } from '../lib/severity'
import { mockEvents, mockSavedSearches, matchesSavedSearch } from '../lib/mockData'

export default function Alerts() {
  const [activeIds, setActiveIds] = useState<Set<string>>(
    () => new Set(mockSavedSearches.map((s) => s.id)),
  )

  const toggle = (id: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sections = useMemo(
    () =>
      mockSavedSearches
        .filter((s) => activeIds.has(s.id))
        .map((search) => ({
          search,
          events: mockEvents
            .filter((e) => matchesSavedSearch(e, search))
            .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
        })),
    [activeIds],
  )

  const totalAlerts = new Set(sections.flatMap((s) => s.events.map((e) => e.id))).size
  const newAlerts = new Set(
    sections
      .flatMap((s) => s.events)
      .filter((e) => Date.now() - new Date(e.publishedAt).getTime() < 30 * 60_000)
      .map((e) => e.id),
  ).size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Live Alerts</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time notifications for high-importance and high-virality events matching your
            saved searches.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <Bell className="h-4 w-4 text-sky-500" aria-hidden />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {totalAlerts}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">active</span>
          {newAlerts > 0 && (
            <span
              className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--status-critical)' }}
            >
              {newAlerts} new
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {mockSavedSearches.map((search) => {
          const active = activeIds.has(search.id)
          const sevMeta = severityMeta[search.minSeverity]
          return (
            <button
              key={search.id}
              type="button"
              onClick={() => toggle(search.id)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300'
                  : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-800 dark:text-slate-500',
              )}
            >
              {active ? (
                <Bell className="h-3 w-3" aria-hidden />
              ) : (
                <BellOff className="h-3 w-3" aria-hidden />
              )}
              {search.name}
              <span
                className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                style={{
                  color: `var(${sevMeta.colorVar})`,
                  backgroundColor: `color-mix(in srgb, var(${sevMeta.colorVar}) 16%, transparent)`,
                }}
              >
                {sevMeta.label}+
              </span>
            </button>
          )
        })}
      </div>

      {sections.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            No saved searches active
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Turn one on above to see matching alerts.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {sections.map(({ search, events }) => (
            <div key={search.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {search.name}
                  </h2>
                  <div className="flex items-center gap-1">
                    {search.categories.length === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        all categories
                      </span>
                    ) : (
                      search.categories.map((c) => {
                        const cat = categoryById[c]
                        return (
                          <cat.icon
                            key={c}
                            className="h-3.5 w-3.5"
                            style={{ color: `var(${cat.colorVar})` }}
                            aria-hidden
                          />
                        )
                      })
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {events.length} match{events.length === 1 ? '' : 'es'}
                </span>
              </div>

              {events.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {events.slice(0, 5).map((event, i) => (
                    <EventCard key={event.id} event={event} index={i} />
                  ))}
                  {events.length > 5 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      +{events.length - 5} earlier match{events.length - 5 === 1 ? '' : 'es'}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  No matching events right now.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
