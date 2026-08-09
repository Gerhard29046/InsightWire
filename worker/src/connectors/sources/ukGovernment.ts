import { NormalizedEventSchema, type NormalizedEvent } from '@insightwire/shared'
import { RssConnector, extractLinkHref, parsePubDate, stripHtmlDescription, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/** Atom (not RSS) — gov.uk's feed uses `<updated>`/`<summary>`, not `<pubDate>`/`<description>`; same reason NwsConnector extends RssItem locally rather than assuming RSS-only field names. `summary` carries a `type="html"` attribute, which the shared XML parser (attributes not ignored) turns into `{ '@_type': 'html', '#text': '...' }` rather than a plain string — same shape `guid` objects already have elsewhere in this codebase. */
interface AtomEntry extends RssItem {
  updated?: string
  summary?: string | { '@_type'?: string; '#text'?: string }
}

function textContent(value: string | { '#text'?: string } | undefined): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return String(value['#text'] ?? '')
  return ''
}

/**
 * UK Government "News and communications" feed (confirmed live 2026-08-09:
 * Atom, no auth required — real cross-department announcements: defence,
 * health regulation, foreign affairs). A genuinely high-volume, mixed-topic
 * feed by design (it aggregates every UK government department) — kept at
 * `category: 'government'` as the closest fit, same stopgap UN/WHO/EU
 * Commission use for broad institutional output. See
 * docs/decisions/0016-institutional-source-expansion.md.
 */
export class UkGovernmentConnector extends RssConnector {
  constructor() {
    super({
      id: 'uk-government',
      name: 'UK Government',
      description: 'News and communications across UK government departments (gov.uk Atom feed) — no auth required, explicitly public.',
      feedUrl: 'https://www.gov.uk/search/news-and-communications.atom',
      version: '1.0.0',
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: ['GB'],
      supportedCategories: ['government'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const entry = raw.payload as AtomEntry
    const publishedAt = entry.updated ? parsePubDate(entry.updated) : raw.fetchedAt
    const sourceUrl = extractLinkHref(entry)
    const title = String(entry.title ?? 'Untitled UK Government announcement').trim()

    return {
      id: `${this.id}:${raw.externalId}`,
      title,
      description: stripHtmlDescription(textContent(entry.summary), title),
      country: 'United Kingdom',
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
