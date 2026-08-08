import { REGION_COUNTRIES, countriesForRegions, regionForCountry, type RegionLabel } from '@insightwire/shared'
import { regions } from './api/taxonomy'

export type { RegionLabel }

/**
 * Real, standard geopolitical groupings — the same regions any newsroom
 * would recognize, not an invented taxonomy. The actual country lists live
 * in `@insightwire/shared` (`packages/shared/src/regions.ts`) so the worker's
 * dashboard region breakdown and this frontend filter can never disagree
 * about what "Africa" means — declared once, imported by both.
 *
 * "Region" has no backend column (a country's region is a presentation-only
 * grouping, not something `normalized_events` stores — see
 * worker/src/api/eventsApi.ts's own doc comment) and never will need one:
 * translating a region selection into the real, already-correct `countries`
 * filter (`listEvents` already does `q.in('country', query.countries)`) is
 * both simpler and more honest than adding a parallel filtering mechanism.
 *
 * "Global" is deliberately not a country list — selecting it means "no
 * country restriction," not "only events literally filed under the country
 * value 'Global'" (a real but different thing: NASA/WHO/UN-style events
 * with no single country). Journalists reaching for "Global" want
 * everything, not a narrow literal match.
 */
export { REGION_COUNTRIES, countriesForRegions, regionForCountry, regions }
