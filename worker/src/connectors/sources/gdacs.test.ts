import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { GdacsConnector } from './gdacs'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'gdacs.xml'), 'utf-8')

/** The real fixture's three items are all Green (routine) — helper builds a real-shaped payload with a chosen alertlevel for testing the Orange/Red "kept" path without relying on the routine fixture data. */
function makePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Alert',
    description: 'desc',
    link: 'https://gdacs.org/x',
    'gdacs:country': 'Japan',
    'gdacs:alertlevel': 'Red',
    guid: { '#text': 'X1' },
    ...overrides,
  }
}

describe('GdacsConnector', () => {
  const connector = new GdacsConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['natural_disasters'])
  })

  it('parses the fixture feed into raw events using the non-URL guid', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('gdacs-alerts')
    expect(raw[0].externalId).not.toHaveLength(0)
  })

  it('normalizes a significant (Orange/Red) item into a schema-valid natural_disasters NormalizedEvent, including coordinates', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'red-1',
      fetchedAt: new Date().toISOString(),
      payload: { ...makePayload(), 'geo:Point': { 'geo:lat': 31, 'geo:long': 159.8 } },
    }
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`gdacs-alerts:${rawEvent.externalId}`)
    expect(event.title).not.toHaveLength(0)
    expect(event.category).toBe('natural_disasters')
    expect(event.source).toBe('GDACS')
    expect(event.coordinates).toBeDefined()
    expect(typeof event.coordinates?.lat).toBe('number')
    expect(typeof event.coordinates?.lng).toBe('number')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('carries the GDACS event-type code through as a tag', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'red-2',
      fetchedAt: new Date().toISOString(),
      payload: makePayload({ 'dc:subject': 'EQ1' }),
    }
    const event = connector.normalize(rawEvent)
    expect(event.tags.length).toBeGreaterThan(0)
  })

  it('does not fail parsing when geo coordinates are absent', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'no-geo',
      fetchedAt: new Date().toISOString(),
      payload: makePayload(),
    }
    const event = connector.normalize(rawEvent)
    expect(event.coordinates).toBeUndefined()
    expect(connector.validate(event).valid).toBe(true)
  })

  it('extracts the real per-event country from the feed\'s structured gdacs:country field, not a hardcoded "Global"', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'country-1',
      fetchedAt: new Date().toISOString(),
      payload: makePayload({ 'gdacs:country': 'Spain' }),
    }
    expect(connector.normalize(rawEvent).country).toBe('Spain')
  })

  it('falls back to "Global" only when the feed genuinely supplies no gdacs:country', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'no-country',
      fetchedAt: new Date().toISOString(),
      payload: makePayload({ 'gdacs:country': undefined }),
    }
    const event = connector.normalize(rawEvent)
    expect(event.country).toBe('Global')
  })

  it('maps Red/Orange gdacs:alertlevel to importance for the significant events that are kept', () => {
    const red = connector.normalize({ connectorId: connector.id, externalId: 'red', fetchedAt: new Date().toISOString(), payload: makePayload({ 'gdacs:alertlevel': 'Red', guid: { '#text': 'R1' } }) })
    const orange = connector.normalize({ connectorId: connector.id, externalId: 'orange', fetchedAt: new Date().toISOString(), payload: makePayload({ 'gdacs:alertlevel': 'Orange', guid: { '#text': 'O1' } }) })
    expect(red.importance).toBe('critical')
    expect(red.category).toBe('natural_disasters')
    expect(orange.importance).toBe('high')
    expect(orange.category).toBe('natural_disasters')
  })

  it('skips (throws) a Green-level item — GDACS\'s own classification of "no or minimal impact," i.e. routine weather, not journalism', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'green-1',
      fetchedAt: new Date().toISOString(),
      payload: makePayload({ 'gdacs:alertlevel': 'Green' }),
    }
    expect(() => connector.normalize(rawEvent)).toThrow(/skipping routine/)
  })

  it('skips (throws) an item with no alertlevel at all — cannot positively confirm significance, so the conservative choice is to skip', () => {
    const rawEvent = {
      connectorId: connector.id,
      externalId: 'no-level',
      fetchedAt: new Date().toISOString(),
      payload: makePayload({ 'gdacs:alertlevel': undefined }),
    }
    expect(() => connector.normalize(rawEvent)).toThrow(/skipping routine/)
  })

  it('the real fixture items (all real, currently-live Green alerts) are all skipped as routine, never stored as Journalist events', () => {
    const rawEvents = parseRssItems(connector.id, fixtureXml)
    for (const raw of rawEvents) {
      expect(() => connector.normalize(raw)).toThrow(/skipping routine/)
    }
  })
})
