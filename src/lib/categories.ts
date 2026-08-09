import type { LucideIcon } from 'lucide-react'
import {
  Landmark,
  Building2,
  Gavel,
  TrendingUp,
  Vote,
  Mountain,
  Swords,
  FlaskConical,
} from 'lucide-react'
import type { CategoryId } from '@insightwire/shared'

export type { CategoryId }

export interface CategoryMeta {
  id: CategoryId
  label: string
  icon: LucideIcon
  /** CSS custom property (defined in index.css) carrying this category's fixed hue. */
  colorVar: string
}

// Order matches the README's category list, which in turn maps 1:1 onto the
// dataviz reference palette's fixed, colorblind-safe slot order — keep both
// in sync; do not reorder without re-validating the palette.
export const categories: CategoryMeta[] = [
  { id: 'government', label: 'Government', icon: Landmark, colorVar: '--cat-government' },
  { id: 'business', label: 'Business', icon: Building2, colorVar: '--cat-business' },
  { id: 'courts', label: 'Courts', icon: Gavel, colorVar: '--cat-courts' },
  { id: 'markets', label: 'Markets', icon: TrendingUp, colorVar: '--cat-markets' },
  { id: 'elections', label: 'Elections', icon: Vote, colorVar: '--cat-elections' },
  // Routine weather (forecasts, thunderstorm/wind statements, ordinary NWS
  // alerts) was removed entirely — InsightWire is not a weather platform
  // (see docs/decisions/0014-remove-weather-keep-natural-disasters.md).
  // This is the narrower, genuinely newsworthy subset: major earthquake,
  // tsunami, volcanic eruption, major cyclone, catastrophic flooding, major
  // wildfire — gated server-side by GDACS's own real alertlevel severity.
  { id: 'natural_disasters', label: 'Natural Disasters', icon: Mountain, colorVar: '--cat-natural-disasters' },
  { id: 'conflicts', label: 'Conflicts', icon: Swords, colorVar: '--cat-conflicts' },
  { id: 'science', label: 'Science', icon: FlaskConical, colorVar: '--cat-science' },
]

export const categoryById = Object.fromEntries(
  categories.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryMeta>
