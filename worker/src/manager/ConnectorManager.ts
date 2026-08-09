import type { ConnectorHealthStatus, RawEvent, SourceConnector } from '../connectors/types'
import type { ConnectorRegistry } from '../connectors/registry'
import { runWithConcurrency } from './concurrency'
import { consoleLogger } from './logger'
import { InMemoryMetricsStore } from './metrics'
import { withRetry } from './retry'
import { DEFAULT_RETRY_POLICY } from './types'
import type {
  CollectionResult,
  ConnectorMetricsSnapshot,
  ConnectorRunResult,
  Logger,
  MetricsStore,
  RetryPolicy,
  RunStatus,
} from './types'

export interface ConnectorManagerOptions {
  logger?: Logger
  metrics?: MetricsStore
  retryPolicy?: RetryPolicy
  /** Max connectors run in parallel — keeps this shaped for thousands of sources. */
  concurrency?: number
}

const MAX_SAMPLE_ERRORS = 5

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Internal signal distinguishing "skipped, unhealthy" from "fetch failed after retries" without threading a second return channel through every caller. */
class UnhealthyConnectorError extends Error {}

interface FinalizeParams {
  connectorId: string
  startedAt: Date
  status: RunStatus
  attempts: number
  itemsFetched: number
  itemsNormalized: number
  itemsValid: number
  itemsInvalid: number
  sampleErrors: string[]
}

function finalize(params: FinalizeParams): ConnectorRunResult {
  const finishedAt = new Date()
  return {
    connectorId: params.connectorId,
    status: params.status,
    startedAt: params.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - params.startedAt.getTime(),
    attempts: params.attempts,
    itemsFetched: params.itemsFetched,
    itemsNormalized: params.itemsNormalized,
    itemsValid: params.itemsValid,
    itemsInvalid: params.itemsInvalid,
    sampleErrors: params.sampleErrors.slice(0, MAX_SAMPLE_ERRORS),
  }
}

/**
 * Orchestrates connectors: health-gates, retries the network fetch,
 * isolates per-item normalize/validate failures, logs structured events, and
 * records metrics. Scheduling (Cloudflare Cron) and persistence (Supabase)
 * are later phases — this class runs entirely in-process so it's fully
 * testable without either.
 */
export class ConnectorManager {
  private readonly registry: ConnectorRegistry
  private readonly logger: Logger
  private readonly metrics: MetricsStore
  private readonly retryPolicy: RetryPolicy
  private readonly concurrency: number

  constructor(registry: ConnectorRegistry, options: ConnectorManagerOptions = {}) {
    this.registry = registry
    this.logger = options.logger ?? consoleLogger
    this.metrics = options.metrics ?? new InMemoryMetricsStore()
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY
    this.concurrency = options.concurrency ?? 5
  }

  /**
   * Health-gates then retries the network fetch — the one piece of work
   * every collection path (synchronous `runConnector` and the async
   * `collectDue`) needs identically. Throws `UnhealthyConnectorError` (0
   * attempts, by definition — the fetch was never attempted) or the
   * underlying fetch error after retries are exhausted (`attempts` ===
   * `retryPolicy.maxAttempts`); callers distinguish the two to build their
   * own result shape and log the right event name.
   */
  private async fetchWithHealthGate(
    connector: SourceConnector,
  ): Promise<{ raw: RawEvent[]; attempts: number }> {
    const health = await connector.healthCheck()
    if (!health.healthy) {
      throw new UnhealthyConnectorError(health.message ?? 'health check reported unhealthy')
    }

    let attempts = 0
    const raw = await withRetry(() => connector.fetch(), {
      policy: this.retryPolicy,
      onAttemptFailed: (attempt, err) => {
        attempts = attempt
        this.logger.log({
          level: 'warn',
          event: 'connector.fetch.retry',
          connectorId: connector.id,
          timestamp: new Date().toISOString(),
          attempt,
          error: errorMessage(err),
        })
      },
    })
    attempts += 1
    return { raw, attempts }
  }

  private getDueConnectorIds(now: Date): string[] {
    return this.registry
      .listEnabled()
      .filter((connector) => {
        const snapshot = this.metrics.getSnapshot(connector.id)
        if (!snapshot?.lastRunAt) return true
        return now.getTime() - new Date(snapshot.lastRunAt).getTime() >= connector.refreshIntervalMs
      })
      .map((c) => c.id)
  }

