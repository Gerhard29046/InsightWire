import { ConnectorManager, createDefaultRegistry } from './index'
import { consoleLogger } from './manager/logger'
import type { RawEvent } from './connectors/types'
import { handleApiRequest } from './api/router'
import { selectAiProvider } from './pipeline/ai/enrichmentPipeline'
import { InMemoryDuplicateIndex } from './pipeline/dedupe'
import { InMemoryEntityGraphStore } from './pipeline/entityGraph'
import { InMemoryPipelineMetrics } from './pipeline/metrics'
import { processMessage } from './pipeline/processMessage'
import { selectRepository, type Env } from './env'
import { createDefaultTrustRegistry } from './pipeline/trust'

export type { Env } from './env'

/**
 * Module-level singletons: persist across invocations within the same
 * Worker isolate, which is what makes in-memory dedup/metrics useful at all
 * between one `scheduled()` tick and the `queue()` batches it produces.
 * `repository` is *not* one of these — env (and therefore which Repository
 * backs a run) is only available inside a handler, not at module scope — it's
 * selected fresh per `queue()` batch instead, same as `aiProvider` already
 * was. Creating a `SupabaseRepository` is cheap either way: it just wraps
 * `fetch` (PostgREST), there's no connection-pool lifecycle to manage across
 * invocations the way a raw TCP client would need.
 * Dedup/metrics/entity-graph stay in-memory this phase — this phase only
 * replaces the `Repository` implementation, per its own scope (see ADR 0007).
 */
const registry = createDefaultRegistry()
const manager = new ConnectorManager(registry)
const duplicateIndex = new InMemoryDuplicateIndex()
const pipelineMetrics = new InMemoryPipelineMetrics()
const trustRegistry = createDefaultTrustRegistry()
const entityGraphStore = new InMemoryEntityGraphStore()

export default {
  /**
   * `handleApiRequest` (api/router.ts) owns /events and /events/:id — the
   * Intelligence API (Phase 8). Anything it doesn't recognize (including
   * the bare root) falls through to the plain-text liveness response every
   * prior phase already relied on.
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const apiResponse = await handleApiRequest(request, env)
    if (apiResponse) return apiResponse
    return new Response('InsightWire worker is running', { status: 200 })
  },

  /**
   * The collector: fetches from every due connector (health-gated, retried
   * — see ConnectorManager.collectDue) and enqueues each raw event instead
   * of normalizing it here. Normalization, dedup, AI enrichment, and
   * persistence all happen downstream in `queue()`, never in this handler
   * — connectors have no path to writing anywhere themselves.
   */
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const results = await manager.collectDue(
      (raw) => env.RAW_EVENTS_QUEUE.send(raw).then(() => undefined),
      new Date(controller.scheduledTime),
    )
    const itemsQueued = results.reduce((sum, r) => sum + r.itemsCollected, 0)
    pipelineMetrics.recordCollected(itemsQueued)

    let queueDepth: number | undefined
    try {
      queueDepth = (await env.RAW_EVENTS_QUEUE.metrics()).backlogCount
    } catch {
      // Queue.metrics() is a producer-side capability; if it's unavailable
      // in a given environment, omit rather than fabricate a depth.
    }

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'scheduled.tick.complete',
        cron: controller.cron,
        scheduledTime: new Date(controller.scheduledTime).toISOString(),
        connectorsCollected: results.length,
        itemsQueued,
        queueDepth,
        results: results.map((r) => ({ connectorId: r.connectorId, status: r.status, itemsCollected: r.itemsCollected })),
      }),
    )
  },

  /**
   * The consumer: normalize -> validate -> dedupe -> AI enrich -> persist,
   * per message (see pipeline/processMessage.ts). A message that throws is
   * retried up to wrangler.toml's max_retries, then lands in the configured
   * dead_letter_queue for manual inspection — "graceful failure," not
   * silently dropped or retried forever.
   */
  async queue(batch: MessageBatch<RawEvent>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const aiProvider = selectAiProvider(env)
    // Env (and therefore which Repository backs this run) is only available
    // inside a handler, not at module scope — selected fresh per batch, same
    // as aiProvider above. Creating a SupabaseRepository is cheap: it just
    // wraps `fetch`, there's no persistent connection to pool across calls.
    const repository = selectRepository(env)

    for (const message of batch.messages) {
      try {
        const outcome = await processMessage(message.body, {
          registry,
          duplicateIndex,
          aiProvider,
          repository,
          metrics: pipelineMetrics,
          logger: consoleLogger,
          trustRegistry,
          entityGraphStore,
        })
        message.ack()
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'queue.message.processed',
            timestamp: new Date().toISOString(),
            connectorId: message.body.connectorId,
            attempts: message.attempts,
            outcome: outcome.outcome,
          }),
        )
      } catch (err) {
        pipelineMetrics.recordWorkerFailure()
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'queue.message.failed',
            timestamp: new Date().toISOString(),
            connectorId: message.body.connectorId,
            attempts: message.attempts,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env, RawEvent>
