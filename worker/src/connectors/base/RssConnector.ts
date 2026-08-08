import { XMLParser } from 'fast-xml-parser'
import type { CategoryId, NormalizedEvent } from '@insightwire/shared'
import type {
  ConnectorHealthStatus,
  ConnectorRateLimit,
  ConnectorType,
  RawEvent,
  SourceConnector,
  ValidationResult,
} from '../types'

interface AtomLink {
  '@_href'?: string
  '@_rel'?: string
}

/**
 * The generic shape of a single feed item after XML parsing — covers both
 * RSS 2.0 <item> and Atom <entry> (e.g. NOAA/NWS's CAP-over-Atom alerts
 * feed). Concrete feeds add their own fields on top (e.g. WHO's
 * Atom-namespaced <a10:content>, NWS's <cap:*> fields) — this only names
 * what's needed to fetch/dedupe an item; connectors read their own
 * source-specific fields straight off `payload` in normalize().
 */
export interface RssItem {
  title?: string
  link?: string | AtomLink | AtomLink[]
  description?: string
  pubDate?: string
  guid?: string | { '#text'?: string }
  /** Atom's equivalent of `guid`. */
  id?: string
  [key: string]: unknown
}

interface RssConnectorConfig {
  id: string
  name: string
  description: string
  feedUrl: string
  version: string
  refreshIntervalMs: number
  supportedCountries: string[]
  supportedCategories: CategoryId[]
  rateLimit?: ConnectorRateLimit
  enabled?: boolean
}

/**
 * Some official public APIs document a User-Agent requirement and reject
 * unidentified requests — confirmed against NOAA/NWS's live API, which
 * returned HTTP 403 without this (see docs/decisions/0005-intelligence-engine.md).
 * Sent on every request: harmless for sources that don't require it, and
 * generally good API citizenship regardless.
 */
const REQUEST_HEADERS = {
  'User-Agent': 'InsightWire/1.0 (https://github.com/Gerhard29046/InsightWire)',
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  htmlEntities: true,
})

interface ParsedFeed {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[]
    }
  }
  feed?: {
    entry?: RssItem | RssItem[]
  }
}

const HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/**
 * Drupal's default date rendering ("Sat, 08/08/2026 - 08:44"), always
 * preceded by a single-token CMS editor username (e.g. "Neo", "Sibonelo",
 * "angenitha") and sometimes followed by a stray numeric field (observed on
 * SAnews's feed — a "weight"/count value, not article content). This
 * metadata block appears *either* before or after the real article body
 * depending on the exact site (confirmed different ordering between
 * gov.za's speeches-feed and sanews.gov.za's news feed despite both being
 * Drupal), so it's stripped by pattern match wherever it occurs rather than
 * assumed to be at a fixed position.
 */
const EDITOR_TIMESTAMP_PATTERN = /\s*\S+\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s\d{2}\/\d{2}\/\d{4}\s-\s\d{2}:\d{2}(\s+\d{1,3})?\s*/g

/**
 * Several government CMS platforms (South Africa's gov.za and sanews.gov.za,
 * Namibia/Zimbabwe's state media, Drupal- or WordPress-based) embed full
 * rendered markup in <description> — nested tags, doubly-escaped entities
 * that survive the outer XML unescape, and (Drupal specifically) a
 * title/editor/timestamp metadata block mixed into the same field as the
 * real article body. Strips tags, decodes entities, removes the editor/
 * timestamp block, and drops a leading duplicate of the item's own title
 * (Drupal repeats it as the description's first line) — found and fixed
 * after a test (`sanews.test.ts`) caught "Neo" (an internal CMS editor
 * username) leaking into what a journalist would read as article body text.
 * Shared here once four connectors needed the identical logic.
 */
