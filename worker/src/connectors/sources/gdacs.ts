import { NormalizedEventSchema, type NormalizedEvent, type Coordinates } from '@insightwire/shared'
import { RssConnector, parsePubDate, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

interface GdacsItem extends RssItem {
  'dc:subject'?: string
  'geo:Point'?: {
    'geo:lat'?: number
    'geo:long'?: number
  }
}

export class GdacsConnector extends RssConnector {
  constructor() {
    super({
      id: 'gdacs-alerts',
      name: 'GDACS',
      description:
        'Global Disaster Alert and Coordination System (gdacs.org RSS feed) — EU Joint Research Centre + UN OCHA, explicitly public domain.',
      feedUrl: 'https://www.gdacs.org/xml/rss.xml',
      version: '1.0.0',
      // GDACS issues near-real-time alerts; polled more frequently than the
      // news-style sources.
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: [],
      supportedCategories: ['weather'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as GdacsItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const coordinates = extractCoordinates(item)
    const sourceUrl = item.link ? String(item.link) : undefined

    return {
      id: `${this.id}:${raw.externalId}`,
      title: String(item.title ?? 'Untitled GDACS alert').trim(),
      description: String(item.description ?? '').trim(),
      // GDACS alerts routinely name several affected countries in free text
      // (e.g. "affects these countries: Japan") — extracting those reliably
      // is Phase 5 entity-extraction work, not a connector's job.
      country: 'Global',
      coordinates,
      category: 'weather',
      source: this.name,
      sourceUrl,
      publishedAt,
      updatedAt: publishedAt,
      confirmingSources: [{ connectorId: this.id, sourceUrl, reportedAt: publishedAt }],
      importance: UNSCORED_IMPORTANCE,
      confidence: UNSCORED_CONFIDENCE,
      verificationStatus: 'unverified',
      language: 'en',
      people: [],
      organizations: [],
      keywords: [],
      // GDACS's own event-type code (e.g. "TC1" = tropical cyclone alert
      // level 1) — real feed-provided classification, same treatment as
      // NASA's <category> tags.
      tags: item['dc:subject'] ? [String(item['dc:subject'])] : [],
      status: 'developing',
    }
  }

  validate(event: NormalizedEvent): ValidationResult {
    const result = NormalizedEventSchema.safeParse(event)
    if (result.success) return { valid: true }
    return {
      valid: false,
      errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }
}

function extractCoordinates(item: GdacsItem): Coordinates | undefined {
  const point = item['geo:Point']
  const lat = point?.['geo:lat']
  const lng = point?.['geo:long']
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  return undefined
}
