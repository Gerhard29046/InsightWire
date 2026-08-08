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

  it('extracts the real per-event country from the feed\'s structured gdacs:country field, not a hardcoded "Global"', () => {
    const rawEvents = parseRssItems(connector.id, fixtureXml)
    const countries = rawEvents.map((raw) => connector.normalize(raw).country)
    // The real fixture (mirroring the live GDACS feed) has three distinct real countries, not one "Global" bucket for everything.
    expect(countries).toEqual(['Japan', 'Spain', 'Australia'])
  })

  it('falls back to "Global" only when the feed genuinely supplies no gdacs:country', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'no-country',
      fetchedAt: new Date().toISOString(),
      payload: { title: 'Alert without a named country', description: 'desc', link: 'https://gdacs.org/x', guid: { '#text': 'X2' } },
    }
    const event = connector.normalize(rawEvent)
    expect(event.country).toBe('Global')
  })

  it('maps the real gdacs:alertlevel to importance instead of a flat hardcoded "medium"', () => {
    const base = { title: 'Alert', description: 'desc', link: 'https://gdacs.org/x' }
    const red = connector.normalize({ connectorId: connector.id, externalId: 'red', fetchedAt: new Date().toISOString(), payload: { ...base, guid: { '#text': 'R1' }, 'gdacs:alertlevel': 'Red' } })
    const orange = connector.normalize({ connectorId: connector.id, externalId: 'orange', fetchedAt: new Date().toISOString(), payload: { ...base, guid: { '#text': 'O1' }, 'gdacs:alertlevel': 'Orange' } })
    const green = connector.normalize({ connectorId: connector.id, externalId: 'green', fetchedAt: new Date().toISOString(), payload: { ...base, guid: { '#text': 'G1' }, 'gdacs:alertlevel': 'Green' } })
    expect(red.importance).toBe('critical')
    expect(orange.importance).toBe('high')
    expect(green.importance).toBe('low')
  })

  it('falls back to "medium" importance only when the feed genuinely supplies no alertlevel', () => {
    const event = connector.normalize({
      connectorId: connector.id,
      externalId: 'no-level',
      fetchedAt: new Date().toISOString(),
      payload: { title: 'Alert without a level', description: 'desc', link: 'https://gdacs.org/x', guid: { '#text': 'X3' } },
    })
    expect(event.importance).toBe('medium')
  })

  it('the real fixture items carry their real Green alertlevel through to a "low" importance, not the old flat "medium"', () => {
    const rawEvents = parseRssItems(connector.id, fixtureXml)
    const importanceValues = rawEvents.map((raw) => connector.normalize(raw).importance)
    expect(importanceValues).toEqual(['low', 'low', 'low'])
  })
})
