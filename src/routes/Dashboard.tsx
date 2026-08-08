import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Globe2, Radar, Rss } from 'lucide-react'
import { StatCard } from '../components/dashboard/StatCard'
import { CategoryBreakdown } from '../components/dashboard/CategoryBreakdown'
import { EventCard } from '../components/feed/EventCard'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { fetchEvents } from '../lib/api/events'
import { createEmptyFilters } from '../lib/api/types'
import type { NormalizedEvent } from '../lib/api/types'

interface DashboardSummary {
  topEvents: NormalizedEvent[]
  eventsTracked24h: number
  highPriorityCount: number
  countriesReporting: number
  sourcesReporting: number
}

/**
 * All real, all from the live Intelligence API — no mock data. Every number
 * is either an exact PostgREST count (`totalCount`) or a distinct-value
 * count over the actually-fetched sample, never a fabricated delta/percentage
 * (the old mock cards' "+18% vs yesterday" had nothing real behind them —
 * dropped rather than replaced with an equally fake real-looking number).
 */
function useDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const baseFilters = { ...createEmptyFilters(), timeRange: '24h' as const }

    Promise.all([
      fetchEvents({ filters: baseFilters, sort: 'importance', pageSize: 6 }),
      fetchEvents({ filters: { ...baseFilters, importance: ['critical', 'high'] }, sort: 'latest', pageSize: 1 }),
      // Separate, larger sample just for the country/source diversity counts —
      // the top-6-by-priority set alone tends to collapse to whichever
      // connector had the highest-scoring alerts that hour (e.g. NWS during
      // active weather), which would honestly reflect the data but understate
      // how many distinct countries/sources are actually reporting.
      fetchEvents({ filters: baseFilters, sort: 'latest', pageSize: 200 }),
    ])
      .then(([top, highPriority, diversitySample]) => {
        if (cancelled) return
        setSummary({
          topEvents: top.events,
          eventsTracked24h: top.totalCount ?? top.events.length,
          highPriorityCount: highPriority.totalCount ?? highPriority.events.length,
          countriesReporting: new Set(diversitySample.events.map((e) => e.country)).size,
          sourcesReporting: new Set(diversitySample.events.map((e) => e.source)).size,
        })
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { summary, status, error }
}

export default function Dashboard() {
  const { summary, status, error } = useDashboardSummary()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Live signal across government, markets, courts, and beyond — refreshed continuously.
        </p>
      </div>

      {status === 'error' && <ErrorState error={error} onRetry={() => window.location.reload()} />}

      {status === 'loading' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LoadingSkeleton count={4} />
        </div>
      )}

      {status === 'ready' && summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Rss} label="Events tracked (24h)" value={String(summary.eventsTracked24h)} />
            <StatCard icon={AlertTriangle} label="High-priority alerts (24h)" value={String(summary.highPriorityCount)} />
            <StatCard icon={Radar} label="Countries reporting" value={String(summary.countriesReporting)} />
            <StatCard icon={Globe2} label="Sources reporting" value={String(summary.sourcesReporting)} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="flex flex-col gap-3 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Highest-signal events</h2>
                <Link to="/feed" className="text-xs font-medium text-sky-500 hover:text-sky-600">
                  View full feed →
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {summary.topEvents.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">No events in the last 24 hours.</p>
                ) : (
                  summary.topEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />)
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <CategoryBreakdown events={summary.topEvents} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
