import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@insightwire/shared'
import { checkForDuplicate, computeContentHash, InMemoryDuplicateIndex, type DuplicateIndex } from './dedupe'

async function rememberEvent(index: DuplicateIndex, event: NormalizedEvent): Promise<void> {
  await index.remember({
    id: event.id,
    contentHash: await computeContentHash(event),
    title: event.title,
    description: event.description,
    status: event.status,
    importance: event.importance,
    category: event.category,
    country: event.country,
    publishedAt: event.publishedAt,
    source: event.source,
  })
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'nasa-news:ev-1',
    title: 'Storm approaches coast',
    description: 'A tropical storm is approaching the coastline.',
    country: 'Global',
    category: 'science',
    source: 'NASA News',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
    ...overrides,
  }
}

describe('computeContentHash', () => {
  it('is deterministic for the same title+description', async () => {
    const a = await computeContentHash(makeEvent())
    const b = await computeContentHash(makeEvent({ id: 'different-id' }))
    expect(a).toBe(b)
  })

  it('is case- and whitespace-insensitive', async () => {
    const a = await computeContentHash(makeEvent({ title: 'Storm approaches coast' }))
    const b = await computeContentHash(makeEvent({ title: '  STORM   approaches   coast  ' }))
    expect(a).toBe(b)
  })

  it('differs when the content actually differs', async () => {
    const a = await computeContentHash(makeEvent())
    const b = await computeContentHash(makeEvent({ title: 'A completely different headline' }))
    expect(a).not.toBe(b)
  })
})

describe('checkForDuplicate', () => {
  it('reports new for content never seen before', async () => {
    const index = new InMemoryDuplicateIndex()
    const outcome = await checkForDuplicate(makeEvent(), index)
    expect(outcome).toEqual({ kind: 'new' })
  })

  it('reports unchanged when the same id is re-fetched with no real changes', async () => {
    const index = new InMemoryDuplicateIndex()
    const event = makeEvent()
    await rememberEvent(index, event)

    const outcome = await checkForDuplicate(event, index)
    expect(outcome).toEqual({ kind: 'unchanged', existingId: event.id })
  })

  it('reports updated with a change log when the same id has new content', async () => {
    const index = new InMemoryDuplicateIndex()
    const original = makeEvent({ status: 'developing', importance: 'medium' })
    await rememberEvent(index, original)

    const updated = makeEvent({ status: 'resolved', importance: 'critical' })
    const outcome = await checkForDuplicate(updated, index)

    expect(outcome.kind).toBe('updated')
    if (outcome.kind === 'updated') {
      expect(outcome.changes.length).toBeGreaterThanOrEqual(2)
      expect(outcome.changes.some((c) => c.label.includes('Status changed'))).toBe(true)
      expect(outcome.changes.some((c) => c.label.includes('Importance changed'))).toBe(true)
    }
  })

  it('reports updated when only the category changes — needed for the weather->natural_disasters self-healing correction', async () => {
    const index = new InMemoryDuplicateIndex()
    const original = makeEvent({ category: 'science' })
    await rememberEvent(index, original)

    const corrected = makeEvent({ category: 'natural_disasters' })
    const outcome = await checkForDuplicate(corrected, index)

    expect(outcome.kind).toBe('updated')
    if (outcome.kind === 'updated') {
      expect(outcome.changes.some((c) => c.label.includes('Category changed'))).toBe(true)
    }
  })

  it('reports duplicate when a different id produces the same content hash', async () => {
    const index = new InMemoryDuplicateIndex()
    const first = makeEvent({ id: 'nasa-news:ev-1' })
    await rememberEvent(index, first)

    const sameStoryDifferentSource = makeEvent({ id: 'who-news:ev-99' })
    const outcome = await checkForDuplicate(sameStoryDifferentSource, index)
    expect(outcome).toEqual({ kind: 'duplicate', existingId: 'nasa-news:ev-1' })
  })
})

