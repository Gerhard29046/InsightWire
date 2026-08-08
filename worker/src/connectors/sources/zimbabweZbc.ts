import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * ZBC News — Zimbabwe Broadcasting Corporation, the state-owned
 * broadcaster's news site (confirmed live 2026-08-08: WordPress RSS, most
 * recent item hours old, real government/military content e.g. a Zimbabwe
 * National Army announcement). Blocks requests with no/curl's default
 * User-Agent (HTTP 403) but allows an honestly self-identifying one — same
 * finding as NWS requiring a real User-Agent (ADR 0005) — no browser
 * impersonation used or needed, `RssConnector`'s existing `REQUEST_HEADERS`
 * already sends one.
 *
 * zim.gov.zw (the government e-services portal) has no RSS feed of its own;
 * New Ziana (the state news agency) has no discoverable public feed.
 */
export class ZimbabweZbcConnector extends RssConnector {
  constructor() {
    super({
      id: 'zimbabwe-zbc',
      name: 'ZBC News (Zimbabwe)',
      description:
        "Zimbabwe Broadcasting Corporation's news site (zbcnews.co.zw RSS feed) — state-owned broadcaster, no auth required, explicitly public. Requires a real (non-empty, non-curl-default) User-Agent or returns HTTP 403; already handled by RssConnector's shared REQUEST_HEADERS.",
      feedUrl: 'https://www.zbcnews.co.zw/feed/',
      version: '1.0.0',
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: ['ZW'],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled ZBC News article').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'Zimbabwe',
      // No 'general-news' category exists yet — same documented stopgap as WHO/UN/New Era.
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
