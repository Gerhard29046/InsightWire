# 05 · Cloudflare

**Status: built and verified locally only.** No `wrangler login`, no
`wrangler deploy`, no live Cloudflare resources of any kind exist for this
project. Every verification claim in this repo's ADRs was produced by
`wrangler dev`'s local `workerd` runtime and its local Queue simulation
(Miniflare) — real code, real execution, zero account interaction.

## Configuration

[`worker/wrangler.toml`](../../worker/wrangler.toml):

```toml
[triggers]
crons = ["*/5 * * * *"]

[[queues.producers]]
queue = "insightwire-raw-events"
binding = "RAW_EVENTS_QUEUE"

[[queues.consumers]]
queue = "insightwire-raw-events"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "insightwire-raw-events-dlq"
```

## The Worker (`worker/src/worker.ts`)

Three handlers:

- **`fetch()`** — a trivial 200 health response. Workers require this
  handler to exist even when the real job is Cron-triggered.
- **`scheduled()`** — the collector. Calls
  `ConnectorManager.collectDue()`, which health-gates and retries each due
  connector's fetch, then enqueues every raw event onto
  `RAW_EVENTS_QUEUE`. Logs `queueDepth` from the queue's real
  `.metrics().backlogCount` (a genuine producer-side capability, not an
  approximation).
- **`queue()`** — the consumer. Calls `processMessage()` per message
  (see [03-ai-pipeline.md](03-ai-pipeline.md)), `ack()`s on success,
  `retry()`s on any thrown error. Exhausted retries land in the configured
  dead-letter queue.

Module-level singletons (registry, manager, duplicate index, repository,
pipeline metrics, trust registry, entity graph store) persist across
invocations *within the same Worker isolate* — not durable across a cold
start or redeploy, since nothing behind them is a real database yet.

## Why Queues instead of doing everything in `scheduled()`

Connectors never write anywhere themselves — only `processMessage`'s final
step touches the `Repository`, and only after normalize → validate →
dedupe have all passed. The queue is what makes that separation real
rather than aspirational: a connector physically cannot reach persistence
without going through the async hop.

## A corrected assumption, on the record

An earlier ADR (0003) stated Cloudflare Queues require a Workers Paid
plan. That was checked again and found outdated — Queues now work on the
Free plan (10k operations/day), and `wrangler dev` fully simulates them
locally regardless of plan. Worth remembering before assuming a Cloudflare
feature needs a paid tier without checking current docs.
