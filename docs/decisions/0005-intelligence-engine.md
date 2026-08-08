# ADR 0005: Intelligence Engine (Phase 6.5)

**Status:** Accepted (implemented; nothing deployed to a live Cloudflare account, no live database)
**Date:** 2026-08-07

## Context

Phases 1-3 (connector framework, Connector Manager, Cron scheduling) and
Phase 6 (Supabase schema, unexecuted) were done. The user paused Phase 7
(REST API) to prioritize the ingestion pipeline itself: "without live data
the API and frontend have nothing meaningful to serve." This phase builds
the complete collect → queue → normalize → dedupe → AI-enrich → persist
pipeline.

Three real blockers were surfaced and resolved with the user before writing
code:

1. **Correction to ADR 0003**: it said Cloudflare Queues need a Workers
   Paid plan. Rechecked this session — outdated. Queues now work on the
   Free plan (10k ops/day), and `wrangler dev` fully simulates Queues
   locally via Miniflare with zero account/billing involvement.
   **Decision: build and verify the full queue pipeline locally only**,
   same pattern as every phase so far.
2. **AI enrichment has no real provider configured.** **Decision: build the
   full architecture behind an `AiProvider` interface, defaulting to a
   `NullAiProvider`** that honestly leaves events unenriched — "no mock
   events" applies to AI-generated fields exactly as much as raw ones.
3. **New connectors need real, verified sources.** Added 3, each confirmed
   live against the real endpoint before being coded, not assumed from
   memory: **UN News** (RSS, `news.un.org`), **GDACS** (RSS, `gdacs.org`,
   feed's own `<copyright>` tag says "public domain"), and **NOAA/NWS
   active alerts** (`api.weather.gov/alerts/active.atom` — Atom+CAP, not
   RSS, the first connector in a materially different feed format).

## Decisions

### Source Registry: extended, not rebuilt

`SourceConnector` (`worker/src/connectors/types.ts`) gained
`supportedCountries: string[]`, `supportedCategories: CategoryId[]`, and
`rateLimit?: { requestsPerMinute: number }`. `refreshIntervalMs` already
covered "schedule"; `healthCheck()` already covered "health status." No
connector was ever hardcoded into the manager — `ConnectorRegistry` was
already pure register/lookup since Phase 1 — so this was a metadata
addition, not an architecture change.

### RssConnector generalized to Atom+CAP, not replaced

Adding NWS (Atom, not RSS 2.0) only required extending
`parseRssItems`/`extractExternalId`/the new `extractLinkHref` to recognize
`<feed><entry>` shape alongside `<rss><channel><item>`, and widening
`RssItem`'s `link`/`guid`/`id` field types to cover both. No new base
class, no duplicated fetch/health-check/retry logic — the concrete proof of
"adding a connector requires minimal code" the master prompt asked for.
`NwsConnector` also demonstrates using a source's own **authoritative**
classification directly: CAP's `severity`/`certainty` fields map straight
into `importance`/`confidence` (verified live: a real Severe Thunderstorm
Warning correctly produced `importance: 'high'`), and `verificationStatus:
'verified'` — a deliberate exception to every other connector's
`'unverified'` default, because NWS alerts are official government-issued
CAP messages, not user-submitted or scraped content. NWS's periodic
"Monitoring message only" keepalive entries (confirmed present in the live
feed) are rejected by having `normalize()` throw for `cap:status: 'Test'` —
reusing the existing per-item error-handling path rather than inventing a
new event state, since `validate()` only sees the already-normalized event
and has lost the raw CAP status by then.

### Connector Manager: one additive method, nothing broken

`ConnectorManager.collectDue()` (`worker/src/manager/ConnectorManager.ts`)
is the async pipeline's collector entrypoint — it reuses the exact same
health-gate + retry logic as `runConnector()` (factored into a shared
private `fetchWithHealthGate`) but calls a `publish()` callback per raw
event instead of normalizing synchronously. `runConnector`/`runAll`/`runDue`
are unchanged and still do the full synchronous pipeline (useful for local/
admin "run now and see the result" use) — refactoring `runConnector` to use
the shared helper was verified not to change its behavior (all 12
pre-existing tests still pass unmodified). Collection activity is recorded
into the *same* metrics store `runDue`'s due-filtering reads from (with
`itemsNormalized/Valid/Invalid` at 0 — honest, since normalization hasn't
happened yet at collection time), so `collectDue` and `runDue` never
disagree about what's "due."

