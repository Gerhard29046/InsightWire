import type { LucideIcon } from 'lucide-react'
import {
  Landmark,
  Building2,
  Gavel,
  TrendingUp,
  Vote,
  CloudLightning,
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
  { id: 'weather', label: 'Weather & Disasters', icon: CloudLightning, colorVar: '--cat-weather' },
  { id: 'conflicts', label: 'Conflicts', icon: Swords, colorVar: '--cat-conflicts' },
  { id: 'science', label: 'Science', icon: FlaskConical, colorVar: '--cat-science' },
]

export const categoryById = Object.fromEntries(
  categories.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryMeta>
