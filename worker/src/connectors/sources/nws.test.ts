import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { NwsConnector } from './nws'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'nws.xml'), 'utf-8')

describe('NwsConnector', () => {
  const connector = new NwsConnector()

  it('is enabled, typed as rss, and scoped to the US', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCountries).toEqual(['US'])
  })

  it('parses the Atom fixture feed into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    // Fixture is 1 Test/keepalive entry + 2 real alerts.
    expect(raw.length).toBe(3)
    expect(raw[0].connectorId).toBe('nws-alerts')
    expect(raw.every((r) => r.externalId.length > 0)).toBe(true)
  })

  it('throws on Test/keepalive entries rather than producing an event', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    const testEntry = raw.find((r) => (r.payload as { 'cap:status'?: string })['cap:status'] === 'Test')
    expect(testEntry).toBeDefined()
    expect(() => connector.normalize(testEntry!)).toThrow(/Test\/keepalive/)
  })

  it('normalizes a real alert into a schema-valid NormalizedEvent using CAP fields directly', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    const realRaw = raw.find((r) => (r.payload as { 'cap:status'?: string })['cap:status'] !== 'Test')!
    const event = connector.normalize(realRaw)

    expect(event.id).toBe(`nws-alerts:${realRaw.externalId}`)
    expect(event.country).toBe('United States')
    expect(event.category).toBe('weather')
    expect(event.status).toBe('live')
    expect(event.verificationStatus).toBe('verified')
    expect(['low', 'medium', 'high', 'critical']).toContain(event.importance)
    expect(event.confidence).toBeGreaterThan(0)
    expect(event.confidence).toBeLessThanOrEqual(1)

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('extracts the alternate link href for sourceUrl from Atom link objects', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    const realRaw = raw.find((r) => (r.payload as { 'cap:status'?: string })['cap:status'] !== 'Test')!
    const event = connector.normalize(realRaw)
    expect(event.sourceUrl).toMatch(/^https:\/\/api\.weather\.gov/)
  })
})
