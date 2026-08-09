import { useMemo, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { clsx } from 'clsx'
import { EventCard } from '../components/feed/EventCard'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { EmptyState } from '../components/feed/EmptyState'
import { categoryById, type CategoryId } from '../lib/categories'
import { severityMeta, severityOrder, type Severity } from '../lib/severity'
import { useEventsFeed } from '../hooks/useEventsFeed'
import type { EventFiltersState, NormalizedEvent } from '../lib/api/types'
import { createEmptyFilters } from '../lib/api/types'

interface AlertPreset {
  id: string
  name: string
  /** Empty means "any category" — same convention as EventFiltersState.categories. */
  categories: CategoryId[]
  minSeverity: Severity
}

/**
 * Filter presets, not event data — these just describe which real events
 * qualify as an "alert" for a given watch. There is no saved-search
 * persistence yet (no backend table for it), so this list is a fixed
 * starting set rather than user-editable; every event shown under a preset
 * comes from the live Intelligence API, never fabricated.
 */
const ALERT_PRESETS: AlertPreset[] = [
  { id: 'critical-any', name: 'Critical — any category', categories: [], minSeverity: 'critical' },
  { id: 'markets-business', name: 'Markets & business shocks', categories: ['markets', 'business'], minSeverity: 'high' },
  { id: 'conflict-escalation', name: 'Conflict escalation', categories: ['conflicts'], minSeverity: 'medium' },
  { id: 'election-integrity', name: 'Election integrity', categories: ['elections'], minSeverity: 'medium' },
]

/** Loosest minSeverity across all presets — fetched once server-side, then each preset narrows further client-side, so this is a real filter (not a client-sampled subset), just shared across sections. */
const ALERT_IMPORTANCE_FLOOR: Severity[] = ['critical', 'high', 'medium']
const ALERTS_PAGE_SIZE = 100
const ALERTS_POLL_INTERVAL_MS = 60_000
const NEW_ALERT_WINDOW_MS = 30 * 60_000

function matchesPreset(event: NormalizedEvent, preset: AlertPreset): boolean {
  const categoryMatch = preset.categories.length === 0 || preset.categories.includes(event.category)
  const severeEnough = severityOrder.indexOf(event.importance) <= severityOrder.indexOf(preset.minSeverity)
  return categoryMatch && severeEnough
}

const alertsFilters: EventFiltersState = {
  ...createEmptyFilters(),
  importance: ALERT_IMPORTANCE_FLOOR,
  timeRange: '24h',
}

export default function Alerts() {
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(ALERT_PRESETS.map((p) => p.id)))
  const { events, status, error, refresh } = useEventsFeed(alertsFilters, 'latest', ALERTS_PAGE_SIZE, ALERTS_POLL_INTERVAL_MS)

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
      ALERT_PRESETS.filter((p) => activeIds.has(p.id)).map((preset) => ({
        preset,
        events: events.filter((e) => matchesPreset(e, preset)),
      })),
    [activeIds, events],
  )

  const totalAlerts = new Set(sections.flatMap((s) => s.events.map((e) => e.id))).size
  const newAlerts = new Set(
    sections
      .flatMap((s) => s.events)
      .filter((e) => Date.now() - new Date(e.publishedAt).getTime() < NEW_ALERT_WINDOW_MS)
      .map((e) => e.id),
  ).size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Live Alerts</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real events from the Intelligence API matching high-importance watch categories — not
            a separately calculated view.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <Bell className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{totalAlerts}</span>
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
        {ALERT_PRESETS.map((preset) => {
          const active = activeIds.has(preset.id)
          const sevMeta = severityMeta[preset.minSeverity]
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => toggle(preset.id)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent-hover)] dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]'
                  : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-slate-800 dark:text-slate-500',
              )}
            >
              {active ? <Bell className="h-3 w-3" aria-hidden /> : <BellOff className="h-3 w-3" aria-hidden />}
              {preset.name}
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

      {status === 'not-configured' && <EmptyState variant="not-configured" />}

      {status === 'error' && <ErrorState error={error} onRetry={refresh} title="Unable to load live alerts." />}

      {status === 'loading' && <LoadingSkeleton count={4} />}

      {(status === 'ready' || status === 'empty') && (
        <>
          {sections.length === 0 ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No watches active</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Turn one on above to see matching alerts.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {sections.map(({ preset, events: matches }) => (
                <div key={preset.id} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{preset.name}</h2>
                      <div className="flex items-center gap-1">
                        {preset.categories.length === 0 ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">all categories</span>
                        ) : (
                          preset.categories.map((c) => {
                            const cat = categoryById[c]
                            return <cat.icon key={c} className="h-3.5 w-3.5" style={{ color: `var(${cat.colorVar})` }} aria-hidden />
                          })
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      {matches.length} match{matches.length === 1 ? '' : 'es'}
                    </span>
                  </div>

                  {matches.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {matches.slice(0, 5).map((event, i) => (
                        <EventCard key={event.id} event={event} index={i} />
                      ))}
                      {matches.length > 5 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          +{matches.length - 5} earlier match{matches.length - 5 === 1 ? '' : 'es'}
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
        </>
      )}
    </div>
  )
}
