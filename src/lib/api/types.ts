import type { CategoryId } from '../categories'
import type { Severity } from '../severity'
import type { EventStatusId } from '@insightwire/shared'

/**
 * The canonical event contract lives in @insightwire/shared (used by the
 * worker's connectors too) — re-exported here so existing frontend imports
 * (`from '../lib/api/types'`) don't need to change.
 */
export type { NormalizedEvent, EventUpdate, EventStatusId, VerificationStatus } from '@insightwire/shared'

export type EventSortMode = 'latest' | 'importance' | 'trending' | 'confidence' | 'recently-updated' | 'upcoming'
export type EventTimeRange = 'any' | '1h' | '24h' | '7d' | '30d'

export interface EventFiltersState {
  search: string
  countries: string[]
  regions: string[]
  categories: CategoryId[]
  importance: Severity[]
  languages: string[]
  sources: string[]
  statuses: EventStatusId[]
  verifiedOnly: boolean
  futureOnly: boolean
  liveOnly: boolean
  breakingOnly: boolean
  dateFrom: string | null
  dateTo: string | null
  timeRange: EventTimeRange
}

export function createEmptyFilters(): EventFiltersState {
  return {
    search: '',
    countries: [],
    regions: [],
    categories: [],
    importance: [],
    languages: [],
    sources: [],
    statuses: [],
    verifiedOnly: false,
    futureOnly: false,
    liveOnly: false,
    breakingOnly: false,
    dateFrom: null,
    dateTo: null,
    timeRange: 'any',
  }
}

export function hasActiveFilters(filters: EventFiltersState): boolean {
  return (
    filters.search !== '' ||
    filters.countries.length > 0 ||
    filters.regions.length > 0 ||
    filters.categories.length > 0 ||
    filters.importance.length > 0 ||
    filters.languages.length > 0 ||
    filters.sources.length > 0 ||
    filters.statuses.length > 0 ||
    filters.verifiedOnly ||
    filters.futureOnly ||
    filters.liveOnly ||
    filters.breakingOnly ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.timeRange !== 'any'
  )
}

/**
 * Names exactly which real filters are active, for an honest "no results"
 * message — deliberately not a hardcoded "these categories have no live
 * source yet" list, which would go stale the moment a new connector is
 * added. Naming the actual selection is always accurate and never assumes
 * *why* it's empty (could be the category, the country, a combination, or
 * genuinely nothing having happened yet).
 */
export function describeActiveFilters(filters: EventFiltersState): string | null {
  const parts: string[] = []
  if (filters.search) parts.push(`Search: "${filters.search}"`)
  if (filters.regions.length > 0) parts.push(`Region: ${filters.regions.join(', ')}`)
  if (filters.countries.length > 0) parts.push(`Country: ${filters.countries.join(', ')}`)
  if (filters.categories.length > 0) parts.push(`Category: ${filters.categories.join(', ')}`)
  if (filters.importance.length > 0) parts.push(`Importance: ${filters.importance.join(', ')}`)
  if (filters.sources.length > 0) parts.push(`Source: ${filters.sources.join(', ')}`)
  if (filters.languages.length > 0) parts.push(`Language: ${filters.languages.join(', ')}`)
  if (filters.verifiedOnly) parts.push('Verified only')
  if (filters.liveOnly) parts.push('Live only')
  if (filters.futureOnly) parts.push('Future only')
  if (filters.breakingOnly) parts.push('Breaking only')
  if (filters.timeRange !== 'any') parts.push(`Time range: ${filters.timeRange}`)
  return parts.length > 0 ? parts.join(' · ') : null
}
