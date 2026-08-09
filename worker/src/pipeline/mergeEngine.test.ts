import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { mergeEvents } from './mergeEngine'

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Storm approaches coast',
    description: 'A tropical storm is approaching the coastline.',
    country: 'Global',
    category: 'natural_disasters',
    source: 'NASA News',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: ['storm'],
    tags: ['weather-alert'],
    status: 'developing',
    confirmingSources: [{ connectorId: 'nasa-news', reportedAt: '2026-01-01T00:00:00.000Z' }],
    ...overrides,
  }
}

describe('mergeEvents', () => {
  it('keeps the existing event id — the incoming id is discarded', () => {
    const existing = makeEvent()
    const incoming = makeEvent({ id: 'gdacs-alerts:ev-2', source: 'GDACS', confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }] })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.id).toBe(existing.id)
  })

  it('unions confirming sources, deduped by connector', () => {
    const existing = makeEvent()
    const incoming = makeEvent({ confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }] })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.confirmingSources?.map((s) => s.connectorId).sort()).toEqual(['gdacs-alerts', 'nasa-news'])
  })

  it('does not duplicate a confirming source already recorded from the same connector', () => {
    const existing = makeEvent()
    const incoming = makeEvent({ confirmingSources: [{ connectorId: 'nasa-news', reportedAt: '2026-01-01T02:00:00.000Z' }] })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.confirmingSources).toHaveLength(1)
  })

  it('unions tags and keywords rather than picking one side', () => {
    const existing = makeEvent({ tags: ['weather-alert'], keywords: ['storm'] })
    const incoming = makeEvent({
      tags: ['tropical-cyclone'],
      keywords: ['coast', 'storm'],
      confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }],
    })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.tags.sort()).toEqual(['tropical-cyclone', 'weather-alert'])
    expect(mergedEvent.keywords.sort()).toEqual(['coast', 'storm'])
  })

  it('raises confidence when a genuinely new source confirms the event', () => {
    const existing = makeEvent({ confidence: 0.4 })
    const incoming = makeEvent({
      confidence: 0.4,
      confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }],
    })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.confidence).toBeCloseTo(0.55, 5)
  })

  it('caps confidence at 1 even with many confirming sources', () => {
    const existing = makeEvent({ confidence: 0.95 })
    const incoming = makeEvent({
      confidence: 0.95,
      confirmingSources: [
        { connectorId: 'a', reportedAt: '2026-01-01T01:00:00.000Z' },
        { connectorId: 'b', reportedAt: '2026-01-01T01:00:00.000Z' },
        { connectorId: 'c', reportedAt: '2026-01-01T01:00:00.000Z' },
      ],
    })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.confidence).toBe(1)
  })

  it('does not raise confidence when the "new" source was already confirming (re-fetch, not a real confirmation)', () => {
    const existing = makeEvent({ confidence: 0.4 })
    const incoming = makeEvent({ confidence: 0.3 })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.confidence).toBe(0.4)
  })

  it('takes the higher importance of the two events', () => {
    const existing = makeEvent({ importance: 'medium' })
    const incoming = makeEvent({ importance: 'critical', confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }] })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.importance).toBe('critical')
  })

  it('never lowers importance when the incoming event is less severe', () => {
    const existing = makeEvent({ importance: 'critical' })
    const incoming = makeEvent({ importance: 'low', confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }] })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.importance).toBe('critical')
  })

  it('takes the later updatedAt timestamp', () => {
    const existing = makeEvent({ updatedAt: '2026-01-01T00:00:00.000Z' })
    const incoming = makeEvent({
      updatedAt: '2026-01-02T00:00:00.000Z',
      confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-02T00:00:00.000Z' }],
    })
    const { mergedEvent } = mergeEvents({ existing, incoming })
    expect(mergedEvent.updatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('produces a timeline entry naming the new confirming source', () => {
    const existing = makeEvent()
    const incoming = makeEvent({ confirmingSources: [{ connectorId: 'gdacs-alerts', reportedAt: '2026-01-01T01:00:00.000Z' }] })
    const { timelineEntry } = mergeEvents({ existing, incoming })
    expect(timelineEntry.label).toContain('gdacs-alerts')
    expect(timelineEntry.label).toContain('2 confirming sources')
  })

  it('falls back to a re-confirmation label when no new source is actually added', () => {
    const existing = makeEvent()
    const incoming = makeEvent()
    const { timelineEntry } = mergeEvents({ existing, incoming })
    expect(timelineEntry.label).toContain('Re-confirmed by')
  })
})
