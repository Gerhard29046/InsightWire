import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { AlertTriangle, Globe2, Radar, RefreshCw, Rss } from 'lucide-react'
import { StatCard } from '../components/dashboard/StatCard'
import { CategoryBreakdown } from '../components/dashboard/CategoryBreakdown'
import { RegionBreakdown } from '../components/dashboard/RegionBreakdown'
import { MapPlaceholderCard } from '../components/dashboard/MapPlaceholderCard'
import { WorldTimeline } from '../components/dashboard/WorldTimeline'
import { EventCard } from '../components/feed/EventCard'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { EmptyState } from '../components/feed/EmptyState'
import { useDashboardSummary } from '../hooks/useDashboardSummary'
import { regions } from '../lib/api/taxonomy'
import type { RegionLabel } from '@insightwire/shared'

/** Ticks once a second purely to re-render "Updated Xs ago" — the timestamp itself only ever changes on a real successful fetch (see useDashboardSummary's lastUpdatedAt). */
function useClockTick(intervalMs: number): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}

function formatUpdatedAgo(lastUpdatedAt: Date | null): string {
  if (!lastUpdatedAt) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - lastUpdatedAt.getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

/** Builds a real /feed deep link that carries the current region quick-filter, matching EventsFeed.tsx's own `?region=` URL param (see its filtersFromSearchParams). */
function feedLink(region: RegionLabel, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra)
  if (region !== 'Global') params.set('region', region)
  const query = params.toString()
  return `/feed${query ? `?${query}` : ''}`
}

export default function Dashboard() {
  const [region, setRegion] = useState<RegionLabel>('Global')
  const { summary, status, error, lastUpdatedAt, refresh } = useDashboardSummary(region === 'Global' ? [] : [region])
  useClockTick(1000) // forces a re-render every second so "Updated Xs ago" stays live without refetching

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          What matters right now — a real aggregation of the same Intelligence API that powers the
          Events Feed, not a separately calculated view.
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span>Window: last 24 hours</span>
          <span aria-hidden>·</span>
          <span>Auto-refreshes every 60s</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <RefreshCw className={status === 'loading' ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} aria-hidden />
            Updated {formatUpdatedAgo(lastUpdatedAt)}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {regions.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRegion(r)}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              region === r
                ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent-hover)] dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {status === 'not-configured' && <EmptyState variant="not-configured" />}

      {status === 'error' && (
        <ErrorState error={error} onRetry={refresh} title="Unable to load live intelligence." />
      )}

      {status === 'loading' && !summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LoadingSkeleton count={4} />
        </div>
      )}

      {summary && (status === 'ready' || status === 'loading') && (
        <>
          {summary.eventsTracked24h === 0 ? (
            <EmptyState
              variant="no-events"
              onRefresh={refresh}
              title="No live intelligence detected in the selected period."
              description={
                region === 'Global'
                  ? 'No real events were tracked in the last 24 hours. This reflects the actual data — nothing is fabricated to fill the page.'
                  : `No real events were tracked for ${region} in the last 24 hours. Try Global or another region.`
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={Rss}
                  label="Events tracked (24h)"
                  value={String(summary.eventsTracked24h)}
                  to={feedLink(region)}
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Breaking alerts (24h)"
                  value={String(summary.highPriorityAlerts24h)}
                  to={feedLink(region, { breaking: 'true' })}
                />
                <StatCard
                  icon={Radar}
                  label="Countries reporting"
                  value={String(summary.countriesReporting)}
                  to="/entities?type=country"
                />
                <StatCard icon={Globe2} label="Sources reporting" value={String(summary.sourcesReporting)} />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="flex flex-col gap-3 xl:col-span-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Significant events</h2>
                    <Link to={feedLink(region)} className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
                      View full feed →
                    </Link>
                  </div>
                  <div className="flex flex-col gap-3">
                    {summary.highestSignalEvents.length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        No events in the last 24 hours.
                      </p>
                    ) : (
                      summary.highestSignalEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />)
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <CategoryBreakdown breakdown={summary.categoryBreakdown} />
                  {region === 'Global' && <RegionBreakdown breakdown={summary.regionBreakdown} />}
                  <MapPlaceholderCard />
                </div>
              </div>
            </>
          )}
        </>
      )}

      <WorldTimeline />
    </div>
  )
}
