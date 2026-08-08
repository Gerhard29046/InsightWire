import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { UnConnector } from './un'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'un.xml'), 'utf-8')

describe('UnConnector', () => {
  const connector = new UnConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['government'])
  })

  it('parses the fixture feed into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('un-news')
    expect(raw[0].externalId).toMatch(/^https:\/\/news\.un\.org/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`un-news:${rawEvent.externalId}`)
    expect(event.title).not.toHaveLength(0)
    expect(event.description).not.toHaveLength(0)
    expect(event.category).toBe('government')
    expect(event.source).toBe('UN News')
    expect(event.country).toBe('Global')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('rejects an event with a missing required field', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })
})
