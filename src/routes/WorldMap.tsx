import { ErrorState } from '../components/feed/ErrorState'
import { EmptyState } from '../components/feed/EmptyState'
import { GeoIntelligenceMap } from '../components/map/GeoIntelligenceMap'
import { MapLegend } from '../components/map/MapLegend'
import { useMapSummary } from '../hooks/useMapSummary'

/**
 * The Geographic Intelligence Map: real per-country aggregates (a country
 * name alone is legitimate geography — no coordinates required) plus a
 * capped set of exact-coordinate markers, rendered as a flat editorial
 * atlas (Equal Earth projection, Africa-centered, real Natural Earth
 * boundary data via `world-atlas` — see GeoIntelligenceMap.tsx). Clicking a
 * country or marker reuses the existing, already-working `/feed?country=`
 * filter — no separate filtering mechanism exists for the map.
 */
export default function WorldMap() {
  const { summary, status, refresh } = useMapSummary()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Geographic Intelligence Map</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Where the world's significant events are happening — not a GPS pin for every article.
          Countries are shaded from real event data even without exact coordinates; hover or click
          a country for detail.
        </p>
      </div>

      {status === 'not-configured' && <EmptyState variant="not-configured" />}
      {status === 'error' && <ErrorState error={null} onRetry={refresh} title="Unable to load map data." />}
      {status === 'loading' && (
        <div className="flex h-[460px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          Loading real event geography…
        </div>
      )}

      {status === 'ready' && summary && (
        <>
          <GeoIntelligenceMap countries={summary.countries} markers={summary.markers} />
          <MapLegend />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {summary.countries.length.toLocaleString()} countries reporting real events in the last{' '}
            {Math.round(summary.windowHours / 24)} days
            {summary.unknownCount > 0 && (
              <>
                {' '}
                · {summary.unknownCount.toLocaleString()} events have no known location (neither a
                real country nor coordinates) and aren't shown on the map.
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
