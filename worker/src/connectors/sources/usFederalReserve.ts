import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * The Federal Reserve Board's press release feed (confirmed live
 * 2026-08-09: standard RSS 2.0, no auth required, most recent item hours
 * old — real banking-application approvals, rate decisions, enforcement
 * actions). Part of the US/EU/UK institutional-coverage expansion — see
 * docs/decisions/0016-institutional-source-expansion.md.
 */
export class UsFederalReserveConnector extends RssConnector {
  constructor() {
    super({
      id: 'us-federal-reserve',
      name: 'US Federal Reserve',
      description: 'Federal Reserve Board press releases (federalreserve.gov RSS feed) — monetary policy, bank regulation/enforcement, and rate decisions. No auth required, explicitly public.',
      feedUrl: 'https://www.federalreserve.gov/feeds/press_all.xml',
      version: '1.0.0',
      refreshIntervalMs: 30 * 60 * 1000,
      supportedCountries: ['US'],
      supportedCategories: ['markets'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled Federal Reserve press release').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'United States',
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
