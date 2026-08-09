import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * European Commission press corner feed (confirmed live 2026-08-09:
 * standard RSS 2.0, no auth required — real trade/regulatory/space/policy
 * releases, e.g. IRIS² satellite deployment, NextGenerationEU
 * disbursements). `country: 'European Union'` — supranational, same
 * "real institutional origin, not a literal country" choice UnConnector
 * makes with `country: 'Global'`. See
 * docs/decisions/0016-institutional-source-expansion.md.
 */
export class EuCommissionConnector extends RssConnector {
  constructor() {
    super({
      id: 'eu-commission',
      name: 'European Commission',
      description: 'Press releases and daily news (ec.europa.eu/commission/presscorner RSS feed) — no auth required, explicitly public.',
      feedUrl: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en',
      version: '1.0.0',
      refreshIntervalMs: 30 * 60 * 1000,
      supportedCountries: [],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled European Commission release').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'European Union',
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
