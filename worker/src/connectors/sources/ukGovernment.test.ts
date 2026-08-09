import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { UkGovernmentConnector } from './ukGovernment'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'uk-government.xml'), 'utf-8')

describe('UkGovernmentConnector', () => {
  const connector = new UkGovernmentConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['GB'])
  })

  it('parses the real captured Atom feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('uk-government')
    expect(raw[0].externalId).toMatch(/^tag:www\.gov\.uk/)
  })

  it('normalizes a raw Atom entry into a schema-valid NormalizedEvent using <updated>/<summary> (not <pubDate>/<description>)', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`uk-government:${rawEvent.externalId}`)
    expect(event.title).toBe('UK armed forces step up monitoring of increased Russian activity in UK waters')
    expect(event.description).toContain('Royal Navy warships')
    expect(event.country).toBe('United Kingdom')
    expect(event.category).toBe('government')
    expect(event.sourceUrl).toMatch(/^https:\/\/www\.gov\.uk/)

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
