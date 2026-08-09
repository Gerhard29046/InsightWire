import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * The White House's Presidential Actions feed (confirmed live 2026-08-09:
 * standard WordPress RSS 2.0, no auth required — real executive orders,
 * proclamations, and nominations sent to the Senate). The general
 * `/briefing-room/feed/` and `/feed/` paths this administration's site
 * previously used both now 404; `/presidential-actions/feed/` is the one
 * confirmed-working feed on whitehouse.gov as of this verification. See
 * docs/decisions/0016-institutional-source-expansion.md.
 */
export class UsWhiteHouseConnector extends RssConnector {
  constructor() {
    super({
      id: 'us-white-house',
      name: 'The White House',
      description: 'Presidential Actions (whitehouse.gov/presidential-actions RSS feed) — executive orders, proclamations, nominations. No auth required, explicitly public.',
      feedUrl: 'https://www.whitehouse.gov/presidential-actions/feed/',
      version: '1.0.0',
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: ['US'],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled White House presidential action').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'United States',
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
