import type { NormalizedEvent } from './normalizedEvent'

/**
 * How precisely an event's real location is known — never a claim about
 * where it "probably" happened. `NormalizedEvent` today only ever carries
 * enough information to resolve to 'exact', 'country', or 'unknown' (see
 * resolveEventGeography below); 'province' and 'region' are real,
 * documented slots for information no connector currently supplies
 * structurally (province names like "Gauteng" appear only as free text
 * inside titles/descriptions today — see the South Africa connectors —
 * never in a field this function can read). Keeping them in the type now
 * means a future connector that genuinely adds structured province/region
 * data only needs a new branch in resolveEventGeography, not a signature
 * change propagated through every consumer (map, API, frontend).
 */
export type GeoPrecision = 'exact' | 'province' | 'country' | 'region' | 'unknown'

export interface EventGeography {
  precision: GeoPrecision
  /** The real country name as stored on the event, or null when genuinely unknown (the 'Global' sentinel, or no country at all). Never a guess. */
  country: string | null
}

/**
 * The single source of truth for "how well do we actually know where this
 * happened" — used by the Geographic Intelligence Map (worker/src/api/mapApi.ts)
 * and any future consumer, so precision is computed identically everywhere
 * rather than re-derived ad hoc. Pure and deterministic: no network calls,
 * no fuzzy inference, no guessing a province from a government building's
 * location.
 *
 * 'Global' is this pipeline's real sentinel value for "no single country
 * applies or none was reported" (see NASA/WHO/UN connectors, and GDACS when
 * it lacks a structured gdacs:country) — treated as equivalent to no
 * country at all, never as a literal place.
 */
export function resolveEventGeography(event: NormalizedEvent): EventGeography {
  if (event.coordinates) {
    return { precision: 'exact', country: event.country !== 'Global' ? event.country : null }
  }
  if (event.country && event.country !== 'Global') {
    return { precision: 'country', country: event.country }
  }
  return { precision: 'unknown', country: null }
}
