import { describe, expect, it } from 'vitest'
import { ConnectorRegistry } from './registry'
import type { ConnectorHealthStatus, RawEvent, SourceConnector } from './types'
import type { NormalizedEvent } from '@insightwire/shared'

function makeStubConnector(id: string, enabled: boolean): SourceConnector {
  return {
    id,
    name: id,
    description: `stub connector ${id}`,
    type: 'rss',
    enabled,
    version: '1.0.0',
    refreshIntervalMs: 60 * 60 * 1000,
    supportedCountries: [],
    supportedCategories: [],
    async healthCheck(): Promise<ConnectorHealthStatus> {
      return { healthy: true, checkedAt: new Date(0).toISOString() }
    },
    async fetch(): Promise<RawEvent[]> {
      return []
    },
    normalize(): NormalizedEvent {
      throw new Error('not used in this test')
    },
    validate() {
      return { valid: true }
    },
  }
}

describe('ConnectorRegistry', () => {
  it('registers and retrieves a connector by id', () => {
    const registry = new ConnectorRegistry()
    const connector = makeStubConnector('stub-a', true)
    registry.register(connector)
    expect(registry.get('stub-a')).toBe(connector)
  })

  it('returns undefined for an unknown id', () => {
    const registry = new ConnectorRegistry()
    expect(registry.get('missing')).toBeUndefined()
  })

  it('rejects a duplicate id', () => {
    const registry = new ConnectorRegistry()
    registry.register(makeStubConnector('dup', true))
    expect(() => registry.register(makeStubConnector('dup', true))).toThrow(/already registered/)
  })

  it('lists all registered connectors', () => {
    const registry = new ConnectorRegistry()
    registry.register(makeStubConnector('a', true))
    registry.register(makeStubConnector('b', false))
    expect(registry.list().map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('lists only enabled connectors', () => {
    const registry = new ConnectorRegistry()
    registry.register(makeStubConnector('enabled-one', true))
    registry.register(makeStubConnector('disabled-one', false))
    expect(registry.listEnabled().map((c) => c.id)).toEqual(['enabled-one'])
  })
})
