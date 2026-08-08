import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { GdacsConnector } from './gdacs'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'gdacs.xml'), 'utf-8')

describe('GdacsConnector', () => {
  const connector = new GdacsConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['weather'])
  })

  it('parses the fixture feed into raw events using the non-URL guid', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('gdacs-alerts')
    expect(raw[0].externalId).not.toHaveLength(0)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent, including coordinates', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`gdacs-alerts:${rawEvent.externalId}`)
    expect(event.title).not.toHaveLength(0)
    expect(event.category).toBe('weather')
    expect(event.source).toBe('GDACS')
    expect(event.coordinates).toBeDefined()
    expect(typeof event.coordinates?.lat).toBe('number')
    expect(typeof event.coordinates?.lng).toBe('number')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('carries the GDACS event-type code through as a tag', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    expect(event.tags.length).toBeGreaterThan(0)
  })

  it('does not fail parsing when geo coordinates are absent', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'no-geo',
      fetchedAt: new Date().toISOString(),
      payload: { title: 'Alert without geo', description: 'desc', link: 'https://gdacs.org/x', guid: { '#text': 'X1' } },
    }
    const event = connector.normalize(rawEvent)
    expect(event.coordinates).toBeUndefined()
    expect(connector.validate(event).valid).toBe(true)
  })
})