### Duplicate detection: two layers, using what Phase 6 already models

`worker/src/pipeline/dedupe.ts`: the deterministic `NormalizedEvent.id`
(`${connectorId}:${externalId}`) catches the same source re-sending the
same item; a SHA-256 content hash (normalized `title+description`) catches
the same real-world event arriving under a *different* id (two sources
covering one story, or a feed re-issuing an item with a new guid). Four
outcomes, not two: `new`, `unchanged` (re-fetched, nothing changed — no
write at all), `updated` (same id, real change — produces `event_updates`-
shaped records, Phase 6's actual table), `duplicate` (different id, same
content — rejected, counted). Storage (`DuplicateIndex`) is in-memory for
this phase, same accepted limitation as every other in-memory store here.

### AI enrichment: one consolidated call, never fabricated

`worker/src/pipeline/ai/`: `AiProvider.enrich()` returns one structured
result (summary, keywords, people, organizations, suggested category,
importance, confidence, language) — matching how this would actually be
prompted against a real LLM (one tool-call response, not eight round
trips) — plus a separate `embed()` (embedding models are typically a
distinct call). `NullAiProvider` is the default: returns empty/undefined
rather than fabricated content, and is what every event gets today, in
this environment. `ClaudeAiProvider` is a real implementation (direct
`fetch()` to the Anthropic Messages API with a tool-call schema, not the
Node SDK, which doesn't reliably target the Workers runtime) — built and
unit-tested against a mocked `fetch` only; never called against the real
API here since no `ANTHROPIC_API_KEY` exists. `selectAiProvider(env)`
picks between them based on that env var's presence — the same
"not configured → honest default" pattern as the frontend's
`ApiNotConfiguredError`. `enrichEvent()` never touches raw fields
(title/description/source/...); only AI-derived fields are conditionally
updated, and a summary always also produces a separate, append-only
`AiSummaryRecord` — implementing "store AI output separately, never
overwrite raw source data" concretely, matching Phase 6's `ai_summaries`
table design exactly.

### A real finding from live verification: NWS requires a User-Agent

The first end-to-end `wrangler dev` run (below) surfaced a genuine bug, not
a simulation artifact: NWS's live API returned HTTP 403 during collection.
NOAA/NWS's API documentation requires a descriptive `User-Agent` header
identifying the calling application, and rejects unidentified requests —
`RssConnector`'s `fetch()`/`healthCheck()` weren't sending one.
Fixed by adding a shared `REQUEST_HEADERS` constant (`User-Agent:
InsightWire/1.0 (https://github.com/Gerhard29046/InsightWire)`) applied to
every request in the base class — harmless for sources that don't require
it, correct API citizenship regardless, and it fixed NWS immediately
(re-verified: 258/258 collected on the next run). This is exactly the kind
of thing fixture-based unit tests can't catch (fixtures don't make real
HTTP requests) — only the live-feed and `wrangler dev` verification steps
surface it.

### Queue processing: collect → queue → normalize → dedupe → enrich → persist

`worker/wrangler.toml` gained `[[queues.producers]]`/`[[queues.consumers]]`
plus a `dead_letter_queue` (the "graceful failure" requirement —
unprocessable messages land somewhere inspectable after `max_retries`,
not silently dropped or retried forever). `worker/src/worker.ts`:
`scheduled()` calls `collectDue()` and enqueues each raw event; `queue()`
calls `processMessage()` per message, `ack()`ing on success and `retry()`ing
on any thrown error. Connectors have no path to writing anywhere — only
`processMessage`'s final step touches the `Repository`, and only after
normalize → validate → dedupe have all passed.

One better-than-planned addition: `Queue.metrics()` (a producer-side
capability in `@cloudflare/workers-types`) genuinely exposes
`backlogCount` — `scheduled()` logs it as `queueDepth` after enqueueing.
The original plan assumed this was unavailable to a Worker at all; it
isn't, for the producer side, so it's used rather than approximated.

### Persistence and pipeline metrics: pluggable, in-memory for now

`worker/src/pipeline/repository.ts`'s `Repository` interface is named
after Phase 6's actual tables (`upsertNormalizedEvent`,
`recordEventUpdate`, `recordAiSummary`, `recordEmbedding`) — the seam a
real Supabase-backed implementation slots into without changing
`processMessage`. `worker/src/pipeline/metrics.ts`'s `PipelineMetrics` is
deliberately separate from `ConnectorManager`'s collection-side metrics,
matching the real collect-vs-process architecture split: events collected,
items processed, duplicates rejected, updates recorded, average processing/
AI latency, worker failures, retry counts (Cloudflare's own
`message.attempts`, not invented).

