import { useMemo } from 'react'
import { useEventsFeed, type UseEventsFeedResult } from './useEventsFeed'
import { createEmptyFilters } from '../lib/api/types'
import type { CategoryId } from '../lib/categories'

/**
 * The Calendar answers "what's scheduled to happen" — a fundamentally
 * different question from the Global Events Feed's "what's happening right
 * now" (`useEventsFeed`'s own default use). This hook exists specifically
 * so that distinction lives in code, not just in each page's own inline
 * filter construction: it always requests `status: 'scheduled'` events with
 * a real future `start_time`, sorted soonest-first, and polls roughly
 * hourly rather than every minute — a newly-announced state visit next
 * month doesn't need 60-second freshness the way a breaking wildfire does.
 */
const CALENDAR_PAGE_SIZE = 200
const CALENDAR_POLL_INTERVAL_MS = 60 * 60 * 1000

export interface CalendarEventsParams {
  categories: CategoryId[]
  countries: string[]
  search: string
}

export function useCalendarEvents({ categories, countries, search }: CalendarEventsParams): UseEventsFeedResult {
  const filters = useMemo(() => {
    const f = createEmptyFilters()
    f.futureOnly = true
    f.statuses = ['scheduled']
    f.categories = categories
    f.countries = countries
    f.search = search
    return f
  }, [categories, countries, search])

  return useEventsFeed(filters, 'upcoming', CALENDAR_PAGE_SIZE, CALENDAR_POLL_INTERVAL_MS)
}
