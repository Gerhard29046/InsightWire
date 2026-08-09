import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { EcbConnector } from './ecb'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'ecb.xml'), 'utf-8')

describe('EcbConnector', () => {
  const connector = new EcbConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['markets'])
    expect(connector.supportedCountries).toEqual([])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('ecb')
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent with European Union as the supranational country of origin', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`ecb:${rawEvent.externalId}`)
    expect(event.title).toContain('ECB publishes consolidated banking data')
    expect(event.country).toBe('European Union')
    expect(event.category).toBe('markets')
    expect(event.source).toBe('European Central Bank')

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
