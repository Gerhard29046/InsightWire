import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * New Era ("Truth for its own sake") — Namibia's government-owned national
 * newspaper (confirmed live 2026-08-08: WordPress RSS, most recent item
 * hours old). Not a raw government press-release feed like South Africa's
 * connector — it's general national news (courts, national affairs,
 * lifestyle, sport) published by a state-owned outlet, the closest real,
 * live, public source found for Namibia this round. gov.na itself is a
 * links-portal with no feed of its own; the Namibia Press Agency (NAMPA) is
 * subscriber-only, not public; no independent RSS feed exists for the
 * Namibian government, Parliament, or individual ministries as of this
 * check.
 *
 * Known limitation carried from every other connector here: `language` is
 * hardcoded 'en', but this feed genuinely publishes some items in
 * Otjiherero and other Namibian languages (confirmed in the live feed) —
 * no real per-item language detection exists yet in this pipeline.
 */
export class NamibiaNewEraConnector extends RssConnector {
  constructor() {
    super({
      id: 'namibia-newera',
      name: 'New Era (Namibia)',
      description:
        "Namibia's government-owned national newspaper (neweralive.na RSS feed) — no auth required, explicitly public. Not a raw government press-release feed; general national news from a state-owned outlet.",
      feedUrl: 'https://neweralive.na/feed/',
      version: '1.0.0',
      // WordPress site publishes multiple times per hour; matching GDACS/NWS's frequent cadence rather than the 60-minute government-announcement default.
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: ['NA'],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as RssItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const sourceUrl = item.link ? String(item.link) : undefined
    const title = String(item.title ?? 'Untitled New Era article').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(String(item.description ?? ''), title),
      country: 'Namibia',
      // No 'health'/'humanitarian'/'general-news' category exists yet — same
      // documented stopgap as WHO/UN (see docs/decisions/0009-intelligence-api.md's taxonomy-gap note).
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