`worker/src/worker.ts` creates the registry, manager, duplicate index,
repository, and pipeline metrics as **module-level singletons** — this is
what makes in-memory dedup/metrics mean anything at all *between* one
`scheduled()` tick and the `queue()` batches it produces within the same
Worker isolate. Not durable across a cold start or redeploy, the same
accepted limitation as every other in-memory store in this codebase, for
the same reason (no live Supabase connection).

## Verification performed

- `npm run test --workspace=worker`: 97 tests pass (39 pre-existing + 58
  new), covering every new connector (parse/normalize/validate, plus
  NWS's keepalive-rejection and GDACS's coordinate-extraction edge cases),
  `collectDue`, dedupe's four outcomes, both AI providers (Null and
  Claude's request/response handling via mocked `fetch`), the repository,
  pipeline metrics, `processMessage`'s full branch coverage, and
  `worker.ts`'s `scheduled()`/`queue()` handlers (faked `Queue`/
  `MessageBatch`/`Message`).
- All 5 connectors verified against their **live** feeds during
  implementation (not just fixtures): NASA 10/10, WHO 25/25, UN 30/30,
  GDACS 313/313, NWS 239/240 valid (1 keepalive correctly skipped) — a real
  Severe Thunderstorm Warning correctly produced `importance: 'high'` via
  CAP severity mapping.
- **Manual, real, local, end-to-end**: `wrangler dev --test-scheduled`
  running the actual `workerd` runtime with a locally-simulated Queue
  (Miniflare). First run: 4/5 connectors collected (NASA 10, WHO 25, UN 30,
  GDACS 313); NWS failed collection with HTTP 403 (see the User-Agent
  finding above) — `scheduled()` completed in 2916ms, `queueDepth: 5`
  reported via the real `Queue.metrics()` call. After the fix, a second run
  collected from all 5 connectors (NASA 10, WHO 25, UN 30, GDACS 313, NWS
  258 — 636 items total), enqueued in batches of 10 (`max_batch_size`) with
  a clean final partial batch (6/6) after the `max_batch_timeout` gap, and
  the consumer processed every item through normalize → dedupe → null-enrich
  → in-memory-persist with zero error-level log lines. Duplicate detection
  fired for real, live data: several GDACS wildfire (WF-prefixed) alerts
  for the same region shared byte-identical title/description and were
  correctly caught by the content-hash check and rejected as duplicates —
  not a contrived test case, the actual live feed produces this.
- Root frontend/shared typecheck and build confirmed unaffected (no
  frontend files touched).

## Risks & assumptions carried forward

- **Sequential per-item queue sends inside `collectOne`**: `for (const item
  of raw) { await publish(item) }` sends one at a time, not batched. Fine
  at today's per-tick volumes (NASA/WHO/UN ~10-30 items, GDACS ~300, NWS
  ~200-240); worth switching to `sendBatch()` if per-tick item counts grow
  enough that sequential local sends become a real latency concern.
- **In-memory dedup/repository/metrics reset on Worker restart** — the
  same accepted limitation as Phase 2's `InMemoryMetricsStore`, now
  extended to three more stores, for the same reason: no live Supabase
  connection yet.
- **`ClaudeAiProvider` has never made a real API call** in this
  environment — its request-building and response-parsing are unit-tested
  against a mocked `fetch`, not proven against Anthropic's actual API
  surface. The first real call is a genuine unknown until a key is
  configured and it's exercised for real.
- **Content-hash dedup is title+description only** — two genuinely
  different events that happen to share both (rare, but not impossible for
  very short/generic headlines) would be incorrectly merged. No known
  instance of this in the live data collected during verification, not
  mathematically ruled out either.
- **`Queue.metrics()`'s `backlogCount` in local Miniflare simulation** may
  not perfectly reflect what the real hosted Queues service reports —
  worth re-confirming once/if this is ever deployed for real.

## Consequences

- The pipeline now produces real, schema-valid `NormalizedEvent`s
  end-to-end from 5 live sources, deduplicated, and passed through an
  (currently inert) AI enrichment stage — the gate the user set before
  Phase 7 can start.
- Nothing is deployed and no data is durable yet — a database connection
  (Phase 6 applied for real) is what turns `InMemoryRepository` into
  something worth querying from a future API.
