import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * European Central Bank press releases feed (confirmed live 2026-08-09:
 * standard RSS 2.0, no auth required — real banking-data publications,
 * digital euro updates, wage-tracker releases). `country: 'European Union'`
 * — same supranational-origin convention as EuCommissionConnector. See
 * docs/decisions/0016-institutional-source-expansion.md.
 */
export class EcbConnector extends RssConnector {
  constructor() {
    super({
      id: 'ecb',
      name: 'European Central Bank',
      description: 'Press releases, speeches, and press conferences (ecb.europa.eu RSS feed) — no auth required, explicitly public.',
      feedUrl: 'https://www.ecb.europa.eu/rss/press.html',
      version: '1.0.0',
      refreshIntervalMs: 60 * 60 * 1000,
      supportedCountries: [],
      supportedCategories: ['markets'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled ECB release').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'European Union',
      category: 'markets',
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
