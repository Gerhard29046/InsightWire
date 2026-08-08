import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * SAnews (South African Government News Agency, published by the
 * Department of Communications) — confirmed live 2026-08-08 by fetching
 * https://www.sanews.gov.za/ and reading the footer's actual RSS
 * subscription links (not guessed): two real, live feeds exist —
 * south-africa-news-stories.xml (breaking news, updated multiple times an
 * hour) and features.xml (longer-form pieces, updated roughly weekly).
 * Both registered as separate connectors sharing this base class, since
 * RssConnector's design is one feed URL per connector instance.
 *
 * `<link>` is already the human-readable article page
 * (e.g. https://www.sanews.gov.za/south-africa/call-vote-upcoming-local-government-elections),
 * never the feed URL itself — confirmed from the live feed, not assumed.
 * `sourceUrl` (used as-is by the frontend's "Read original source" action)
 * is exactly this value.
 *
 * `<dc:creator>` exists but contains internal CMS editor usernames ("Neo",
 * "Edwin", "GabiK") — the same shared government CMS platform as
 * south-africa-gov's gov.za feed, not a citable journalist byline. Not
 * surfaced as an "author" field: presenting an internal staff handle as if
 * it were a meaningful author credit would mislead a journalist, not
 * inform one. No `<category>`/geo tags exist in either feed, so
 * department/people/organizations/topic extraction from structured feed
 * metadata isn't possible here — those fields stay empty at ingestion time,
 * same honest "nothing to extract without real AI" pattern every other
 * connector in this codebase already follows (populated later by real
 * entity extraction — `NullAiProvider` today, or per-event by the
 * Journalist Brief feature, which does extract real entities/locations
 * from the article body — see docs/decisions/0011-sanews-connector.md).
 */
abstract class SAnewsConnectorBase extends RssConnector {
  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled SAnews article').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'South Africa',
      category: 'government',
      source: this.name,
      sourceUrl,
      publishedAt,
      updatedAt: publishedAt,
      confirmingSources: [{ connectorId: this.id, sourceUrl, reportedAt: publishedAt }],
      importance: UNSCORED_IMPORTANCE,
      confidence: UNSCORED_CONFIDENCE,
      // A government news agency's own report is a REPORTED claim from an
      // interested party, not independent confirmation of the underlying
      // facts — same 'unverified' default every connector starts at,
      // deliberately not upgraded just because the publisher is official.
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

export class SAnewsConnector extends SAnewsConnectorBase {
  constructor() {
    super({
      id: 'sanews',
      name: 'SAnews',
      description:
        'South African Government News Agency breaking news (sanews.gov.za/south-africa-news-stories.xml) — published by the Department of Communications, no auth required, explicitly public.',
      feedUrl: 'https://www.sanews.gov.za/south-africa-news-stories.xml',
      version: '1.0.0',
      // Updated multiple times per hour on the live feed (5 items within a single morning observed) — matching GDACS/NWS's frequent-polling tier.
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: ['ZA'],
      supportedCategories: ['government'],
    })
  }
}

export class SAnewsFeaturesConnector extends SAnewsConnectorBase {
  constructor() {
    super({
      id: 'sanews-features',
      name: 'SAnews Features',
      description:
        'South African Government News Agency long-form feature stories (sanews.gov.za/features.xml) — published by the Department of Communications, no auth required, explicitly public.',
      feedUrl: 'https://www.sanews.gov.za/features.xml',
      version: '1.0.0',
      // Features publish roughly weekly on the live feed — the 60-minute government-announcement default is already generous; no need for the frequent tier.
      refreshIntervalMs: 60 * 60 * 1000,
      supportedCountries: ['ZA'],
      supportedCategories: ['government'],
    })
  }
}
