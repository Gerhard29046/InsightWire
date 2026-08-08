import { Map } from 'lucide-react'
import { motion } from 'framer-motion'
import { useGeoReadiness } from '../hooks/useGeoReadiness'

/**
 * A prepared placeholder, not a built map — see Phase 5 of the Global Feeds
 * plan. The intended future data contract (documented here so the boundary
 * is clear without building any of it yet): world → continent → country →
 * event → detail, each level filtering `GET /events` by the real `country`
 * field the same way the Events Feed's region/country filters already do.
 * No map-rendering library is added in this phase.
 */
export default function WorldMap() {
  const { readiness, status } = useGeoReadiness()
  const total = readiness ? readiness.withCoordinates + readiness.withoutCoordinates : 0
  const pct = readiness && total > 0 ? Math.round((readiness.withCoordinates / total) * 100) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
        <Map className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">World Map</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Geospatial view of tracked events — conflicts, disasters, elections, and more. Not built
        yet; here's the real state of the data it would need.
      </p>

      {status === 'loading' && (
        <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">Checking real coordinate coverage…</p>
      )}
      {status === 'not-configured' && (
        <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">
          Backend not connected — coordinate coverage can't be checked yet.
        </p>
      )}
      {status === 'error' && (
        <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">Couldn't load coordinate coverage right now.</p>
      )}
      {status === 'ready' && readiness && (
        <div className="mt-5 w-full max-w-xs">
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {readiness.withCoordinates.toLocaleString()}
            <span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">
              / {total.toLocaleString()} events have coordinates
            </span>
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-sky-500 dark:bg-sky-400" style={{ width: `${pct ?? 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {readiness.withoutCoordinates.toLocaleString()} real events currently have no single
            point location (most text-only government/news sources report a country, not
            coordinates) — a real gap a future map would need to represent honestly, e.g. by
            country-level shading rather than pins.
          </p>
        </div>
      )}
    </motion.div>
  )
}
