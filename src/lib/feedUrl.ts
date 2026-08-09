import type { CategoryId } from './categories'
import type { Severity } from './severity'
import type { EventStatusId } from '@insightwire/shared'
import { createEmptyFilters, type EventFiltersState, type EventSortMode, type EventTimeRange } from './api/types'

/**
 * The Global Events Feed's own `/feed?...` URL scheme (moved out of
 * `EventsFeed.tsx` so both that route and the Journalist Workspace's "Open"
 * action on a saved search can share it without duplicating it or forcing a
 * route file to export non-component values).
 */
export function filtersFromSearchParams(params: URLSearchParams): EventFiltersState {
  const base = createEmptyFilters()
  return {
    ...base,
    search: params.get('q') ?? '',
    countries: params.getAll('country'),
    regions: params.getAll('region'),
    categories: params.getAll('category') as CategoryId[],
    importance: params.getAll('importance') as Severity[],
    languages: params.getAll('language'),
    sources: params.getAll('source'),
    statuses: params.getAll('status') as EventStatusId[],
    verifiedOnly: params.get('verified') === 'true',
    liveOnly: params.get('live') === 'true',
    futureOnly: params.get('future') === 'true',
    breakingOnly: params.get('breaking') === 'true',
    dateFrom: params.get('from'),
    dateTo: params.get('to'),
    timeRange: (params.get('timeRange') as EventTimeRange) ?? 'any',
  }
}

export function searchParamsFromFilters(filters: EventFiltersState, sort: EventSortMode): URLSearchParams {
  const params = new URLSearchParams()
  if (sort !== 'latest') params.set('sort', sort)
  if (filters.search) params.set('q', filters.search)
  filters.countries.forEach((v) => params.append('country', v))
  filters.regions.forEach((v) => params.append('region', v))
  filters.categories.forEach((v) => params.append('category', v))
  filters.importance.forEach((v) => params.append('importance', v))
  filters.languages.forEach((v) => params.append('language', v))
  filters.sources.forEach((v) => params.append('source', v))
  filters.statuses.forEach((v) => params.append('status', v))
  if (filters.verifiedOnly) params.set('verified', 'true')
  if (filters.liveOnly) params.set('live', 'true')
  if (filters.futureOnly) params.set('future', 'true')
  if (filters.breakingOnly) params.set('breaking', 'true')
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  if (filters.timeRange !== 'any') params.set('timeRange', filters.timeRange)
  return params
}
