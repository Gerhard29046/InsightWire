import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

export class WhoConnector extends RssConnector {
  constructor() {
    super({
      id: 'who-news',
      name: 'WHO News',
      description: 'World Health Organization news releases (who.int RSS feed) — no auth required, explicitly public.',
      feedUrl: 'https://www.who.int/rss-feeds/news-english.xml',
      version: '1.0.0',
      // WHO's feed doesn't publish an update-frequency hint; matching NASA's
      // cadence as a conservative default.
      refreshIntervalMs: 60 * 60 * 1000,
      supportedCountries: [],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined

    return {
      id: `${this.id}:${raw.externalId}`,
      title: String(item.title ?? 'Untitled WHO release').trim(),
      description: String(item.description ?? '').trim(),
      // WHO's feed covers events in many countries per item (e.g. "WHO
      // Director-General visits Jordan") — Phase 5 entity extraction
      // resolves the real country from the article text; Phase 1 doesn't
      // guess one.
      country: 'Global',
      // The existing 8-category taxonomy has no 'health' bucket yet;
      // 'government' (international governance/policy body) is the closest
      // fit until that's revisited.
      category: 'government',
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
      tags: [],
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
