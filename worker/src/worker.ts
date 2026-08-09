import { ConnectorManager, createDefaultRegistry } from './index'
import { consoleLogger } from './manager/logger'
import { recordConnectorRun } from './manager/supabaseConnectorRuns'
import { fetchDisabledSourceIds } from './api/adminApi'
import type { RawEvent } from './connectors/types'
import { handleApiRequest } from './api/router'
import { selectAiProvider } from './pipeline/ai/enrichmentPipeline'
import { InMemoryDuplicateIndex } from './pipeline/dedupe'
import { runEntityExtractionBatch } from './pipeline/entityExtraction'
import { InMemoryPipelineMetrics } from './pipeline/metrics'
import { processMessage } from './pipeline/processMessage'
import { selectEntityGraphStore, selectRepository, type Env } from './env'
import { createDefaultTrustRegistry } from './pipeline/trust'

export type { Env } from './env'

/**
 * Module-level singletons: persist across invocations within the same
 * Worker isolate, which is what makes in-memory dedup/metrics useful at all
 * between one `scheduled()` tick and the `queue()` batches it produces.
 * `repository`/`entityGraphStore` are *not* among these — env (and therefore
 * which backend implementation backs a run) is only available inside a
 * handler, not at module scope — both are selected fresh per `queue()` batch
 * instead, same as `aiProvider` already was. Creating either is cheap either
 * way: both just wrap `fetch` (PostgREST), there's no connection-pool
 * lifecycle to manage across invocations the way a raw TCP client would need.
 * Dedup/metrics stay in-memory — nothing in this codebase has needed them
 * durable yet.
 */
const registry = createDefaultRegistry()
const manager = new ConnectorManager(registry)
const duplicateIndex = new InMemoryDuplicateIndex()
const pipelineMetrics = new InMemoryPipelineMetrics()
const trustRegistry = createDefaultTrustRegistry()

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
    // Real enforcement for Administration's "Enable/Disable" source
    // control — without this, disabling a source in the admin UI would only
    // ever flip a database flag nobody reads (see adminApi.ts's own doc
    // comment on ConnectorManager.collectDue's `disabledIds` parameter).
    // Never fatal: if Supabase isn't configured or this query fails, fall
    // back to "nothing disabled" rather than blocking real ingestion.
    let disabledSourceIds = new Set<string>()
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        disabledSourceIds = await fetchDisabledSourceIds({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY })
      } catch (err) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'admin.disabledSources.fetchFailed',
            timestamp: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }

    const results = await manager.collectDue(
      (raw) => env.RAW_EVENTS_QUEUE.send(raw).then(() => undefined),
      new Date(controller.scheduledTime),
      disabledSourceIds,
    )
    const itemsQueued = results.reduce((sum, r) => sum + r.itemsCollected, 0)
    pipelineMetrics.recordCollected(itemsQueued)

    // Real, persisted "which feeds are stale/failing" history — see
    // supabaseConnectorRuns.ts's own doc comment for why this lives here
    // (a genuine `await`, not a fire-and-forget) rather than inside
    // ConnectorManager's synchronous MetricsStore. Isolated per-row so one
    // failed insert (or Supabase not being configured at all) never masks
    // or aborts the real collection results already gathered above.
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const runsConfig = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
      await Promise.all(
        results.map((result) =>
          recordConnectorRun(runsConfig, result).catch((err) => {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'connectorRuns.persist.failed',
                connectorId: result.connectorId,
                timestamp: new Date().toISOString(),
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }),
        ),
      )
    }

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

    /**
     * Phase 12: the rate-limited entity-extraction batch — a handful of real
     * events per tick (see DEFAULT_EXTRACTION_BATCH_SIZE), completely
     * separate from connector collection above. `runEntityExtractionBatch`
     * is a no-op when GEMINI_API_KEY or Supabase isn't configured, and
     * isolates every failure internally — nothing it does can turn a
     * successful collection tick into a failed one.
     */
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const entityGraphStore = selectEntityGraphStore(env)
      const extractionSummary = await runEntityExtractionBatch(
        { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        env.GEMINI_API_KEY,
        entityGraphStore,
      )
      if (extractionSummary.eventsProcessed > 0) {
        console.log(JSON.stringify({ level: 'info', event: 'entityExtraction.batch.complete', ...extractionSummary }))
      }
    }
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
    // Env (and therefore which Repository/EntityGraphStore backs this run) is
    // only available inside a handler, not at module scope — both selected
    // fresh per batch, same as aiProvider above. Creating either is cheap: they
    // just wrap `fetch`, there's no persistent connection to pool across calls.
    const repository = selectRepository(env)
    const entityGraphStore = selectEntityGraphStore(env)

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
