import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from './repository'
import { getTimeline, recordTimelineEntries, recordTimelineEntry } from './timeline'

describe('timeline engine', () => {
  it('starts empty for an event with no recorded updates', async () => {
    const repo = new InMemoryRepository()
    expect(await getTimeline(repo, 'nasa-news:ev-1')).toEqual([])
  })

  it('appends entries rather than overwriting', async () => {
    const repo = new InMemoryRepository()
    await recordTimelineEntry(repo, 'nasa-news:ev-1', { at: '2026-01-01T00:00:00.000Z', label: 'First update' })
    await recordTimelineEntry(repo, 'nasa-news:ev-1', { at: '2026-01-02T00:00:00.000Z', label: 'Second update' })

    const timeline = await getTimeline(repo, 'nasa-news:ev-1')
    expect(timeline).toHaveLength(2)
    expect(timeline.map((e) => e.label)).toEqual(['First update', 'Second update'])
  })

  it('returns entries in chronological order regardless of write order', async () => {
    const repo = new InMemoryRepository()
    await recordTimelineEntry(repo, 'nasa-news:ev-1', { at: '2026-01-03T00:00:00.000Z', label: 'Third' })
    await recordTimelineEntry(repo, 'nasa-news:ev-1', { at: '2026-01-01T00:00:00.000Z', label: 'First' })
    await recordTimelineEntry(repo, 'nasa-news:ev-1', { at: '2026-01-02T00:00:00.000Z', label: 'Second' })

    const timeline = await getTimeline(repo, 'nasa-news:ev-1')
    expect(timeline.map((e) => e.label)).toEqual(['First', 'Second', 'Third'])
  })

  it('scopes entries to their own event', async () => {
    const repo = new InMemoryRepository()
    await recordTimelineEntry(repo, 'a', { at: '2026-01-01T00:00:00.000Z', label: 'For A' })
    await recordTimelineEntry(repo, 'b', { at: '2026-01-01T00:00:00.000Z', label: 'For B' })

    expect((await getTimeline(repo, 'a')).map((e) => e.label)).toEqual(['For A'])
    expect((await getTimeline(repo, 'b')).map((e) => e.label)).toEqual(['For B'])
  })

  it('recordTimelineEntries appends a batch in order', async () => {
    const repo = new InMemoryRepository()
    await recordTimelineEntries(repo, 'a', [
      { at: '2026-01-01T00:00:00.000Z', label: 'One' },
      { at: '2026-01-01T00:00:01.000Z', label: 'Two' },
    ])
    expect((await getTimeline(repo, 'a')).map((e) => e.label)).toEqual(['One', 'Two'])
  })
})
