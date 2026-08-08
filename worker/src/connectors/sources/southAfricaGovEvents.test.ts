import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildEventsUrl, parseGovZaEventRows, SouthAfricaGovEventsConnector } from './southAfricaGovEvents'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixtureHtml = readFileSync(join(fixtureDir, 'gov-za-events.html'), 'utf-8')

describe('buildEventsUrl', () => {
  it('builds the real, verified start_date/end_date query gov.za\'s own sort links expose', () => {
    const url = buildEventsUrl(new Date('2026-08-08T00:00:00Z'))
    expect(url).toBe('https://www.gov.za/news/events?start_date=2026-08-08&end_date=2026-12-06')
  })
})

describe('SouthAfricaGovEventsConnector', () => {
  const connector = new SouthAfricaGovEventsConnector()

  it('is enabled, typed as a dataset source (structured HTML, not RSS/API), and scoped to South Africa', () => {
    expect(connector.enabled).toBe(true)
    expect(connector.type).toBe('dataset')
    expect(connector.supportedCategories).toEqual(['government'])
    expect(connector.supportedCountries).toEqual(['ZA'])
  })

  it('parses the real captured fixture into 3 rows', () => {
    const rows = parseGovZaEventRows(fixtureHtml)
    expect(rows).toHaveLength(3)
    expect(rows[0].titleText).toContain('National Women')
    expect(rows[0].titleHref).toBe(
      '/news/media-advisories/government-activities/president-cyril-ramaphosa-leads-2026-national-womens',
    )
  })

  it('extracts a single date for a single-day event', () => {
    const [singleDay] = parseGovZaEventRows(fixtureHtml)
    expect(singleDay.dates).toEqual(['2026-08-09T12:00:00Z'])
  })

  it('extracts both dates for a date-range event, in document order', () => {
    const [, rangeEvent] = parseGovZaEventRows(fixtureHtml)
    expect(rangeEvent.dates).toEqual(['2026-08-10T12:00:00Z', '2026-08-11T12:00:00Z'])
  })

  it('normalizes a single-day row with no fabricated endTime', () => {
    const [row] = parseGovZaEventRows(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })

    expect(event.startTime).toBe('2026-08-09T12:00:00Z')
    expect(event.endTime).toBeUndefined()
    expect(event.status).toBe('scheduled')
    expect(event.country).toBe('South Africa')
    expect(event.category).toBe('government')
    // Real entity from the source's own &#039;-decoded title — never re-escaped or altered.
    expect(event.title).toBe("President Cyril Ramaphosa leads 2026 National Women's Day Commemoration, 9 Aug")
  })

  it('normalizes a date-range row with a real, distinct endTime', () => {
    const [, row] = parseGovZaEventRows(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })

    expect(event.startTime).toBe('2026-08-10T12:00:00Z')
    expect(event.endTime).toBe('2026-08-11T12:00:00Z')
  })

  it('resolves the relative title href into a real, absolute, human-readable sourceUrl', () => {
    const [row] = parseGovZaEventRows(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })

    expect(event.sourceUrl).toBe(
      'https://www.gov.za/news/media-advisories/government-activities/president-cyril-ramaphosa-leads-2026-national-womens',
    )
  })

  it('carries the source\'s real event-category text as a tag, never fabricating one', () => {
    const [row] = parseGovZaEventRows(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })
    expect(event.tags).toEqual(['Government activities'])
  })

  it('leaves description empty rather than fabricating a synopsis the listing page never provides', () => {
    const [row] = parseGovZaEventRows(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })
    expect(event.description).toBe('')
  })

  it('produces a schema-valid NormalizedEvent for every real fixture row', () => {
    for (const row of parseGovZaEventRows(fixtureHtml)) {
      const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })
      const result = connector.validate(event)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    }
  })

  it('rejects an event with a missing required field', () => {
    const [row] = parseGovZaEventRows(fixtureHtml)
    const event = connector.normalize({ connectorId: connector.id, externalId: row.titleHref, fetchedAt: '2026-08-08T09:00:00.000Z', payload: row })
    const result = connector.validate({ ...event, title: '' })
    expect(result.valid).toBe(false)
  })

  it('returns no rows when the page has no <tbody> (defensive, not silently throwing)', () => {
    expect(parseGovZaEventRows('<p>no table here</p>')).toEqual([])
  })
})
