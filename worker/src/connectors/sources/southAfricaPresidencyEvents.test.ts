import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePresidencyEventItems, SouthAfricaPresidencyEventsConnector } from './southAfricaPresidencyEvents'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureHtml = readFileSync(join(fixtureDir, 'presidency-events.html'), 'utf-8')

describe('SouthAfricaPresidencyEventsConnector', () => {
  const connector = new SouthAfricaPresidencyEventsConnector()

  it('is enabled, typed as a dataset source (structured HTML, not RSS/API), and scoped to South Africa', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('dataset')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['ZA'])
  })

  it('parses the real captured fixture into 3 items', () => {
    const items = parsePresidencyEventItems(fixtureHtml)
    expect(items).toHaveLength(3)
    expect(items[0].titleText).toBe('BBC Summit Gala Dinner and Awards')
    expect(items[0].nodeHref).toBe('/node/10326')
    expect(items[0].startDateTime).toBe('2026-08-13T12:00:00Z')
    expect(items[0].timeRangeText).toBe('18h00 - 20h00')
  })

  it('combines the date-only field with the real local SAST time range into precise UTC instants', () => {
    const [item] = parsePresidencyEventItems(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })

    // 18h00 SAST (UTC+2) on 2026-08-13 = 16:00 UTC; 20h00 SAST = 18:00 UTC.
    expect(event.startTime).toBe('2026-08-13T16:00:00.000Z')
    expect(event.endTime).toBe('2026-08-13T18:00:00.000Z')
  })

  it('resolves the relative node href into a real, absolute sourceUrl', () => {
    const [item] = parsePresidencyEventItems(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })
    expect(event.sourceUrl).toBe('https://www.thepresidency.gov.za/node/10326')
  })

  it('never fabricates an endTime for an item with no genuine second time in the source text', () => {
    const items = parsePresidencyEventItems(fixtureHtml)
    const item = { ...items[0], timeRangeText: '18h00' } // A hypothetical point-in-time event, no range.
    const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })
    expect(event.startTime).toBe('2026-08-13T16:00:00.000Z')
    expect(event.endTime).toBeUndefined()
  })

  it('falls back to the source\'s own date-only placeholder when no time-of-day text exists at all, never inventing one', () => {
    const items = parsePresidencyEventItems(fixtureHtml)
    const item = { ...items[0], timeRangeText: undefined }
    const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })
    expect(event.startTime).toBe('2026-08-13T12:00:00Z')
    expect(event.endTime).toBeUndefined()
  })

  it('leaves description empty rather than fabricating a synopsis the grid never provides', () => {
    const [item] = parsePresidencyEventItems(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })
    expect(event.description).toBe('')
  })

  it('produces a schema-valid, scheduled NormalizedEvent for every real fixture item', () => {
    for (const item of parsePresidencyEventItems(fixtureHtml)) {
      const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })
      expect(event.status).toBe('scheduled')
      expect(event.country).toBe('South Africa')
      const result = connector.validate(event)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    }
  })

  it('rejects an event with a missing required field', () => {
    const [item] = parsePresidencyEventItems(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: item.nodeHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: item })
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })

  it('returns no items for a page with no item-columns blocks (defensive, not silently throwing)', () => {
    expect(parsePresidencyEventItems('<p>empty page</p>')).toEqual([])
  })
})
