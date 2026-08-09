import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { UsWhiteHouseConnector } from './usWhiteHouse'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'us-white-house.xml'), 'utf-8')

describe('UsWhiteHouseConnector', () => {
  const connector = new UsWhiteHouseConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['US'])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('us-white-house')
    expect(raw[0].externalId).toMatch(/^https:\/\/www\.whitehouse\.gov/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent with United States as country', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`us-white-house:${rawEvent.externalId}`)
    expect(event.title).toBe('Nominations Sent to the Senate')
    expect(event.country).toBe('United States')
    expect(event.category).toBe('government')
    expect(event.source).toBe('The White House')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('strips embedded HTML and the "appeared first on" WordPress boilerplate from the description', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    expect(event.description).not.toMatch(/<[^>]+>/)
    expect(event.description).not.toContain('appeared first on')
    expect(event.description).toContain('NOMINATIONS SENT TO THE SENATE')
  })

  it('rejects an event with a missing required field', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })
})
