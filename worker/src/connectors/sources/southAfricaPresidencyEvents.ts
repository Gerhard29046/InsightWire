import { NormalizedEventSchema, type CategoryId, type NormalizedEvent } from '@insightwire/shared'
import {
  combineDateWithSastTime,
  decodeHtmlEntities,
  extractTimeDatetimes,
  firstSastTime,
  resolveUrl,
  secondSastTime,
} from '../base/htmlCalendar'
import type {
  ConnectorHealthStatus,
  ConnectorRateLimit,
  ConnectorType,
  RawEvent,
  SourceConnector,
  ValidationResult,
} from '../types'

const ORIGIN = 'https://www.thepresidency.gov.za'
const CALENDAR_PATH = '/events-calendar'
const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4
const REQUEST_HEADERS = { 'User-Agent': 'InsightWire/1.0 (https://github.com/Gerhard29046/InsightWire)' }
/**
 * Verified live (2026-08-08): unlike gov.za/news/events, this page exposes
 * no date filter or date-ascending sort — only a "principal" (person)
 * dropdown — and consecutive pages are not cleanly ordered by event date
 * (page 0 held Aug 11-13; page 1 held a mix of Jul 31 and Aug 4-11).
 * Scanning a small bounded number of pages per poll is an honest trade-off
 * over either (a) crawling all 73 pages every hour (disrespectful of the
 * site, and Phase 6.5's own "respect rate limits" requirement), or (b)
 * silently trusting page 0 alone to hold every upcoming event, which the
 * live check above disproved. Real coverage gap, documented rather than
 * hidden — see this connector's class doc comment.
 */
const PAGES_PER_POLL = 5

interface PresidencyEventItem {
  nodeHref: string
  titleText: string
  startDateTime?: string
  timeRangeText?: string
}

function pageUrl(page: number): string {
  return page === 0 ? `${ORIGIN}${CALENDAR_PATH}` : `${ORIGIN}${CALENDAR_PATH}?page=${page}`
}

/**
 * Parses one page of the Presidency's real "Principals Event Calendar"
 * grid (verified live 2026-08-08 — see class doc comment). Splits on the
 * literal `item-columns` wrapper rather than balancing nested `<div>` tags
 * (no recursive-regex support in JS) — safe here because each item's
 * fields (title link, event-start time, event-time text) always appear
 * before the next item-columns marker in the real captured markup.
 */
export function parsePresidencyEventItems(html: string): PresidencyEventItem[] {
  const chunks = html.split('<div class="item-columns">').slice(1)
  const items: PresidencyEventItem[] = []

  for (const chunk of chunks) {
    const titleMatch = chunk.match(/<h5 class="field-content"><a href="([^"]+)"[^>]*>([^<]*)<\/a><\/h5>/)
    if (!titleMatch) continue
    const startSection = chunk.match(/views-field-field-event-start[\s\S]{0,200}/)?.[0] ?? ''
    const startDateTime = extractTimeDatetimes(startSection)[0]
    const timeSection = chunk.match(/views-field-field-event-time[\s\S]{0,200}/)?.[0] ?? ''
    const timeText = timeSection.match(/field-content[^>]*>([^<]*)</)?.[1]?.trim()

    items.push({
      nodeHref: titleMatch[1],
      titleText: decodeHtmlEntities(titleMatch[2]),
      startDateTime,
      timeRangeText: timeText,
    })
  }
  return items
}

/**
 * The South African Presidency's "Principals Event Calendar" — verified
 * live before coding (2026-08-08):
 * https://www.thepresidency.gov.za/events-calendar is a real, structured
 * HTML grid (server-rendered, no JavaScript required — confirmed via a
 * plain `curl`, not a headless browser). No RSS/Atom/JSON/ICS feed exists
 * (checked the page for `<link rel="alternate">` and footer feed links —
 * none). Each item has a machine-readable `<time datetime="...">` for its
 * date and a separate free-text local time range (e.g. "18h00 - 20h00",
 * South Africa Standard Time, UTC+2 year-round, no DST) — the date
 * attribute's own hour is always the platform's `T12:00:00Z` placeholder,
 * not a real time, so the two fields are combined (see
 * `combineDateWithSastTime`) rather than trusting the placeholder alone.
 * Covers presidential/deputy-presidential/ministerial engagements — the
 * "presidential events" and "cabinet events" categories named in the
 * InsightWire calendar spec.
 */
