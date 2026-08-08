import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * South African Government speeches/statements — verified live before
 * coding (2026-08-08): gov.za publishes several RSS feeds
 * (news-feed/issues-feed/documents-feed/speeches-feed), but only
 * speeches-feed is actually current (most recent item: 30 Jul 2026) — the
 * others are stale/abandoned (last items from 2015-2020) and are
 * deliberately NOT connected here. Covers Cabinet statements and other
 * government speeches — real "major government announcements" content
 * (e.g. Cabinet meeting statements covering economic policy, legislation,
 * international relations), not a guess at what the feed might contain.
 */
export class SouthAfricaGovConnector extends RssConnector {
  constructor() {
    super({
      id: 'south-africa-gov',
      name: 'South African Government (Cabinet & Speeches)',
      description:
        'Cabinet statements and government speeches (gov.za speeches-feed) — official South African government communication, no auth required, explicitly public. gov.za also publishes news-feed/issues-feed/documents-feed, which were confirmed stale (last updated 2015-2020) and are not connected.',
      feedUrl: 'https://www.gov.za/speeches-feed',
      version: '1.0.0',
      // Cabinet meets roughly weekly; matching the other government-announcement feeds' conservative default.
      refreshIntervalMs: 60 * 60 * 1000,
      supportedCountries: ['ZA'],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled South African government statement').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      // Unlike WHO/UN (genuinely multi-country wire services), this feed is
      // real South African government output — a known fact about the
      // source, not a guess about any individual item.
      country: 'South Africa',
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
