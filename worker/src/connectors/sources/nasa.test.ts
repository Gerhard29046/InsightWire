import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { NasaConnector } from './nasa'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'nasa.xml'), 'utf-8')

describe('NasaConnector', () => {
  const connector = new NasaConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
  })

  it('parses the fixture feed into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('nasa-news')
    expect(raw[0].externalId).toMatch(/^https:\/\/www\.nasa\.gov/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`nasa-news:${rawEvent.externalId}`)
    expect(event.title).not.toHaveLength(0)
    expect(event.description).not.toHaveLength(0)
    expect(event.category).toBe('science')
    expect(event.source).toBe('NASA News')
    expect(event.sourceUrl).toMatch(/^https:\/\//)
    expect(event.verificationStatus).toBe('unverified')
    expect(() => new Date(event.publishedAt).toISOString()).not.toThrow()

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('carries the feed-provided categories through as tags', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    expect(event.tags.length).toBeGreaterThan(0)
  })

  it('rejects an event with a missing required field', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    const broken = { ...event, title: '' }
    const result = connector.validate(broken)
    expect(result.valid).toBe(false)
    expect(result.errors?.length).toBeGreaterThan(0)
  })
})
