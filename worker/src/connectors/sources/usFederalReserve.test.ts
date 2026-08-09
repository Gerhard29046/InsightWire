import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { UsFederalReserveConnector } from './usFederalReserve'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'us-federal-reserve.xml'), 'utf-8')

describe('UsFederalReserveConnector', () => {
  const connector = new UsFederalReserveConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['markets'])
    expect(connector.supportedCountries).toEqual(['US'])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('us-federal-reserve')
    expect(raw[0].externalId).toMatch(/^https:\/\/www\.federalreserve\.gov/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent with United States as country and markets as category', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`us-federal-reserve:${rawEvent.externalId}`)
    expect(event.title).toContain('Federal Reserve Board')
    expect(event.country).toBe('United States')
    expect(event.category).toBe('markets')
    expect(event.source).toBe('US Federal Reserve')

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
