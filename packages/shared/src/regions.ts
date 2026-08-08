/**
 * Real, factual geography — which countries belong to which region — shared
 * by the frontend (feed/dashboard region filters, `src/lib/regions.ts`) and
 * the worker (`dashboardApi.ts`'s region breakdown). Declared exactly once
 * so both sides can never drift into disagreeing about what "Africa" means.
 * "Region" itself has no backend column on `NormalizedEvent` — it is always
 * translated into the real `country` field before any query runs.
 */
export const REGION_LABELS = [
  'Global',
  'North America',
  'South America',
  'Europe',
  'Middle East',
  'Africa',
  'Asia-Pacific',
] as const

export type RegionLabel = (typeof REGION_LABELS)[number]

export const REGION_COUNTRIES: Record<RegionLabel, string[]> = {
  Global: [],
  'North America': [
    'United States', 'Canada', 'Mexico', 'Guatemala', 'Belize', 'Honduras', 'El Salvador',
    'Nicaragua', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Republic',
    'Bahamas', 'Trinidad and Tobago',
  ],
  'South America': [
    'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Venezuela', 'Ecuador', 'Bolivia',
    'Paraguay', 'Uruguay', 'Guyana', 'Suriname',
  ],
  Europe: [
    'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands',
    'Belgium', 'Switzerland', 'Austria', 'Poland', 'Sweden', 'Norway', 'Denmark', 'Finland',
    'Ireland', 'Greece', 'Ukraine', 'Russia', 'Romania', 'Czech Republic', 'Hungary',
    'Belarus', 'Bulgaria', 'Croatia', 'Serbia', 'Slovakia', 'Slovenia',
  ],
  'Middle East': [
    'Israel', 'Palestine', 'Iran', 'Iraq', 'Saudi Arabia', 'United Arab Emirates', 'Qatar',
    'Kuwait', 'Bahrain', 'Oman', 'Yemen', 'Jordan', 'Lebanon', 'Syria', 'Turkey',
  ],
  Africa: [
    'South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Ethiopia', 'Ghana', 'Morocco', 'Algeria',
    'Tunisia', 'Libya', 'Sudan', 'South Sudan', 'Uganda', 'Tanzania', 'Zimbabwe', 'Zambia',
    'Namibia', 'Botswana', 'Mozambique', 'Angola', 'Democratic Republic of the Congo',
    'Republic of the Congo', 'Cameroon', 'Senegal', 'Mali', 'Niger', 'Chad', 'Somalia',
    'Rwanda', 'Burundi', 'Malawi', "Côte d'Ivoire", 'Eswatini', 'Lesotho',
  ],
  'Asia-Pacific': [
    'China', 'Japan', 'India', 'South Korea', 'North Korea', 'Indonesia', 'Philippines',
    'Vietnam', 'Thailand', 'Malaysia', 'Singapore', 'Australia', 'New Zealand', 'Pakistan',
    'Bangladesh', 'Sri Lanka', 'Myanmar', 'Cambodia', 'Laos', 'Mongolia', 'Taiwan',
    'Papua New Guinea', 'Fiji',
  ],
}

/** Reverse lookup — every mapped country's region, computed once from REGION_COUNTRIES (never duplicated by hand, so it can't drift out of sync). */
export const COUNTRY_TO_REGION: Record<string, RegionLabel> = Object.fromEntries(
  (Object.entries(REGION_COUNTRIES) as [RegionLabel, string[]][]).flatMap(([region, countries]) =>
    countries.map((country) => [country, region] as const),
  ),
)

/** "Global" or an unrecognized label both mean "no restriction" — returns `[]` in either case, same as an empty selection. */
export function countriesForRegions(selectedRegions: string[]): string[] {
  if (selectedRegions.length === 0) return []
  const merged = new Set<string>()
  for (const region of selectedRegions) {
    if (region === 'Global') return []
    const countries = REGION_COUNTRIES[region as RegionLabel]
    if (countries) countries.forEach((c) => merged.add(c))
  }
  return [...merged]
}

/** A real country not in any mapped region's list (rare, but real — e.g. a GDACS item for a country not yet added to REGION_COUNTRIES) falls back to "Global" rather than being silently dropped from every region-scoped view. */
export function regionForCountry(country: string): RegionLabel {
  return COUNTRY_TO_REGION[country] ?? 'Global'
}
