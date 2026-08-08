import { NormalizedEventSchema, type NormalizedEvent, type Severity } from '@insightwire/shared'
import { RssConnector, extractLinkHref, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE: Severity = 'medium'
const UNSCORED_CONFIDENCE = 0.4

/** CAP (Common Alerting Protocol) fields NWS's Atom feed adds per entry. */
interface CapEntry extends RssItem {
  updated?: string
  published?: string
  summary?: string
  'cap:status'?: string
  'cap:event'?: string
  'cap:severity'?: string
  'cap:certainty'?: string
  'cap:areaDesc'?: string
}

/** CAP's own severity scale — an official field, not a guess, so it's used directly rather than left at the placeholder. */
const CAP_SEVERITY_TO_IMPORTANCE: Record<string, Severity> = {
  Extreme: 'critical',
  Severe: 'high',
  Moderate: 'medium',
  Minor: 'low',
}

/** Same reasoning as severity: CAP's certainty scale is official, not fabricated. */
const CAP_CERTAINTY_TO_CONFIDENCE: Record<string, number> = {
  Observed: 0.95,
  Likely: 0.75,
  Possible: 0.5,
  Unlikely: 0.25,
}

export class NwsConnector extends RssConnector {
  constructor() {
    super({
      id: 'nws-alerts',
      name: 'NWS Active Alerts',
      description:
        'NOAA National Weather Service active watches/warnings/advisories (api.weather.gov) — official public API, no auth required, US government work (public domain).',
      feedUrl: 'https://api.weather.gov/alerts/active.atom',
      version: '1.0.0',
      // Weather alerts are time-critical; polled more frequently than the
      // news-style sources.
      refreshIntervalMs: 15 * 60 * 1000,
      // The only connector so far whose source is genuinely single-country
      // by definition (NWS only ever covers the US) — unlike NASA/WHO/UN/
      // GDACS, 'United States' below is a fact about this feed's scope, not
      // a guess about an individual item's geography.
      supportedCountries: ['US'],
      supportedCategories: ['weather'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const entry = raw.payload as CapEntry

    // NWS's feed includes periodic non-alert "Monitoring message only,
    // please disregard" keepalive entries (confirmed present in the live
    // feed). Throwing here — rather than trying to encode "this isn't a
    // real alert" onto a NormalizedEvent — lets the existing per-item
    // error handling (ConnectorManager / the queue consumer) skip it like
    // any other malformed item, without inventing a new event state.
    if (entry['cap:status'] === 'Test') {
      throw new Error(`${this.id}: skipping Test/keepalive entry (${raw.externalId})`)
    }

    const publishedAt = entry.published ?? entry.updated ?? raw.fetchedAt
    const severity = entry['cap:severity']
    const certainty = entry['cap:certainty']
    const sourceUrl = extractLinkHref(entry)

    return {
      id: `${this.id}:${raw.externalId}`,
      title: String(entry.title ?? entry['cap:event'] ?? 'Untitled NWS alert').trim(),
      description: String(entry.summary ?? '').trim(),
      country: 'United States',
      city: entry['cap:areaDesc'] ? String(entry['cap:areaDesc']) : undefined,
      category: 'weather',
      source: this.name,
      sourceUrl,
      publishedAt,
      updatedAt: publishedAt,
      confirmingSources: [{ connectorId: this.id, sourceUrl, reportedAt: publishedAt }],
      importance: (severity ? CAP_SEVERITY_TO_IMPORTANCE[severity] : undefined) ?? UNSCORED_IMPORTANCE,
      confidence: (certainty ? CAP_CERTAINTY_TO_CONFIDENCE[certainty] : undefined) ?? UNSCORED_CONFIDENCE,
      verificationStatus: 'verified',
      language: 'en',
      people: [],
      organizations: [],
      keywords: [],
      tags: entry['cap:event'] ? [String(entry['cap:event'])] : [],
      status: 'live',
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
