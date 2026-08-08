import type { CategoryId } from '../categories'
import type { Severity } from '../severity'

/**
 * The canonical event contract lives in @insightwire/shared (used by the
 * worker's connectors too) — re-exported here so existing frontend imports
 * (`from '../lib/api/types'`) don't need to change.
 */
export type { NormalizedEvent, EventUpdate, EventStatusId, VerificationStatus } from '@insightwire/shared'

export type EventSortMode = 'latest' | 'importance' | 'trending' | 'confidence' | 'recently-updated'
export type EventTimeRange = 'any' | '1h' | '24h' | '7d' | '30d'

export interface EventFiltersState {
  search: string
  countries: string[]
  regions: string[]
  categories: CategoryId[]
  importance: Severity[]
  languages: string[]
  sources: string[]
  verifiedOnly: boolean
  futureOnly: boolean
  liveOnly: boolean
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
    verifiedOnly: false,
    futureOnly: false,
    liveOnly: false,
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
    filters.verifiedOnly ||
    filters.futureOnly ||
    filters.liveOnly ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.timeRange !== 'any'
  )
}
