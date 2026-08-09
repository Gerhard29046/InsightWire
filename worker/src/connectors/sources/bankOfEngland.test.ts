import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { BankOfEnglandConnector } from './bankOfEngland'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'bank-of-england.xml'), 'utf-8')

describe('BankOfEnglandConnector', () => {
  const connector = new BankOfEnglandConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['markets'])
    expect(connector.supportedCountries).toEqual(['GB'])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('bank-of-england')
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent with United Kingdom as country and markets as category', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`bank-of-england:${rawEvent.externalId}`)
    expect(event.title).toBe('Green notice 2026/02')
    expect(event.country).toBe('United Kingdom')
    expect(event.category).toBe('markets')
    expect(event.source).toBe('Bank of England')

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
