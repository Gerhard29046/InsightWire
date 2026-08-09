import { Link } from 'react-router-dom'
import { Map } from 'lucide-react'
import { useMapSummary } from '../../hooks/useMapSummary'

/**
 * A link-out card to the real Geographic Intelligence Map (`/map`) — not an
 * embedded mini-map in this phase (see WorldMap.tsx's own doc comment for
 * why). Summarized from GET /map/summary's real country/breaking counts,
 * not a coordinate-coverage percentage — a country name with no lat/lng is
 * legitimate geography for this feature, so leading with "coordinates
 * covered" would contradict the map's own point.
 */
export function MapPlaceholderCard() {
  const { summary, status } = useMapSummary()
  const countriesReporting = summary?.countries.length ?? 0
  const breaking = summary?.countries.reduce((sum, c) => sum + c.breaking, 0) ?? 0

  return (
    <Link
      to="/map"
      className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6 text-center transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-[var(--accent-hover)]/50 dark:hover:bg-[var(--accent-hover)]/20"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
        <Map className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">Geographic Intelligence Map</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {status === 'ready' && summary
          ? `${countriesReporting.toLocaleString()} countries reporting · ${breaking.toLocaleString()} breaking`
          : 'Open map'}
      </p>
    </Link>
  )
}
