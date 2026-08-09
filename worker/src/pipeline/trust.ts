/**
 * Trust is a property of *where information comes from*, not of any single
 * event — kept as its own registry rather than folded into the
 * `SourceConnector` interface (worker/src/connectors/types.ts), since it's
 * meant to be tunable without a code change/redeploy, unlike a connector's
 * own static facts about itself (id, refreshIntervalMs, etc.).
 */
export type SourceCategory =
  | 'official'
  | 'government'
  | 'company'
  | 'ngo'
  | 'university'
  | 'rss'
  | 'community'

/**
 * Starting points, not measurements — an explicit per-connector
 * `trustScore` override always wins (see `setProfile`). Ordered roughly by
 * how directly accountable the publisher is for what it publishes.
 */
export const DEFAULT_CATEGORY_TRUST: Record<SourceCategory, number> = {
  official: 0.95,
  government: 0.9,
  university: 0.85,
  ngo: 0.8,
  company: 0.7,
  rss: 0.6,
  community: 0.4,
}

export interface SourceTrustProfile {
  category: SourceCategory
  trustScore: number
}

/**
 * Deliberately separate from `NormalizedEvent.importance` — trust describes
 * the source's general reliability; importance describes one event's
 * significance. Conflating them would make a routine announcement from a
 * highly-trusted source outscore a major story from a newer one.
 */
export interface TrustRegistry {
  getProfile(connectorId: string): SourceTrustProfile
  setProfile(connectorId: string, profile: { category: SourceCategory; trustScore?: number }): void
}

const UNKNOWN_CONNECTOR_CATEGORY: SourceCategory = 'rss'

export class ConfigurableTrustRegistry implements TrustRegistry {
  private readonly profiles = new Map<string, SourceTrustProfile>()

  getProfile(connectorId: string): SourceTrustProfile {
    return (
      this.profiles.get(connectorId) ?? {
        category: UNKNOWN_CONNECTOR_CATEGORY,
        trustScore: DEFAULT_CATEGORY_TRUST[UNKNOWN_CONNECTOR_CATEGORY],
      }
    )
  }

  setProfile(connectorId: string, profile: { category: SourceCategory; trustScore?: number }): void {
    this.profiles.set(connectorId, {
      category: profile.category,
      trustScore: profile.trustScore ?? DEFAULT_CATEGORY_TRUST[profile.category],
    })
  }
}

/**
 * Seeded for every registered connector. NASA and NWS are US federal
 * agencies (`government`); WHO, UN, and GDACS are official international/
 * multilateral bodies (`official`); the African government/state-media
 * connectors added since are all `government` (state-owned or a direct
 * government agency) — none currently override the category default, but
 * could (e.g. `setProfile('nasa-news', { category: 'government', trustScore:
 * 0.92 })`) without touching connector code.
 *
 * Trust here describes source reliability, not truth of any given claim —
 * `south-africa-gov`/`sanews`/`sanews-features` (all literal government
 * publishers) get the same `government` trust tier as NASA/NWS, but every
 * event they produce still starts `verificationStatus: 'unverified'`
 * (deliberately not auto-upgraded to verified just because the publisher is
 * official — see sanews.ts's own doc comment). A previously real gap: the
 * South Africa/Namibia/Zimbabwe connectors were registered without a trust
 * profile for two phases before this was caught, silently falling back to
 * `UNKNOWN_CONNECTOR_CATEGORY` ('rss', trust 0.6) — fixed here, not
 * discovered until building SAnews required auditing this file again.
 */
export function createDefaultTrustRegistry(): TrustRegistry {
  const registry = new ConfigurableTrustRegistry()
  registry.setProfile('nasa-news', { category: 'government' })
  registry.setProfile('who-news', { category: 'official' })
  registry.setProfile('un-news', { category: 'official' })
  registry.setProfile('gdacs-alerts', { category: 'official' })
  registry.setProfile('nws-alerts', { category: 'government' })
  registry.setProfile('south-africa-gov', { category: 'government' })
  registry.setProfile('namibia-newera', { category: 'government' })
  registry.setProfile('zimbabwe-zbc', { category: 'government' })
  registry.setProfile('sanews', { category: 'government' })
  registry.setProfile('sanews-features', { category: 'government' })
  registry.setProfile('south-africa-gov-events', { category: 'government' })
  registry.setProfile('south-africa-presidency-events', { category: 'government' })
  // Added in the institutional-source-expansion phase (ADR 0016) — found
  // missing here (silently falling back to UNKNOWN_CONNECTOR_CATEGORY,
  // trust 0.6) while building Administration's source-reliability display,
  // the exact same class of gap this file's own doc comment already warns
  // about. Central banks/supranational executive bodies get 'official';
  // elected/executive government bodies get 'government' — same tiering
  // logic already applied to every other connector above.
  registry.setProfile('us-federal-reserve', { category: 'official' })
  registry.setProfile('us-white-house', { category: 'government' })
  registry.setProfile('uk-government', { category: 'government' })
  registry.setProfile('bank-of-england', { category: 'official' })
  registry.setProfile('eu-commission', { category: 'official' })
  registry.setProfile('ecb', { category: 'official' })
  return registry
}
