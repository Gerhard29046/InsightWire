import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { resolveTopologyName } from '@insightwire/shared'
import { loadWorldTopology, type CountryFeatureCollection } from '../../lib/map/worldTopology'
import type { CountryAggregate, MapMarker } from '../../lib/api/map'

const WIDTH = 960
const HEIGHT = 460

/** Excluded only from the fit/scale calculation (see the projection setup below) — still rendered normally. Real, remote, far-Pacific outliers whose only effect on an Africa-centered frame is to force everything else smaller. */
const FIT_EXCLUDED_NAMES = new Set(['New Zealand', 'Fiji', 'Fr. S. Antarctic Lands', 'Falkland Is.', 'New Caledonia'])

interface GeoIntelligenceMapProps {
  countries: CountryAggregate[]
  markers: MapMarker[]
}

type Tier = 'breaking' | 'significant' | 'routine' | 'none'

function tierOf(agg: CountryAggregate | undefined): Tier {
  if (!agg || agg.total === 0) return 'none'
  if (agg.breaking > 0) return 'breaking'
  if (agg.significant > 0) return 'significant'
  return 'routine'
}

function tierColor(tier: Tier): string {
  switch (tier) {
    case 'breaking':
      return 'var(--status-critical)'
    case 'significant':
      return 'var(--status-serious)'
    case 'routine':
      return 'var(--accent)' // follows the site's configured accent — same signal as "has real activity" everywhere else
    case 'none':
      return 'transparent'
  }
}

function markerTier(marker: MapMarker): Tier {
  if ((marker.priorityScore ?? 0) >= 60) return 'breaking'
  if (marker.importance === 'high' || marker.importance === 'critical') return 'significant'
  return 'routine'
}

function markerRadius(tier: Tier): number {
  return tier === 'breaking' ? 4.5 : tier === 'significant' ? 3.2 : 1.8
}

interface HoverInfo {
  name: string
  agg: CountryAggregate | undefined
  x: number
  y: number
}

/**
 * A flat editorial atlas, not a navigation map: Equal Earth projection
 * (equal-area, doesn't inflate high-latitude landmasses the way Mercator
 * does), rotated so Africa's real centroid (~20°E) sits at the horizontal
 * center, fit to every real country boundary except Antarctica (excluded
 * from both the fit and the render — no real event in this pipeline
 * originates there, and including it would waste most of the frame on
 * empty ice). No tiles, no roads, no street labels, no pan/zoom controls.
 *
 * Country fill is driven entirely by real server-computed aggregates
 * (`countries`, from GET /map/summary) — a country with zero real events
 * this window, or one whose real name doesn't resolve to a topology
 * feature (see resolveTopologyName's own doc comment), is rendered with no
 * fill at all: an honest outline, never implied activity that isn't real.
 * Markers are the capped, priority-ordered exact-coordinate subset from
 * the same summary — never fabricated from a country's shape or centroid.
 */
export function GeoIntelligenceMap({ countries, markers }: GeoIntelligenceMapProps) {
  const navigate = useNavigate()
  const [topology, setTopology] = useState<CountryFeatureCollection | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    loadWorldTopology().then((topo) => {
      if (!cancelled) setTopology(topo)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const aggByCountry = useMemo(() => new Map(countries.map((c) => [c.country, c])), [countries])

  // Reverse lookup: topology feature name -> real country string — built
  // once from the real aggregates, not scanned per feature per render.
  const countryByTopologyName = useMemo(() => {
    const map = new Map<string, string>()
    for (const country of aggByCountry.keys()) {
      const topologyName = resolveTopologyName(country)
      if (topologyName) map.set(topologyName, country)
    }
    return map
  }, [aggByCountry])

  // One projection instance, reused for both country paths and marker
  // points — computing it twice risked the two silently drifting apart.
  const { path, features, projection } = useMemo(() => {
    if (!topology) return { path: null, features: [], projection: null }
    const renderable = topology.features.filter((f) => f.properties.name !== 'Antarctica')
    const proj = geoEqualEarth().rotate([-20, 0])
    // Fitting to every rendered feature (including far-Pacific outliers like
    // New Zealand/Fiji, ~170-180° from the rotated center) forces the whole
    // frame to zoom out to cover them, which shrinks and de-centers Africa —
    // the opposite of the "Africa visually central" requirement. These
    // outliers are still rendered (never hidden), just excluded from the
    // *scale/center calculation* — the same framing choice real print
    // atlases make when centering on a specific region.
    const fitReference = renderable.filter((f) => !FIT_EXCLUDED_NAMES.has(f.properties.name))
    proj.fitExtent(
      [
        [8, 8],
        [WIDTH - 8, HEIGHT - 8],
      ],
      { type: 'FeatureCollection', features: fitReference },
    )
    return { path: geoPath(proj), features: renderable, projection: proj }
  }, [topology])

  const projectedMarkers = useMemo(() => {
    if (!projection) return []
    return markers
      .map((m) => {
        const point = projection([m.lng, m.lat])
        return point ? { marker: m, x: point[0], y: point[1] } : null
      })
      .filter((v): v is { marker: MapMarker; x: number; y: number } => v !== null)
      // Render breaking/significant last (on top) so they're never hidden under routine dots.
      .sort((a, b) => (a.marker.priorityScore ?? 0) - (b.marker.priorityScore ?? 0))
  }, [projection, markers])

  if (!topology || !path) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
        Loading world boundaries…
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Geographic Intelligence Map">
        <g>
          {features.map((f) => {
            const name = f.properties.name
            const matchedCountry = countryByTopologyName.get(name)
            const agg = matchedCountry ? aggByCountry.get(matchedCountry) : undefined
            const tier = tierOf(agg)
            const d = path(f) ?? undefined
            return (
              <path
                key={String(f.id ?? name)}
                d={d}
                fill={tier === 'none' ? 'rgba(148, 163, 184, 0.08)' : tierColor(tier)}
                fillOpacity={tier === 'routine' ? 0.35 : tier === 'none' ? 1 : 0.75}
                stroke="rgba(148, 163, 184, 0.35)"
                strokeWidth={0.5}
                className={matchedCountry ? 'cursor-pointer transition-opacity hover:opacity-80' : undefined}
                onMouseMove={(e) => {
                  if (!matchedCountry) return
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setHover({ name, agg, x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
                onMouseLeave={() => setHover((h) => (h?.name === name ? null : h))}
                onClick={() => {
                  if (matchedCountry) navigate(`/feed?country=${encodeURIComponent(matchedCountry)}`)
                }}
              />
            )
          })}
        </g>
        <g>
          {projectedMarkers.map(({ marker, x, y }, i) => {
            const tier = markerTier(marker)
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={markerRadius(tier)}
                fill={tierColor(tier)}
                fillOpacity={0.9}
                stroke="rgba(15, 23, 42, 0.6)"
                strokeWidth={0.5}
                className="cursor-pointer"
                onClick={() => navigate(`/feed?country=${encodeURIComponent(marker.country)}`)}
              >
                <title>
                  {marker.country !== 'Global' ? marker.country : 'Exact location'} — {marker.importance}
                </title>
              </circle>
            )
          })}
        </g>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="font-semibold text-slate-900 dark:text-white">{hover.name}</p>
          {hover.agg ? (
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              {hover.agg.total} events
              {hover.agg.breaking > 0 && <> · {hover.agg.breaking} breaking</>}
              {hover.agg.significant > 0 && <> · {hover.agg.significant} significant</>}
            </p>
          ) : (
            <p className="mt-0.5 text-slate-400 dark:text-slate-500">No events this window</p>
          )}
        </div>
      )}
    </div>
  )
}
