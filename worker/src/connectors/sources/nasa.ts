import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

/**
 * Connector-seeded placeholders for fields Phase 5's AI pipeline owns.
 * 'medium'/0.4 signal "not yet scored" rather than a real assessment.
 */
const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

export class NasaConnector extends RssConnector {
  constructor() {
    super({
      id: 'nasa-news',
      name: 'NASA News',
      description: 'Official NASA news releases (nasa.gov RSS feed) — no auth required, explicitly public.',
      feedUrl: 'https://www.nasa.gov/news-release/feed/',
      version: '1.0.0',
      // Matches the feed's own <sy:updateFrequency>: hourly.
      refreshIntervalMs: 60 * 60 * 1000,
      supportedCountries: [],
      supportedCategories: ['science'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined

    return {
      id: `${this.id}:${raw.externalId}`,
      title: String(item.title ?? 'Untitled NASA release').trim(),
      description: String(item.description ?? '').trim(),
      // Not yet geolocated — Phase 5 entity extraction resolves the event's
      // actual geography from the article text rather than assuming the
      // publisher's own country.
      country: 'Global',
      category: 'science',
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
      tags: toStringArray(item.category),
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

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}
