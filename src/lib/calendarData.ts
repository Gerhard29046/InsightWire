/**
 * Pure date helpers for the Calendar page. Deliberately contains no event
 * data, category taxonomy, or country list of its own — the Calendar page
 * reads real scheduled events (and their real category/country values)
 * from the same Intelligence API every other page uses (`fetchEvents`,
 * `src/lib/api/events.ts`), filtered to `status: 'scheduled'`. An earlier
 * version of this file held a hardcoded 9-category taxonomy and a
 * 10-country list backing fabricated demo events — removed entirely per
 * the "zero mock calendar data" requirement; see
 * docs/decisions/0012-calendar-real-data.md.
 */

const pad = (n: number): string => n.toString().padStart(2, '0')

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}