export function stripHtmlDescription(html: string, title?: string): string {
  let text = html.replace(/<[^>]+>/g, ' ')
  for (const [entity, char] of Object.entries(HTML_ENTITY_REPLACEMENTS)) {
    text = text.split(entity).join(char)
  }
  text = text.replace(EDITOR_TIMESTAMP_PATTERN, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (title && text.startsWith(title)) {
    text = text.slice(title.length).trim()
  }
  return text
}

/** RSS pubDate (RFC 822/1123-ish) -> ISO 8601. Throws on unparseable input rather than silently producing `Invalid Date`. */
export function parsePubDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unparseable pubDate: "${value}"`)
  }
  return date.toISOString()
}

function linkHref(link: AtomLink): string | undefined {
  return link['@_href']
}

/**
 * Extracts a usable URL from either RSS's plain-string `<link>` or Atom's
 * `<link href="...">` (single or, per spec, potentially repeated with
 * different `rel` values — the "alternate" one is what a human would open).
 * Exported for connectors (e.g. NWS) that need the article URL for
 * `sourceUrl` in addition to `extractExternalId`'s own link handling.
 */
export function extractLinkHref(item: RssItem): string | undefined {
  const link = item.link
  if (typeof link === 'string' && link) return link
  if (Array.isArray(link)) {
    const alternate = link.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')
    return alternate ? linkHref(alternate) : undefined
  }
  if (link && typeof link === 'object') return linkHref(link)
  return undefined
}

function extractExternalId(connectorId: string, item: RssItem): string {
  const guid = item.guid
  if (typeof guid === 'string' && guid) return guid
  if (guid && typeof guid === 'object' && guid['#text']) return String(guid['#text'])
  if (typeof item.id === 'string' && item.id) return item.id

  const href = extractLinkHref(item)
  if (href) return href

  throw new Error(`${connectorId}: feed item has neither guid/id nor a usable link to use as an external id`)
}

/**
 * Parses feed XML (RSS 2.0 or Atom) into RawEvents. A standalone function
 * (not a class method) so tests can feed fixture XML through the exact same
 * parsing path `fetch()` uses, without a network call or reaching into
 * class internals.
 */
export function parseRssItems(connectorId: string, xml: string): RawEvent[] {
  const parsed = xmlParser.parse(xml) as ParsedFeed
  const rawItems = parsed.rss?.channel?.item ?? parsed.feed?.entry
  const items: RssItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []
  const fetchedAt = new Date().toISOString()

  return items.map((item) => ({
    connectorId,
    externalId: extractExternalId(connectorId, item),
    fetchedAt,
    payload: item,
  }))
}

/**
 * Shared fetch + parse logic for any RSS/Atom-style source. Concrete
 * connectors (NASA, WHO, and future RSS-based sources like UN News or
 * government press feeds) only need to supply the feed URL and their own
 * normalize()/validate() field mapping — this is the mechanism that keeps
 * that logic from being duplicated per source.
 */
export abstract class RssConnector implements SourceConnector {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly type: ConnectorType = 'rss'
  readonly enabled: boolean
  readonly version: string
  readonly refreshIntervalMs: number
  readonly supportedCountries: string[]
  readonly supportedCategories: CategoryId[]
  readonly rateLimit?: ConnectorRateLimit
  protected readonly feedUrl: string

  constructor(config: RssConnectorConfig) {
    this.id = config.id
    this.name = config.name
    this.description = config.description
    this.feedUrl = config.feedUrl
    this.version = config.version
    this.refreshIntervalMs = config.refreshIntervalMs
    this.supportedCountries = config.supportedCountries
    this.supportedCategories = config.supportedCategories
    this.rateLimit = config.rateLimit
    this.enabled = config.enabled ?? true
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    const checkedAt = new Date().toISOString()
    try {
      let res = await fetch(this.feedUrl, { method: 'HEAD', headers: REQUEST_HEADERS })
      if (!res.ok) res = await fetch(this.feedUrl, { method: 'GET', headers: REQUEST_HEADERS })
      return {
        healthy: res.ok,
        message: res.ok ? undefined : `HTTP ${res.status}`,
        checkedAt,
      }
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        checkedAt,
      }
    }
  }

  async fetch(): Promise<RawEvent[]> {
    const res = await fetch(this.feedUrl, { headers: REQUEST_HEADERS })
    if (!res.ok) {
      throw new Error(`${this.id}: failed to fetch feed (HTTP ${res.status})`)
    }
    const xml = await res.text()
    return parseRssItems(this.id, xml)
  }

  abstract normalize(raw: RawEvent): NormalizedEvent
  abstract validate(event: NormalizedEvent): ValidationResult
}
