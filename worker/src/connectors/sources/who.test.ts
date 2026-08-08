import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { WhoConnector } from './who'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'who.xml'), 'utf-8')

describe('WhoConnector', () => {
  const connector = new WhoConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
  })

  it('parses the fixture feed into raw events, using the guid over the link', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('who-news')
    expect(raw[0].externalId).toMatch(/^urn:uuid:/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`who-news:${rawEvent.externalId}`)
    expect(event.title).not.toHaveLength(0)
    expect(event.description).not.toHaveLength(0)
    expect(event.category).toBe('government')
    expect(event.source).toBe('WHO News')
    expect(event.country).toBe('Global')
    expect(event.verificationStatus).toBe('unverified')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('rejects an event with an invalid sourceUrl', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    const broken = { ...event, sourceUrl: 'not-a-url' }
    const result = connector.validate(broken)
    expect(result.valid).toBe(false)
  })
})