  async runConnector(id: string): Promise<ConnectorRunResult> {
    const connector = this.registry.get(id)
    if (!connector) {
      throw new Error(`Unknown connector "${id}"`)
    }

    const startedAt = new Date()
    this.logger.log({
      level: 'info',
      event: 'connector.run.start',
      connectorId: id,
      timestamp: startedAt.toISOString(),
    })

    let raw: RawEvent[]
    let attempts: number
    try {
      ;({ raw, attempts } = await this.fetchWithHealthGate(connector))
    } catch (err) {
      const unhealthy = err instanceof UnhealthyConnectorError
      const result = finalize({
        connectorId: id,
        startedAt,
        status: 'failed',
        attempts: unhealthy ? 0 : this.retryPolicy.maxAttempts,
        itemsFetched: 0,
        itemsNormalized: 0,
        itemsValid: 0,
        itemsInvalid: 0,
        sampleErrors: [errorMessage(err)],
      })
      this.logger.log({
        level: unhealthy ? 'warn' : 'error',
        event: unhealthy ? 'connector.run.unhealthy' : 'connector.run.failed',
        connectorId: id,
        timestamp: result.finishedAt,
        error: errorMessage(err),
      })
      this.metrics.record(result)
      return result
    }

    let itemsNormalized = 0
    let itemsValid = 0
    let itemsInvalid = 0
    const sampleErrors: string[] = []
    const pushError = (message: string) => {
      if (sampleErrors.length < MAX_SAMPLE_ERRORS) sampleErrors.push(message)
    }

    for (const item of raw) {
      try {
        const normalized = connector.normalize(item)
        itemsNormalized += 1
        const validation = connector.validate(normalized)
        if (validation.valid) {
          itemsValid += 1
        } else {
          itemsInvalid += 1
          for (const message of validation.errors ?? ['validation failed']) pushError(message)
        }
      } catch (err) {
        itemsInvalid += 1
        pushError(errorMessage(err))
        this.logger.log({
          level: 'warn',
          event: 'connector.item.error',
          connectorId: id,
          timestamp: new Date().toISOString(),
          error: errorMessage(err),
        })
      }
    }

    const status: RunStatus = itemsInvalid === 0 ? 'success' : itemsValid > 0 ? 'partial' : 'failed'
    const result = finalize({
      connectorId: id,
      startedAt,
      status,
      attempts,
      itemsFetched: raw.length,
      itemsNormalized,
      itemsValid,
      itemsInvalid,
      sampleErrors,
    })
    this.logger.log({
      level: status === 'failed' ? 'error' : status === 'partial' ? 'warn' : 'info',
      event: 'connector.run.complete',
      connectorId: id,
      timestamp: result.finishedAt,
      status,
      itemsFetched: raw.length,
      itemsValid,
      itemsInvalid,
    })
    this.metrics.record(result)
    return result
  }

  private async runIsolated(connectorIds: string[]): Promise<ConnectorRunResult[]> {
    const settled = await runWithConcurrency(connectorIds, this.concurrency, (id) => this.runConnector(id))
    return settled.map((outcome, index) =>
      outcome.status === 'fulfilled'
        ? outcome.value
        : finalize({
            connectorId: connectorIds[index],
            startedAt: new Date(),
            status: 'failed',
            attempts: 0,
            itemsFetched: 0,
            itemsNormalized: 0,
            itemsValid: 0,
            itemsInvalid: 0,
            sampleErrors: [errorMessage(outcome.reason)],
          }),
    )
  }

  /** Runs every enabled connector now, regardless of its refresh interval. */
  async runAll(): Promise<ConnectorRunResult[]> {
    return this.runIsolated(this.registry.listEnabled().map((c) => c.id))
  }

  /**
   * Runs only connectors whose `refreshIntervalMs` has elapsed since their
   * last recorded run (or that have never run). This is the policy Phase 3's
   * Cloudflare Cron Trigger will call on a fixed tick — the trigger doesn't
   * need to know per-source cadence, this method does.
   */
  async runDue(now: Date = new Date()): Promise<ConnectorRunResult[]> {
    return this.runIsolated(this.getDueConnectorIds(now))
  }

