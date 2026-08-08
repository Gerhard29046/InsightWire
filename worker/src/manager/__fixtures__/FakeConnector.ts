import type { CategoryId, NormalizedEvent } from '@insightwire/shared'
import type { ConnectorHealthStatus, ConnectorType, RawEvent, SourceConnector, ValidationResult } from '../../connectors/types'

export interface FakeConnectorConfig {
  id: string
  enabled?: boolean
  healthy?: boolean
  refreshIntervalMs?: number
  /** Throws for the first N calls to fetch(), then succeeds. */
  failFetchTimes?: number
  items?: RawEvent[]
  /** externalIds that should throw during normalize(). */
  throwOnNormalizeFor?: string[]
  /** externalIds that should fail validate(). */
  invalidFor?: string[]
}

/** A SourceConnector test double — no network, fully scriptable failure modes. */
export class FakeConnector implements SourceConnector {
  readonly id: string
  readonly name: string
  readonly description = 'fake connector for tests'
  readonly type: ConnectorType = 'api'
  readonly enabled: boolean
  readonly version = '1.0.0'
  readonly refreshIntervalMs: number
  readonly supportedCountries: string[] = []
  readonly supportedCategories: CategoryId[] = []

  fetchCallCount = 0

  private readonly config: FakeConnectorConfig

  constructor(config: FakeConnectorConfig) {
    this.config = config
    this.id = config.id
    this.name = config.id
    this.enabled = config.enabled ?? true
    this.refreshIntervalMs = config.refreshIntervalMs ?? 1000
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    return { healthy: this.config.healthy ?? true, checkedAt: new Date().toISOString() }
  }

  async fetch(): Promise<RawEvent[]> {
    this.fetchCallCount += 1
    if (this.config.failFetchTimes && this.fetchCallCount <= this.config.failFetchTimes) {
      throw new Error(`simulated fetch failure (attempt ${this.fetchCallCount})`)
    }
    return this.config.items ?? []
  }

  normalize(raw: RawEvent): NormalizedEvent {
    if (this.config.throwOnNormalizeFor?.includes(raw.externalId)) {
      throw new Error(`simulated normalize failure for ${raw.externalId}`)
    }
    return raw.payload as NormalizedEvent
  }

  validate(event: NormalizedEvent): ValidationResult {
    if (this.config.invalidFor?.includes(event.id)) {
      return { valid: false, errors: [`simulated validation failure for ${event.id}`] }
    }
    return { valid: true }
  }
}

export function makeRawEvent(connectorId: string, externalId: string): RawEvent {
  const fetchedAt = new Date().toISOString()
  const event: NormalizedEvent = {
    id: externalId,
    title: `Fake event ${externalId}`,
    description: 'A fake event for tests.',
    country: 'Global',
    category: 'science',
    source: connectorId,
    publishedAt: fetchedAt,
    updatedAt: fetchedAt,
    importance: 'medium',
    confidence: 0.4,
    verificationStatus: 'unverified',
    language: 'en',
    people: [],
    organizations: [],
    keywords: [],
    tags: [],
    status: 'developing',
    confirmingSources: [{ connectorId, reportedAt: fetchedAt }],
  }
  return {
    connectorId,
    externalId,
    fetchedAt,
    payload: event,
  }
}
