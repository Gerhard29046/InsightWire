import { describe, expect, it, vi } from 'vitest'
import { ConnectorRegistry } from './connectors/registry'
import type { RawEvent } from './connectors/types'
import { FakeConnector, makeRawEvent } from './manager/__fixtures__/FakeConnector'

const { createDefaultRegistry } = vi.hoisted(() => ({ createDefaultRegistry: vi.fn() }))
vi.mock('./index', async () => {
  const { ConnectorManager } = await import('./manager/ConnectorManager')
  return { createDefaultRegistry, ConnectorManager }
})

const fakeRegistry = new ConnectorRegistry()
fakeRegistry.register(new FakeConnector({ id: 'a', items: [] }))
createDefaultRegistry.mockReturnValue(fakeRegistry)

const worker = (await import('./worker')).default

function fakeController(overrides: Partial<ScheduledController> = {}): ScheduledController {
  return {
    scheduledTime: Date.parse('2026-01-01T00:00:00.000Z'),
    cron: '*/5 * * * *',
    noRetry: () => {},
    ...overrides,
  }
}

function fakeExecutionContext(): ExecutionContext {
  return { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext
}

function fakeQueue(): { send: ReturnType<typeof vi.fn>; metrics: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    metrics: vi.fn().mockResolvedValue({ backlogCount: 0, backlogBytes: 0 }),
  }
}

function fakeMessage(body: RawEvent) {
  return {
    id: 'msg-1',
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  }
}

describe('worker', () => {
  it('fetch() returns a 200 health response', async () => {
    const res = await worker.fetch?.(new Request('https://example.com'), { RAW_EVENTS_QUEUE: fakeQueue() as never }, fakeExecutionContext())
    expect(res?.status).toBe(200)
  })

  it('scheduled() collects from due connectors and enqueues each raw event', async () => {
    const queue = fakeQueue()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await worker.scheduled?.(fakeController(), { RAW_EVENTS_QUEUE: queue as never }, fakeExecutionContext())

    const summaryLine = logSpy.mock.calls
      .map((call) => call[0])
      .find((line): line is string => typeof line === 'string' && line.includes('scheduled.tick.complete'))
    expect(summaryLine).toBeDefined()
    const summary = JSON.parse(summaryLine as string)
    expect(summary.connectorsCollected).toBe(1)

    logSpy.mockRestore()
  })

  it('queue() processes each message and acks on success', async () => {
    const message = fakeMessage(makeRawEvent('a', 'worker-test-ev-1'))
    const batch = { messages: [message], queue: 'insightwire-raw-events', metadata: {} as never, ackAll: vi.fn(), retryAll: vi.fn() }

    await worker.queue?.(batch as never, { RAW_EVENTS_QUEUE: fakeQueue() as never }, fakeExecutionContext())

    expect(message.ack).toHaveBeenCalledTimes(1)
    expect(message.retry).not.toHaveBeenCalled()
  })

  it('queue() retries a message whose connector is unknown rather than throwing out of the handler', async () => {
    const message = fakeMessage(makeRawEvent('nonexistent-connector', 'worker-test-ev-2'))
    const batch = { messages: [message], queue: 'insightwire-raw-events', metadata: {} as never, ackAll: vi.fn(), retryAll: vi.fn() }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await worker.queue?.(batch as never, { RAW_EVENTS_QUEUE: fakeQueue() as never }, fakeExecutionContext())

    expect(message.retry).toHaveBeenCalledTimes(1)
    expect(message.ack).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