describe('checkForDuplicate — near-duplicate matching (independent sources, different wording)', () => {
  it('catches two different sources independently reporting the same real event with different wording', async () => {
    const index = new InMemoryDuplicateIndex()
    const reuters = makeEvent({
      id: 'reuters:cape-town-floods',
      source: 'Reuters',
      title: 'Cape Town floods leave three dead as heavy rains batter Western Cape',
      description:
        'Torrential rain triggered flash floods in Cape Town on Thursday, killing at least three people and displacing dozens of families across the Western Cape.',
      category: 'natural_disasters',
      country: 'South Africa',
      publishedAt: '2026-01-01T08:00:00.000Z',
    })
    await rememberEvent(index, reuters)

    const ap = makeEvent({
      id: 'ap-news:western-cape-storm',
      source: 'Associated Press',
      title: 'Three killed in Cape Town flooding amid Western Cape storm',
      description:
        'At least three people have died after severe flooding hit Cape Town this week, with the Western Cape declaring a local state of disaster.',
      category: 'natural_disasters',
      country: 'South Africa',
      publishedAt: '2026-01-01T14:00:00.000Z',
    })
    const outcome = await checkForDuplicate(ap, index)

    expect(outcome).toEqual({ kind: 'duplicate', existingId: 'reuters:cape-town-floods' })
  })

  it('does NOT merge two genuinely different events from the SAME source that share a boilerplate template', async () => {
    // Real risk found while building this: institutional press releases
    // (e.g. the Federal Reserve's own real feed) reuse an almost-identical
    // template per release, differing only in the affected party's name —
    // two distinct real approvals would otherwise look like near-duplicates
    // on title/description text alone. Same-source is excluded from
    // near-duplicate matching specifically because of this.
    const index = new InMemoryDuplicateIndex()
    const first = makeEvent({
      id: 'us-federal-reserve:orders1',
      source: 'US Federal Reserve',
      title: 'Federal Reserve Board announces approval of the application by FS Bancorp, Inc.',
      description: 'Federal Reserve Board announces approval of the application by FS Bancorp, Inc.',
      category: 'markets',
      country: 'United States',
      publishedAt: '2026-01-01T10:00:00.000Z',
    })
    await rememberEvent(index, first)

    const second = makeEvent({
      id: 'us-federal-reserve:orders2',
      source: 'US Federal Reserve',
      title: 'Federal Reserve Board announces approval of the application by Coastal Bend Bancshares, Inc.',
      description: 'Federal Reserve Board announces approval of the application by Coastal Bend Bancshares, Inc.',
      category: 'markets',
      country: 'United States',
      publishedAt: '2026-01-01T10:05:00.000Z',
    })
    const outcome = await checkForDuplicate(second, index)

    expect(outcome).toEqual({ kind: 'new' })
  })

  it('does NOT merge two different events that merely share a category, country, and generic words', async () => {
    const index = new InMemoryDuplicateIndex()
    const first = makeEvent({
      id: 'sanews:cabinet-1',
      source: 'SAnews',
      title: 'Cabinet approves new education policy framework',
      description: 'The Cabinet has approved a new framework to guide education policy over the next five years.',
      category: 'government',
      country: 'South Africa',
      publishedAt: '2026-01-01T09:00:00.000Z',
    })
    await rememberEvent(index, first)

    const second = makeEvent({
      id: 'south-africa-gov:cabinet-2',
      source: 'South African Government (Cabinet & Speeches)',
      title: 'Cabinet approves new water infrastructure investment plan',
      description: 'The Cabinet has approved a new investment plan to upgrade water infrastructure nationwide.',
      category: 'government',
      country: 'South Africa',
      publishedAt: '2026-01-01T09:30:00.000Z',
    })
    const outcome = await checkForDuplicate(second, index)

    expect(outcome).toEqual({ kind: 'new' })
  })

  it('does NOT merge similar reports of unrelated events outside the time window', async () => {
    const index = new InMemoryDuplicateIndex()
    const reuters = makeEvent({
      id: 'reuters:cape-town-floods-old',
      source: 'Reuters',
      title: 'Cape Town floods leave three dead as heavy rains batter Western Cape',
      description: 'Torrential rain triggered flash floods in Cape Town, killing at least three people across the Western Cape.',
      category: 'natural_disasters',
      country: 'South Africa',
      publishedAt: '2026-01-01T08:00:00.000Z',
    })
    await rememberEvent(index, reuters)

    const apMonthsLater = makeEvent({
      id: 'ap-news:western-cape-storm-later',
      source: 'Associated Press',
      title: 'Three killed in Cape Town flooding amid Western Cape storm',
      description: 'At least three people have died after severe flooding hit Cape Town, with the Western Cape declaring a local state of disaster.',
      category: 'natural_disasters',
      country: 'South Africa',
      publishedAt: '2026-03-15T14:00:00.000Z',
    })
    const outcome = await checkForDuplicate(apMonthsLater, index)

    expect(outcome).toEqual({ kind: 'new' })
  })

  it('does NOT merge near-identical wording across different countries — the country gate is enforced independently of text similarity', async () => {
    const index = new InMemoryDuplicateIndex()
    const first = makeEvent({
      id: 'source-a:ev-1',
      source: 'Source A',
      title: 'Officials confirm major development in ongoing negotiations',
      description: 'Officials have confirmed a major development in the ongoing negotiations, with more details expected soon.',
      category: 'government',
      country: 'South Africa',
      publishedAt: '2026-01-01T08:00:00.000Z',
    })
    await rememberEvent(index, first)

    // Near-identical but not byte-identical (so this reaches the near-
    // duplicate check rather than short-circuiting on the earlier exact-hash
    // check, which doesn't look at country at all).
    const differentCountry = makeEvent({
      id: 'source-b:ev-1',
      source: 'Source B',
      title: 'Officials confirm major development in ongoing talks',
      description: 'Officials have confirmed a major development in the ongoing talks, with further details expected shortly.',
      category: 'government',
      country: 'Zimbabwe',
      publishedAt: '2026-01-01T08:30:00.000Z',
    })
    const outcome = await checkForDuplicate(differentCountry, index)

    expect(outcome).toEqual({ kind: 'new' })
  })
})
