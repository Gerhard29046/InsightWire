import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { computePriorityScore, DEFAULT_PRIORITY_WEIGHTS } from './priority'

const NOW = new Date('2026-01-02T00:00:00.000Z')

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Test event',
    description: 'A description.',
    country: 'Global',
    category: 'science',
    source: 'NASA News',
    publishedAt: '2026-01-01T23:00:00.000Z', // 1 hour before NOW
    updatedAt: '2026-01-01T23:00:00.000Z',
    importance: 'medium',
    confidence: 0.5,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
    confirmingSources: [{ connectorId: 'nasa-news', reportedAt: '2026-01-01T23:00:00.000Z' }],
    ...overrides,
  }
}

describe('computePriorityScore', () => {
  it('returns a score between 0 and 100', () => {
    const score = computePriorityScore({ event: makeEvent(), sourceTrustScore: 0.9, now: NOW })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('higher source trust increases the score, all else equal', () => {
    const low = computePriorityScore({ event: makeEvent(), sourceTrustScore: 0.3, now: NOW })
    const high = computePriorityScore({ event: makeEvent(), sourceTrustScore: 0.95, now: NOW })
    expect(high).toBeGreaterThan(low)
  })

  it('more confirming sources increases the score', () => {
    const oneSource = computePriorityScore({
      event: makeEvent({ confirmingSources: [{ connectorId: 'a', reportedAt: NOW.toISOString() }] }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    const threeSources = computePriorityScore({
      event: makeEvent({
        confirmingSources: [
          { connectorId: 'a', reportedAt: NOW.toISOString() },
          { connectorId: 'b', reportedAt: NOW.toISOString() },
          { connectorId: 'c', reportedAt: NOW.toISOString() },
        ],
      }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    expect(threeSources).toBeGreaterThan(oneSource)
  })

  it('a fresher event scores higher than a stale one', () => {
    const fresh = computePriorityScore({
      event: makeEvent({ publishedAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    const stale = computePriorityScore({
      event: makeEvent({ publishedAt: new Date(NOW.getTime() - 48 * 60 * 60_000).toISOString() }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    expect(fresh).toBeGreaterThan(stale)
  })

  it('a stale event (beyond the freshness window) does not go negative', () => {
    const veryStale = computePriorityScore({
      event: makeEvent({ publishedAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60_000).toISOString() }),
      sourceTrustScore: 0.5,
      now: NOW,
    })
    expect(veryStale).toBeGreaterThanOrEqual(0)
  })

  it('critical weather events score higher than low-severity weather events via disaster severity', () => {
    const critical = computePriorityScore({
      event: makeEvent({ category: 'weather', importance: 'critical' }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    const low = computePriorityScore({
      event: makeEvent({ category: 'weather', importance: 'low' }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    expect(critical).toBeGreaterThan(low)
  })

  it('disaster severity does not apply outside the weather category', () => {
    const criticalScience = computePriorityScore({
      event: makeEvent({ category: 'science', importance: 'critical' }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    const lowScience = computePriorityScore({
      event: makeEvent({ category: 'science', importance: 'low' }),
      sourceTrustScore: 0.8,
      now: NOW,
    })
    // Importance still feeds nothing else in this formula for non-weather categories,
    // so these should be equal (importance isn't a direct input outside disaster severity).
    expect(criticalScience).toBe(lowScience)
  })

  it('a real AI impact score overrides the category default', () => {
    const withDefault = computePriorityScore({ event: makeEvent({ category: 'science' }), sourceTrustScore: 0.5, now: NOW })
    const withAiOverride = computePriorityScore({
      event: makeEvent({ category: 'science' }),
      sourceTrustScore: 0.5,
      aiImpact: { geographic: 1, political: 1, economic: 1 },
      now: NOW,
    })
    expect(withAiOverride).toBeGreaterThan(withDefault)
  })

  it('conflicts outweigh science via category weighting, all other inputs equal', () => {
    const conflict = computePriorityScore({ event: makeEvent({ category: 'conflicts' }), sourceTrustScore: 0.8, now: NOW })
    const science = computePriorityScore({ event: makeEvent({ category: 'science' }), sourceTrustScore: 0.8, now: NOW })
    expect(conflict).toBeGreaterThan(science)
  })

  it('custom weights isolate a single input when every other weight is zeroed', () => {
    const zeroed = {
      sourceTrust: 1,
      confirmingSources: 0,
      freshness: 0,
      aiConfidence: 0,
      geographicImpact: 0,
      politicalImpact: 0,
      economicImpact: 0,
      disasterSeverity: 0,
      categoryWeight: 0,
    }
    const score = computePriorityScore({ event: makeEvent(), sourceTrustScore: 0.73, weights: zeroed, now: NOW })
    expect(score).toBe(73)
  })

  it('default weights sum to 1.0', () => {
    const sum = Object.values(DEFAULT_PRIORITY_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })
})
