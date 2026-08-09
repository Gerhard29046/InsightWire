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

/**
 * `cap:event` carries NWS's own official product-type name (a finite,
 * government-defined vocabulary documented at
 * https://www.weather.gov/lwx/warningsdefined) — a real classification NWS
 * itself assigns, not a free-text keyword match. `cap:severity` is the
 * primary signal and is generally right, but a small number of product
 * types are always life-safety-critical (or always routine/informational)
 * *by definition of the product itself*, regardless of the severity level
 * NWS attached to a specific issuance. These two short, explicitly-named
 * lists only ever move the score toward what the product type itself
 * already means — every other product type is untouched and keeps the
 * `cap:severity` mapping above exactly as before.
 */
const ALWAYS_CRITICAL_EVENT_TYPES = new Set([
  'Tornado Warning',
  'Tsunami Warning',
  'Hurricane Warning',
  'Extreme Wind Warning',
  'Flash Flood Emergency',
])

const ALWAYS_LOW_EVENT_TYPES = new Set([
  'Special Weather Statement',
  'Beach Hazards Statement',
  'Hazardous Weather Outlook',
])

function resolveImportance(baseImportance: Severity, eventType: string | undefined): Severity {
  if (!eventType) return baseImportance
  if (ALWAYS_CRITICAL_EVENT_TYPES.has(eventType)) return 'critical'
  if (ALWAYS_LOW_EVENT_TYPES.has(eventType)) return 'low'
  return baseImportance
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
      // InsightWire is not a weather platform — NWS's feed is 100% routine
      // weather (forecasts/statements/warnings), none of it a genuine
      // natural disaster in its own right, so no honest non-empty value
      // exists here now that 'weather' has been removed from CATEGORY_IDS.
      // See `enabled: false` below, the real fix.
      supportedCategories: [],
      // Disabled, not deleted: the connector class, its severity-mapping
      // logic, and its tests all stay intact (see
      // docs/decisions/0014-remove-weather-keep-natural-disasters.md) in
      // case a future product decision wants routine weather back — but
      // ConnectorRegistry.listEnabled() (what ConnectorManager actually
      // schedules) now skips it entirely, so it never collects or queues
      // another item.
      enabled: false,
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
      // Unreachable in practice (the connector is disabled above), kept
      // only so this method still type-checks. 'natural_disasters' is the
      // least-wrong placeholder — NWS content is never actually a natural
      // disaster in its own right; there's no honest non-empty CategoryId
      // for what this feed produces now that 'weather' no longer exists.
      category: 'natural_disasters',
      source: this.name,
      sourceUrl,
      publishedAt,
      updatedAt: publishedAt,
      confirmingSources: [{ connectorId: this.id, sourceUrl, reportedAt: publishedAt }],
      importance: resolveImportance(
        (severity ? CAP_SEVERITY_TO_IMPORTANCE[severity] : undefined) ?? UNSCORED_IMPORTANCE,
        entry['cap:event'],
      ),
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
