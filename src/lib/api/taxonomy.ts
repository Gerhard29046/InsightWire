import type { EventSortMode } from './types'

/**
 * Fixed filter vocabulary — geographic regions and languages are stable
 * classification schemes, not event data, so they're safe to list here.
 * Country and source are deliberately NOT enumerated this way: which
 * countries/sources actually have events depends entirely on which
 * connectors the backend has live, so those filters are free-text tag
 * inputs instead of a canned list.
 */
export const regions = [
  'Global',
  'North America',
  'South America',
  'Europe',
  'Middle East',
  'Africa',
  'Asia-Pacific',
] as const

export type RegionLabel = (typeof regions)[number]

export interface LanguageOption {
  code: string
  label: string
}

export const languages: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
]

export const timeRangeOptions: { value: 'any' | '1h' | '24h' | '7d' | '30d'; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

export const sortOptions: { value: EventSortMode; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'importance', label: 'Most important' },
  { value: 'trending', label: 'Trending' },
  { value: 'confidence', label: 'Highest confidence' },
  { value: 'recently-updated', label: 'Recently updated' },
]
