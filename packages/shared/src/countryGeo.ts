/**
 * Crosswalk between this pipeline's real `country` strings and the country
 * names used by `world-atlas`'s Natural Earth boundary data (the real,
 * legitimate geographic dataset the Geographic Intelligence Map renders —
 * see `src/lib/map/worldTopology.ts`). Needed because connectors hardcode
 * or receive common-usage English names ("United States", "Democratic
 * Republic of the Congo") while Natural Earth uses its own canonical (often
 * abbreviated) forms ("United States of America", "Dem. Rep. Congo").
 *
 * Every entry here was built by diffing this pipeline's real, observed
 * country strings (connector hardcodes in worker/src/connectors/sources/*.ts,
 * plus GDACS's real gdacs:country fixture values) against the actual 177
 * names in the installed `world-atlas` `countries-110m.json` — never a
 * generic/guessed alias list. A country string with no exact match and no
 * alias here simply isn't shaded on the map (see resolveTopologyName's
 * `undefined` return) — it still gets a real country-aggregate row and a
 * real `/feed?country=X` link; it's just honestly reported as "not shown on
 * the map" rather than silently mismatched onto the wrong shape or dropped.
 */
export const COUNTRY_NAME_ALIASES: Record<string, string> = {
  'United States': 'United States of America',
  'Democratic Republic of the Congo': 'Dem. Rep. Congo',
  'The Democratic Republic of Congo': 'Dem. Rep. Congo',
  'DR Congo': 'Dem. Rep. Congo',
  'DRC': 'Dem. Rep. Congo',
  'Republic of the Congo': 'Congo',
  'Congo-Brazzaville': 'Congo',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Central African Republic': 'Central African Rep.',
  'Czech Republic': 'Czechia',
  'Dominican Republic': 'Dominican Rep.',
  'Equatorial Guinea': 'Eq. Guinea',
  Eswatini: 'eSwatini',
  Swaziland: 'eSwatini',
  'North Macedonia': 'Macedonia',
  'Russian Federation': 'Russia',
  'South Sudan': 'S. Sudan',
  'Solomon Islands': 'Solomon Is.',
  'Western Sahara': 'W. Sahara',
  'Ivory Coast': "Côte d'Ivoire",
  Burma: 'Myanmar',
}

/**
 * Resolves a real `country` value to the name `world-atlas`'s TopoJSON
 * `properties.name` is expected to use, or `undefined` when the value is
 * definitely unmappable (the `'Global'` sentinel, which is never a real
 * place and is never shaded, or an empty value). This function only
 * performs the *name translation* — it has no access to the actual loaded
 * topology (a frontend-only asset; this module stays dependency-free so
 * the worker never needs `world-atlas`). The caller (GeoIntelligenceMap)
 * is responsible for checking the translated name against the real,
 * loaded set of topology feature names before shading anything — a
 * country whose translated name still isn't found there is reported (real
 * aggregate row, real `/feed?country=X` link) but simply left unshaded,
 * never guessed onto the wrong shape.
 */
export function resolveTopologyName(country: string | null | undefined): string | undefined {
  if (!country || country === 'Global') return undefined
  return COUNTRY_NAME_ALIASES[country] ?? country
}