  private async collectOne(
    id: string,
    publish: (raw: RawEvent) => Promise<void>,
  ): Promise<CollectionResult> {
    const startedAt = new Date()
    const connector = this.registry.get(id)
    if (!connector) {
      throw new Error(`Unknown connector "${id}"`)
    }

    this.logger.log({
      level: 'info',
      event: 'connector.collect.start',
      connectorId: id,
      timestamp: startedAt.toISOString(),
    })

    try {
      const { raw, attempts } = await this.fetchWithHealthGate(connector)
      for (const item of raw) {
        await publish(item)
      }
      const finishedAt = new Date()
      const result: CollectionResult = {
        connectorId: id,
        status: 'collected',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        attempts,
        itemsCollected: raw.length,
      }
      this.logger.log({
        level: 'info',
        event: 'connector.collect.complete',
        connectorId: id,
        timestamp: result.finishedAt,
        itemsCollected: raw.length,
      })
      // Feeds the same due-tracking `runDue`/`collectDue` both read —
      // itemsNormalized/Valid/Invalid are 0 here because normalize()
      // doesn't run at collection time in the async pipeline (see
      // worker/src/pipeline/processMessage.ts, which runs downstream of the
      // queue); that's honest, not a bug — this run genuinely didn't
      // normalize anything itself.
      this.metrics.record(
        finalize({
          connectorId: id,
          startedAt,
          status: 'success',
          attempts,
          itemsFetched: raw.length,
          itemsNormalized: 0,
          itemsValid: 0,
          itemsInvalid: 0,
          sampleErrors: [],
        }),
      )
      return result
    } catch (err) {
      const unhealthy = err instanceof UnhealthyConnectorError
      const finishedAt = new Date()
      const result: CollectionResult = {
        connectorId: id,
        status: 'failed',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        attempts: unhealthy ? 0 : this.retryPolicy.maxAttempts,
        itemsCollected: 0,
        error: errorMessage(err),
      }
      this.logger.log({
        level: unhealthy ? 'warn' : 'error',
        event: unhealthy ? 'connector.collect.unhealthy' : 'connector.collect.failed',
        connectorId: id,
        timestamp: result.finishedAt,
        error: result.error,
      })
      this.metrics.record(
        finalize({
          connectorId: id,
          startedAt,
          status: 'failed',
          attempts: result.attempts,
          itemsFetched: 0,
          itemsNormalized: 0,
          itemsValid: 0,
          itemsInvalid: 0,
          sampleErrors: [result.error ?? 'unknown error'],
        }),
      )
      return result
    }
  }

  /**
   * The Cron-triggered collector's entrypoint (see worker/src/worker.ts's
   * `scheduled()`): fetches from every due connector — same due-filtering
   * and health-gate/retry logic as `runDue()` — but publishes each raw
   * event (e.g. onto a Cloudflare Queue) instead of normalizing it
   * synchronously. `runConnector`/`runAll`/`runDue` are unchanged and still
   * do the full synchronous pipeline, useful for local/admin "run now and
   * see the result immediately" use.
   *
   * `disabledIds` is what makes the Administration "Enable/Disable" source
   * control genuinely functional rather than a decorative database flag:
   * the connector registry's own `enabled` is a static TypeScript property
   * (`ConnectorRegistry.listEnabled()`), which an admin action has no way to
   * change at runtime. `worker.ts`'s `scheduled()` fetches the real
   * `sources.enabled` column from Supabase and passes disabled ids here —
   * this is the one place collection actually happens, so this is the one
   * place that needs to honor it.
   */
  async collectDue(
    publish: (raw: RawEvent) => Promise<void>,
    now: Date = new Date(),
    disabledIds: ReadonlySet<string> = new Set(),
  ): Promise<CollectionResult[]> {
    const dueIds = this.getDueConnectorIds(now).filter((id) => !disabledIds.has(id))
    const settled = await runWithConcurrency(dueIds, this.concurrency, (id) => this.collectOne(id, publish))
    return settled.map((outcome, index) =>
      outcome.status === 'fulfilled'
        ? outcome.value
        : {
            connectorId: dueIds[index],
            status: 'failed' as const,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 0,
            attempts: 0,
            itemsCollected: 0,
            error: errorMessage(outcome.reason),
          },
    )
  }

  async getHealthSnapshot(): Promise<(ConnectorHealthStatus & { connectorId: string })[]> {
    return Promise.all(
      this.registry.list().map(async (connector) => ({
        connectorId: connector.id,
        ...(await connector.healthCheck()),
      })),
    )
  }

  getMetrics(): ConnectorMetricsSnapshot[] {
    return this.metrics.getAllSnapshots()
  }
}
