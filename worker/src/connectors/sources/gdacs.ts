import { NormalizedEventSchema, type NormalizedEvent, type Coordinates, type Severity } from '@insightwire/shared'
import { RssConnector, parsePubDate, type RssItem } from '../base/RssConnector'
import type { RawEvent, ValidationResult } from '../types'

const UNSCORED_IMPORTANCE = 'medium' as const
const UNSCORED_CONFIDENCE = 0.4

/**
 * GDACS's own public alert-level scale (gdacs.org/Knowledge/AlertLevels) —
 * Green/Orange/Red, assigned by GDACS itself from real modeled impact data,
 * not a keyword guess. This is the fix for "routine vs. significant" weather
 * noise: every GDACS event previously landed at the same hardcoded 'medium'
 * regardless of whether it was a green minor-flood notice or a red
 * major-cyclone alert.
 */
const GDACS_ALERTLEVEL_TO_IMPORTANCE: Record<string, Severity> = {
  Red: 'critical',
  Orange: 'high',
  Green: 'low',
}

interface GdacsItem extends RssItem {
  'dc:subject'?: string
  'geo:Point'?: {
    'geo:lat'?: number
    'geo:long'?: number
  }
  /** Real, structured, single-value fields GDACS provides on every item — verified against the real feed (see __fixtures__/gdacs.xml, e.g. `<gdacs:country>Japan</gdacs:country>`). Previously ignored in favor of a hardcoded 'Global', with a comment deferring "real" country extraction to free-text parsing of the description — this structured field was simply never noticed. */
  'gdacs:country'?: string
  'gdacs:iso3'?: string
  /** GDACS's own Green/Orange/Red alert level for this item — see GDACS_ALERTLEVEL_TO_IMPORTANCE. */
  'gdacs:alertlevel'?: string
}

export class GdacsConnector extends RssConnector {
  constructor() {
    super({
      id: 'gdacs-alerts',
      name: 'GDACS',
      description:
        'Global Disaster Alert and Coordination System (gdacs.org RSS feed) — EU Joint Research Centre + UN OCHA, explicitly public domain.',
      feedUrl: 'https://www.gdacs.org/xml/rss.xml',
      version: '1.0.0',
      // GDACS issues near-real-time alerts; polled more frequently than the
      // news-style sources.
      refreshIntervalMs: 15 * 60 * 1000,
      supportedCountries: [],
      supportedCategories: ['weather'],
    })
  }

  normalize(raw: RawEvent): NormalizedEvent {
    const item = raw.payload as GdacsItem
    const publishedAt = item.pubDate ? parsePubDate(item.pubDate) : raw.fetchedAt
    const coordinates = extractCoordinates(item)
    const sourceUrl = item.link ? String(item.link) : undefined

    return {
      id: `${this.id}:${raw.externalId}`,
      title: String(item.title ?? 'Untitled GDACS alert').trim(),
      description: String(item.description ?? '').trim(),
      // Real, structured field GDACS provides on every item (`<gdacs:country>Japan</gdacs:country>`)
      // — a single authoritative country per alert, not a free-text guess.
      // A real bug this fixes: this field was previously ignored entirely in
      // favor of a hardcoded 'Global', which made every GDACS event
      // invisible to real country/region filtering (e.g. a real "flood alert
      // in Sri Lanka" showed up under every region because it reported no
      // country at all). Falls back to 'Global' only when GDACS genuinely
      // doesn't supply one (rare, but real — not every alert names a single country).
      country: item['gdacs:country']?.trim() || 'Global',
      coordinates,
      category: 'weather',
      source: this.name,
      sourceUrl,
      publishedAt,
      updatedAt: publishedAt,
      confirmingSources: [{ connectorId: this.id, sourceUrl, reportedAt: publishedAt }],
      // `gdacs:alertlevel` is GDACS's own real severity classification (see
      // GDACS_ALERTLEVEL_TO_IMPORTANCE above). Deliberately NOT deriving
      // `confidence` from `gdacs:alertscore` (the numeric score behind the
      // level) — that score measures potential humanitarian *impact
      // magnitude*, not GDACS's certainty that the report itself is
      // accurate. Treating a bigger disaster as "more certain" would be a
      // fabricated correlation, so confidence stays at the same honest
      // unscored default GDACS always had.
      importance: (item['gdacs:alertlevel'] ? GDACS_ALERTLEVEL_TO_IMPORTANCE[item['gdacs:alertlevel']] : undefined) ?? UNSCORED_IMPORTANCE,
      confidence: UNSCORED_CONFIDENCE,
      verificationStatus: 'unverified',
      language: 'en',
      people: [],
      organizations: [],
      keywords: [],
      // GDACS's own event-type code (e.g. "TC1" = tropical cyclone alert
      // level 1) — real feed-provided classification, same treatment as
      // NASA's <category> tags.
      tags: item['dc:subject'] ? [String(item['dc:subject'])] : [],
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

function extractCoordinates(item: GdacsItem): Coordinates | undefined {
  const point = item['geo:Point']
  const lat = point?.['geo:lat']
  const lng = point?.['geo:long']
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  return undefined
}
