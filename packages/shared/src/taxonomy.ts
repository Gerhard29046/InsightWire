/**
 * Pure classification vocabulary shared by the frontend and the backend.
 *
 * These are string unions only — no icons, colors, or other presentation
 * concerns. The frontend's lib/categories.ts and lib/severity.ts own that
 * metadata locally and re-export the underlying types from here, so the
 * taxonomy itself is declared exactly once.
 */
/**
 * 'weather' was removed (not renamed at the DB level — see the
 * natural_disasters migration's comment): InsightWire is not a weather
 * platform, and routine weather (forecasts, thunderstorm/wind statements,
 * ordinary NWS alerts) has no place in a journalist intelligence product.
 * 'natural_disasters' replaces it for the narrower, genuinely newsworthy
 * subset (major earthquake, tsunami, volcanic eruption, major cyclone,
 * catastrophic flooding, major wildfire) — gated by GDACS's own real
 * alertlevel severity classification, not a keyword heuristic (see
 * gdacs.ts). The `categories` Postgres table keeps its old `weather` row
 * for historical-row FK integrity; no existing data was deleted.
 */
export const CATEGORY_IDS = [
  'government',
  'business',
  'courts',
  'markets',
  'elections',
  'natural_disasters',
  'conflicts',
  'science',
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const

export type Severity = (typeof SEVERITY_LEVELS)[number]

export const VERIFICATION_STATUSES = ['verified', 'unverified', 'disputed'] as const

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const EVENT_STATUS_IDS = ['live', 'developing', 'scheduled', 'resolved'] as const

export type EventStatusId = (typeof EVENT_STATUS_IDS)[number]
