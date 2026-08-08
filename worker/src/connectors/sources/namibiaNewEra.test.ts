import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { NamibiaNewEraConnector } from './namibiaNewEra'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'namibia-newera.xml'), 'utf-8')

describe('NamibiaNewEraConnector', () => {
  const connector = new NamibiaNewEraConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['NA'])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('namibia-newera')
    expect(raw[0].externalId).toMatch(/^https:\/\/neweralive\.na/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent with Namibia as country', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`namibia-newera:${rawEvent.externalId}`)
    expect(event.title).not.toHaveLength(0)
    expect(event.country).toBe('Namibia')
    expect(event.category).toBe('government')
    expect(event.source).toBe('New Era (Namibia)')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('strips embedded HTML markup from the description', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    expect(event.description).not.toMatch(/<[^>]+>/)
  })

  it('rejects an event with a missing required field', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })
})
