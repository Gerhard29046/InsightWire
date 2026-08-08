/**
 * Small shared helpers for the two structured-HTML South African government
 * calendar connectors (southAfricaGovEvents.ts, southAfricaPresidencyEvents.ts).
 * Both sites publish real events with no RSS/Atom/JSON/ICS feed (verified
 * live, 2026-08-08 — see each connector's own doc comment) but do embed
 * machine-readable `<time datetime="...">` attributes in otherwise
 * hand-styled Drupal Views markup. This file holds only the genuinely
 * shared logic (URL resolution, entity decoding, SAST time combination) —
 * row extraction stays per-connector since the two sites' markup shapes
 * differ enough that a shared row parser would be more confusing than two
 * small, direct ones.
 */

/** South Africa has observed a single fixed UTC+2 offset year-round since 1903 — no DST to account for. */
export const SAST_UTC_OFFSET = '+02:00'

const ENTITY_REPLACEMENTS: Record<string, string> = {
  '&amp;': '&',
  '&#039;': "'",
  '&apos;': "'",
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
}

/** Decodes the small set of numeric/named entities Drupal emits in plain link text (titles, category labels) — not a general HTML-to-text cleaner like stripHtmlDescription, since these fields never contain nested markup. */
export function decodeHtmlEntities(text: string): string {
  let result = text
  for (const [entity, char] of Object.entries(ENTITY_REPLACEMENTS)) {
    result = result.split(entity).join(char)
  }
  return result.trim()
}

/** Resolves a Drupal-relative href (e.g. "/node/10326") against the site origin. Returns the input unchanged if already absolute. */
export function resolveUrl(origin: string, href: string): string {
  try {
    return new URL(href, origin).toString()
  } catch {
    return href
  }
}

/**
 * Extracts every `<time datetime="...">` value from an HTML fragment, in
 * document order. Both connectors' sources render a date-only field as
 * this exact ISO string with the platform's own `T12:00:00Z` placeholder
 * hour (confirmed by direct inspection of live markup, not assumed) — that
 * placeholder is passed straight through when no more specific time exists,
 * exactly as-received, never adjusted to imply precision the source didn't
 * publish.
 */
export function extractTimeDatetimes(html: string): string[] {
  const matches = html.matchAll(/<time\s+datetime="([^"]+)"/g)
  return [...matches].map((m) => m[1])
}

/**
 * Combines a date-only ISO value (the date portion only — the source's own
 * noon-UTC placeholder hour is discarded, not treated as real) with a real
 * local "HHhMM" time-of-day string (e.g. "18h00" from "18h00 - 20h00") into
 * a precise UTC instant, using South Africa's fixed +02:00 offset. Returns
 * the original date-only value unchanged if no parseable time text is
 * given — never fabricates a time-of-day the source didn't provide.
 */
export function combineDateWithSastTime(isoDateOnly: string, timeText: string | undefined): string {
  if (!timeText) return isoDateOnly
  const match = timeText.match(/(\d{1,2})h(\d{2})/)
  if (!match) return isoDateOnly
  const datePart = isoDateOnly.slice(0, 10)
  const [, hh, mm] = match
  const combined = new Date(`${datePart}T${hh.padStart(2, '0')}:${mm}:00${SAST_UTC_OFFSET}`)
  if (Number.isNaN(combined.getTime())) return isoDateOnly
  return combined.toISOString()
}

/** First "HHhMM" occurrence in a "HHhMM - HHhMM" (or single "HHhMM") range string. */
export function firstSastTime(timeRangeText: string | undefined): string | undefined {
  return timeRangeText?.match(/\d{1,2}h\d{2}/)?.[0]
}

/** Second "HHhMM" occurrence, if the range has one (event has a distinct end time). */
export function secondSastTime(timeRangeText: string | undefined): string | undefined {
  const all = timeRangeText?.match(/\d{1,2}h\d{2}/g)
  return all && all.length > 1 ? all[1] : undefined
}
