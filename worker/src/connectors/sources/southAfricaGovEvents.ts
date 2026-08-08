import { NormalizedEventSchema, type CategoryId, type NormalizedEvent } from '@insightwire/shared'
import { decodeHtmlEntities, extractTimeDatetimes, resolveUrl } from '../base/htmlCalendar'
import type {
  ConnectorHealthStatus,
  ConnectorRateLimit,
  ConnectorType,
  RawEvent,
  SourceConnector,
  ValidationResult,
} from '../types'

const ORIGIN = 'https://www.gov.za'
const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4
const REQUEST_HEADERS = { 'User-Agent': 'InsightWire/1.0 (https://github.com/Gerhard29046/InsightWire)' }
/** How far ahead to request in one call — bounded, not "fetch everything the site has ever listed" (1,700+ rows across its full history, per live inspection). */
const LOOKAHEAD_DAYS = 120

interface GovZaEventRow {
  titleHref: string
  titleText: string
  dates: string[]
  categoryHref?: string
  categoryText?: string
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Builds the real, verified date-range query gov.za's own "Event Date" column sort links expose (confirmed live: /news/events?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD server-side-filters the Views table) — a single bounded request instead of paging through the site's full 1,700+-row history. */
export function buildEventsUrl(now: Date = new Date()): string {
  const start = toDateParam(now)
  const end = toDateParam(new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000))
  return `${ORIGIN}/news/events?start_date=${start}&end_date=${end}`
}

/**
 * Parses gov.za's real Views table markup (verified live 2026-08-08 — see
 * this connector's class doc comment). Row-by-row rather than a single
 * global regex, since the "Event Date" cell sometimes holds one `<time>`
 * (single-day event) and sometimes two (a date range), which a flat
 * global match across the whole table can't attribute back to the right
 * row.
 */
export function parseGovZaEventRows(html: string): GovZaEventRow[] {
  const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/)
  if (!bodyMatch) return []
  const rowMatches = bodyMatch[1].matchAll(/<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/g)

  const rows: GovZaEventRow[] = []
  for (const rowMatch of rowMatches) {
    const row = rowMatch[1]
    const links = [...row.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
    if (links.length === 0) continue
    const [titleHref, titleText] = [links[0][1], decodeHtmlEntities(links[0][2])]
    const dates = extractTimeDatetimes(row)
    if (dates.length === 0) continue
    const category = links.length > 1 ? links[links.length - 1] : undefined
    rows.push({
      titleHref,
      titleText,
      dates,
      categoryHref: category?.[1],
      categoryText: category ? decodeHtmlEntities(category[2]) : undefined,
    })
  }
  return rows
}

/**
 * South African Government events listing — verified live before coding
 * (2026-08-08): https://www.gov.za/news/events is a real, structured Drupal
 * Views HTML table (no RSS/Atom/JSON/ICS feed exists for it — checked the
 * page footer's actual "RSS feeds" link, which only covers news content,
 * and the page `<head>`, which has no `<link rel="alternate">`). Each row's
 * "Event Date" column is machine-readable (`<time datetime="...">`, real
 * ISO timestamps), and the page's own column-sort links exposed a real,
 * working `start_date`/`end_date` server-side filter — confirmed by
 * fetching it directly and checking the returned rows' dates fell exactly
 * inside the requested window, not by assumption. This is the primary
 * "government activities" calendar named in the InsightWire calendar spec
 * (distinct from the existing `south-africa-gov` connector, which covers
 * Cabinet statements/speeches via a real RSS feed, not scheduled events).
 */
export class SouthAfricaGovEventsConnector implements SourceConnector {
  readonly id = 'south-africa-gov-events'
  readonly name = 'South African Government (Events Calendar)'
  readonly description =
    'Official upcoming government activities (gov.za/news/events) — presidential/ministerial engagements, campaigns, summits, and other scheduled government events. No auth required, explicitly public; no RSS/API/ICS exists for this section, so it is fetched as structured HTML using the site\'s own real start_date/end_date filter.'
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
      const res = await fetch(buildEventsUrl(), { method: 'GET', headers: REQUEST_HEADERS })
      return { healthy: res.ok, message: res.ok ? undefined : `HTTP ${res.status}`, checkedAt }
    } catch (err) {
      return { healthy: false, message: err instanceof Error ? err.message : 'Unknown error', checkedAt }
    }
  }

  async fetch(): Promise<RawEvent[]> {
    const url = buildEventsUrl()
    const res = await fetch(url, { headers: REQUEST_HEADERS })
    if (!res.ok) {
      throw new Error(`${this.id}: failed to fetch events page (HTTP ${res.status})`)
    }
    const html = await res.text()
    const fetchedAt = new Date().toISOString()
    return parseGovZaEventRows(html).map((row) => ({
      connectorId: this.id,
      externalId: row.titleHref,
      fetchedAt,
      payload: row,
    }))
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const row = raw.payload as GovZaEventRow
    const sourceUrl = resolveUrl(ORIGIN, row.titleHref)

    return {
      id: `${this.id}:${raw.externalId}`,
      title: row.titleText || 'Untitled South African government event',
      // The listing page provides no synopsis — an honest empty string, not a fabricated summary.
      description: '',
      country: 'South Africa',
      category: 'government',
      source: this.name,
      sourceUrl,
      startTime: row.dates[0],
      endTime: row.dates.length > 1 ? row.dates[1] : undefined,
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
      tags: row.categoryText ? [row.categoryText] : [],
      status: 'scheduled',
    }
  }

  validate(event: NormalizedEvent): ValidationResult {
    const result = NormalizedEventSchema.safeParse(event)
    if (result.success) return { valid: true }
    return { valid: false, errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  }
}
