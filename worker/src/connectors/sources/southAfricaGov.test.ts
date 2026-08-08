import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../base/RssConnector'
import { SouthAfricaGovConnector } from './southAfricaGov'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureXml = readFileSync(join(fixtureDir, 'south-africa-gov.xml'), 'utf-8')

describe('SouthAfricaGovConnector', () => {
  const connector = new SouthAfricaGovConnector()

  it('is enabled and typed as an rss source', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('rss')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['ZA'])
  })

  it('parses the real captured feed fixture into raw events', () => {
    const raw = parseRssItems(connector.id, fixtureXml)
    expect(raw.length).toBeGreaterThan(0)
    expect(raw[0].connectorId).toBe('south-africa-gov')
    // This feed's <guid> is a Drupal node reference ("845358 at
    // https://www.gov.za"), not a URL — extractExternalId correctly prefers
    // guid over <link> per RssConnector's own precedence.
    expect(raw[0].externalId).toMatch(/^\d+ at https:\/\/www\.gov\.za/)
  })

  it('normalizes a raw item into a schema-valid NormalizedEvent with South Africa as country', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.id).toBe(`south-africa-gov:${rawEvent.externalId}`)
    expect(event.title).toContain('Cabinet meeting')
    expect(event.country).toBe('South Africa')
    expect(event.category).toBe('government')
    expect(event.source).toBe('South African Government (Cabinet & Speeches)')

    const result = connector.validate(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('strips embedded HTML markup from the description rather than showing raw tags', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)

    expect(event.description).not.toMatch(/<[^>]+>/)
    expect(event.description).not.toContain('&nbsp;')
    expect(event.description).not.toContain('&amp;')
    // Real content from the live feed capture should survive the strip.
    expect(event.description).toContain('Economic Fortitude in Action')
  })

  it('rejects an event with a missing required field', () => {
    const [rawEvent] = parseRssItems(connector.id, fixtureXml)
    const event = connector.normalize(rawEvent)
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })
})
