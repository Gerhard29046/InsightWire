import { describe, expect, it } from 'vitest'
import { ConfigurableTrustRegistry, createDefaultTrustRegistry, DEFAULT_CATEGORY_TRUST } from './trust'

describe('ConfigurableTrustRegistry', () => {
  it('falls back to a conservative default for an unregistered connector', () => {
    const registry = new ConfigurableTrustRegistry()
    const profile = registry.getProfile('unknown-connector')
    expect(profile.category).toBe('rss')
    expect(profile.trustScore).toBe(DEFAULT_CATEGORY_TRUST.rss)
  })

  it('uses the category default trust score when none is explicitly set', () => {
    const registry = new ConfigurableTrustRegistry()
    registry.setProfile('a', { category: 'government' })
    expect(registry.getProfile('a').trustScore).toBe(DEFAULT_CATEGORY_TRUST.government)
  })

  it('an explicit trustScore override wins over the category default', () => {
    const registry = new ConfigurableTrustRegistry()
    registry.setProfile('a', { category: 'government', trustScore: 0.99 })
    expect(registry.getProfile('a').trustScore).toBe(0.99)
  })

  it('is configurable without touching connector code — re-setting a profile updates it', () => {
    const registry = new ConfigurableTrustRegistry()
    registry.setProfile('a', { category: 'community' })
    expect(registry.getProfile('a').trustScore).toBe(DEFAULT_CATEGORY_TRUST.community)
    registry.setProfile('a', { category: 'official' })
    expect(registry.getProfile('a').trustScore).toBe(DEFAULT_CATEGORY_TRUST.official)
  })
})

describe('createDefaultTrustRegistry', () => {
  it('seeds every registered connector with a government or official profile', () => {
    const registry = createDefaultTrustRegistry()
    const ids = [
      'nasa-news',
      'who-news',
      'un-news',
      'gdacs-alerts',
      'nws-alerts',
      'south-africa-gov',
      'namibia-newera',
      'zimbabwe-zbc',
      'sanews',
      'sanews-features',
    ]
    for (const id of ids) {
      const profile = registry.getProfile(id)
      expect(['government', 'official']).toContain(profile.category)
      expect(profile.trustScore).toBeGreaterThanOrEqual(0.9)
    }
  })
})