export class SouthAfricaPresidencyEventsConnector implements SourceConnector {
  readonly id = 'south-africa-presidency-events'
  readonly name = 'The South African Presidency (Principals Event Calendar)'
  readonly description =
    'Official upcoming engagements for South Africa\'s government principals (thepresidency.gov.za/events-calendar) — presidential, deputy-presidential, and ministerial events. No auth required, explicitly public; no RSS/API/ICS exists, so it is fetched as structured HTML. No date filter/sort is exposed on the source, so coverage is a bounded page scan each poll, not a guaranteed-complete listing — see this class\'s own doc comment.'
  readonly type: ConnectorType = 'dataset'
  readonly enabled = true
  readonly version = '1.0.0'
  readonly refreshIntervalMs = 60 * 60 * 1000
  readonly supportedCountries = ['ZA']
  readonly supportedCategories: CategoryId[] = ['government']
  readonly rateLimit?: ConnectorRateLimit

  async healthCheck(): Promise<ConnectorHealthStatus> {
    const checkedAt = new Date().toISOString()
    try {
      const res = await fetch(pageUrl(0), { method: 'GET', headers: REQUEST_HEADERS })
      return { healthy: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, checkedAt }
    } catch (err) {
      return { healthy: false, message: err instanceof Error ? err.message : 'Unknown error', checkedAt }
    }
  }

  async fetch(): Promise<RawEvent[]> {
    const fetchedAt = new Date().toISOString()
    const raw: RawEvent[] = []
    const seenHrefs = new Set<string>()

    for (let page = 0; page < PAGES_PER_POLL; page++) {
      const res = await fetch(pageUrl(page), { headers: REQUEST_HEADERS })
      if (!res.ok) {
        if (page === 0) throw new Error(`${this.id}: failed to fetch events-calendar page 0 (HTTP ${res.status})`)
        break // A later page failing (e.g. past the real last page) isn't fatal — keep what page 0..N-1 already yielded.
      }
      const html = await res.text()
      for (const item of parsePresidencyEventItems(html)) {
        if (seenHrefs.has(item.nodeHref)) continue // Same item can legitimately reappear if pages shift between requests.
        seenHrefs.add(item.nodeHref)
        raw.push({ connectorId: this.id, externalId: item.nodeHref, fetchedAt, payload: item })
      }
    }
    return raw
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as PresidencyEventItem
    const sourceUrl = resolveUrl(ORIGIN, item.nodeHref)
    const endTimeText = secondSastTime(item.timeRangeText)
    const startTime = item.startDateTime
      ? combineDateWithSastTime(item.startDateTime, firstSastTime(item.timeRangeText))
      : undefined
    // Only set when the source's own range text has a genuine second "HHhMM" — a single time is a point-in-time event, never given a fabricated end.
    const endTime = item.startDateTime && endTimeText ? combineDateWithSastTime(item.startDateTime, endTimeText) : undefined

    return {
      id: `${this.id}:${raw.externalId}`,
      title: item.titleText || 'Untitled Presidency event',
      // The calendar grid provides no synopsis — an honest empty string, not a fabricated summary.
      description: '',
      country: 'South Africa',
      category: 'government',
      source: this.name,
      sourceUrl,
      startTime,
      endTime,
      publishedAt: raw.fetchedAt,
      updatedAt: raw.fetchedAt,
      confirmingSources: [{ connectorId: this.id, sourceUrl, reportedAt: raw.fetchedAt }],
      importance: UNSCORED_IMPORTANCE,
      confidence: UNSCORED_CONFIDENCE,
      verificationStatus: 'unverified',
      language: 'en',
      people: [],
      organizations: [],
      keywords: [],
      tags: [],
      status: 'scheduled',
    }
  }

  validate(event: NormalizedEvent): ValidationResult {
    const result = NormalizedEventSchema.safeParse(event)
    if (result.success) return { valid: true }
    return { valid: false, errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  }
}
