import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

export class UnConnector extends RssConnector {
  constructor() {
    super({
      id: 'un-news',
      name: 'UN News',
      description: 'United Nations News Centre releases (news.un.org RSS feed) — no auth required, explicitly public.',
      feedUrl: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
      version: '1.0.0',
      // UN News doesn't publish an update-frequency hint; matching the
      // other international-body sources' conservative default.
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
      title: String(item.title ?? 'Untitled UN News release').trim(),
      description: String(item.description ?? '').trim(),
      // UN News covers events in many countries per item — Phase 5 entity
      // extraction resolves the real country from the article text, same
      // reasoning as WHO/NASA.
      country: 'Global',
      // No `health`/`humanitarian` category exists yet — 'government'
      // (international governance/policy body) is the closest fit, same
      // stopgap as WHO.
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
