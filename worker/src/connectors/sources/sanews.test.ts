import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkForDuplicate, computeContentHash, InMemoryDuplicateIndex } from '../../pipeline/dedupe'
import { parseRssItems } from '../base/RssConnector'
import { SAnewsConnector, SAnewsFeaturesConnector } from './sanews'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const newsFixture = readFileSync(join(fixtureDir, 'sanews-news.xml'), 'utf-8')
const featuresFixture = readFileSync(join(fixtureDir, 'sanews-features.xml'), 'utf-8')

describe('SAnewsConnector', () => {
  const connector = new SAnewsConnector()

  it('is enabled, typed as an rss source, and scoped to South Africa', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['ZA'])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, newsFixture)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('sanews')
    expect(raw[0].externalId).toMatch(/^\d+ at https:\/\/www\.sanews\.gov\.za/)
  })

  it('normalizes into a schema-valid NormalizedEvent using the human-readable article URL, not the feed URL', () => {
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`sanews:${rawEvent.externalId}`)
    expect(event.country).toBe('South Africa')
    expect(event.category).toBe('government')
    expect(event.source).toBe('SAnews')
    // Requirement: the "read original source" URL must be the human-readable
    // article page, never the .xml feed endpoint itself.
    expect(event.sourceUrl).toMatch(/^https:\/\/www\.sanews\.gov\.za\/south-africa\//)
    expect(event.sourceUrl).not.toMatch(/\.xml$/)

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('never treats a government self-report as independently verified', () => {
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const event = connector.normalize(rawEvent)
    expect(event.verificationStatus).toBe('unverified')
  })

  it('seeds confirmingSources with itself, so a later independent report attaches rather than duplicates', () => {
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const event = connector.normalize(rawEvent)
    expect(event.confirmingSources).toEqual([{ connectorId: 'sanews', sourceUrl: event.sourceUrl, reportedAt: event.publishedAt }])
  })

  it('strips embedded HTML markup from the description', () => {
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const event = connector.normalize(rawEvent)
    expect(event.description).not.toMatch(/<[^>]+>/)
    expect(event.description.length).toBeGreaterThan(0)
  })

  it("does not fabricate an author field from the feed's internal CMS editor username", () => {
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const event = connector.normalize(rawEvent)
    // dc:creator values in this feed are internal editor handles (e.g. "Neo"), not
    // journalist bylines — NormalizedEvent has no field for it, and none of the
    // real text fields should surface it as if it were meaningful attribution.
    expect(event.title).not.toContain('Neo')
    expect(event.description).not.toContain('Neo')
    expect(event.people).toEqual([])
  })

  it('rejects an event with a missing required field', () => {
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const event = connector.normalize(rawEvent)
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })

  it('throws a clear error rather than silently returning nothing when the feed is unreachable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch
    try {
      await expect(connector.fetch()).rejects.toThrow(/sanews.*HTTP 503/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('reports unhealthy (not a crash) when the feed endpoint fails', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    try {
      const health = await connector.healthCheck()
      expect(health.healthy).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('SAnewsFeaturesConnector', () => {
  const connector = new SAnewsFeaturesConnector()

  it('is a distinct connector id from the news feed, sharing the same normalize/validate logic', () => {
    expect(connector.id).toBe('sanews-features')
    expect(connector.name).toBe('SAnews Features')

    const [rawEvent] = parseRssItems(connector.id, featuresFixture)
    const event = connector.normalize(rawEvent)
    expect(event.id).toBe(`sanews-features:${rawEvent.externalId}`)
    expect(event.country).toBe('South Africa')
    expect(connector.validate(event).valid).toBe(true)
  })
})

describe('SAnews vs. an independent source reporting the same event', () => {
  it('a byte-identical report under a different id is caught as a duplicate/merge candidate, not silently ingested as a new event', async () => {
    const connector = new SAnewsConnector()
    const [rawEvent] = parseRssItems(connector.id, newsFixture)
    const first = connector.normalize(rawEvent)

    const index = new InMemoryDuplicateIndex()
    const firstOutcome = await checkForDuplicate(first, index)
    expect(firstOutcome.kind).toBe('new')
    await index.remember({
      id: first.id,
      contentHash: await computeContentHash(first),
      title: first.title,
      description: first.description,
      status: first.status,
      importance: first.importance,
    })

    // Simulate an independent connector reporting the exact same story text under a different id.
    const secondReporterEvent = { ...first, id: 'other-source:different-external-id' }
    const secondOutcome = await checkForDuplicate(secondReporterEvent, index)
    expect(secondOutcome.kind).toBe('duplicate')
    if (secondOutcome.kind !== 'duplicate') throw new Error('unreachable')
    expect(secondOutcome.existingId).toBe(first.id)
  })
})
