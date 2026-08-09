/**
 * Small, restrained legend covering the two things the map actually
 * encodes: how precisely a location is known (dot = exact coordinates,
 * shaded shape = country-level — real geography with no lat/lng required)
 * and how significant an event is (reusing the existing priority/importance
 * tiers, not a new scoring system — see GeoIntelligenceMap.tsx).
 */
export function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-500 dark:text-slate-400">Geographic precision</span>
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden />
          Exact location
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]/50" aria-hidden />
          Country-level
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-500 dark:text-slate-400">Significance</span>
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--status-critical)' }} aria-hidden />
          Breaking
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--status-serious)' }} aria-hidden />
          Significant
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden />
          Routine
        </span>
      </div>
    </div>
  )
}
