import { Link } from 'react-router-dom'
import { Map } from 'lucide-react'
import { useGeoReadiness } from '../../hooks/useGeoReadiness'

/**
 * Reserved space for a future World Event Map — see worker/src/api/mapApi.ts
 * and src/routes/WorldMap.tsx's own doc comments for the intended
 * world → continent → country → event → detail data contract. No map
 * library is loaded here; this is a fixed-height placeholder honest about
 * real coordinate coverage, not a generic "coming soon."
 */
export function MapPlaceholderCard() {
  const { readiness, status } = useGeoReadiness()
  const total = readiness ? readiness.withCoordinates + readiness.withoutCoordinates : 0

  return (
    <Link
      to="/map"
      className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6 text-center transition-colors hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-sky-800 dark:hover:bg-sky-950/20"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
        <Map className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">World Event Map</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {status === 'ready' && readiness
          ? `${readiness.withCoordinates.toLocaleString()} of ${total.toLocaleString()} real events have coordinates today`
          : 'Coming soon'}
      </p>
    </Link>
  )
}
