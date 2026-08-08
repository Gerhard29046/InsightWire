# ADR 0007: Supabase Repository (Phase 7)

**Status:** Accepted (implemented, unit-tested, and verified live end-to-end
against the real InsightWire Supabase project)
**Date:** 2026-08-07

## Context

Phases 1-6.6 built a complete collect → queue → normalize → dedupe → merge →
AI-enrich → persist pipeline against `InMemoryRepository`, verified
end-to-end against 5 live connectors. `docs/architecture/06-supabase.md`
already laid out what connecting a real Supabase project would take,
including the specific schema gap it predicted: "a migration adding the
Phase 6.6 fields the schema doesn't have yet." This phase does that, plus a
gap that document didn't predict, and implements `SupabaseRepository`.

The user's own phase instructions required verifying the schema against the
`Repository` contract *before* writing code, and explaining any needed
changes before creating migrations — both done here, in that order.

## Step 1: schema verification — what was found

Comparing the actual migrations (`supabase/migrations/2026080718000{0..7}`)
against `Repository` (`worker/src/pipeline/repository.ts`) and
`NormalizedEvent` (`packages/shared/src/normalizedEvent.ts`):

1. **`sources` was only seeded with 2 of the 5 registered connectors**
   (`nasa-news`, `who-news`) — `un-news`, `gdacs-alerts`, `nws-alerts` were
   missing. `docs/architecture/04-database.md`'s own table claimed "seeded:
   the 5 real connectors," which the actual SQL didn't match. Any
   raw/normalized event from those 3 connectors would have violated the
   `source_id` foreign key.
2. **`normalized_events` was missing `source_trust_score` and
   `priority_score`** — both predicted by `06-supabase.md`/`04-database.md`
   as Phase 6.6 fields the schema predates.
3. **`normalized_events` was also missing `tags`** — not predicted by either
   doc. Every connector's `normalize()` populates `NormalizedEvent.tags`,
   and `mergeEngine.ts` merges it, but unlike its sibling `keywords` (which
   has a column), `tags` had nowhere to persist. Silent data loss on every
   restart-triggered re-read, not just a missing "nice to have" field.
4. **`confirmingSources` (the Merge Engine's evidence list) had no
   destination at all** — no column, no table.
5. **No idempotency guarantee on `event_updates`/`ai_summaries`** — Phase
   7's own "duplicate processing must not corrupt the database" requirement.
   Both were plain `insert`-shaped tables with no natural uniqueness
   constraint; a Cloudflare Queues redelivery (retried on any thrown error,
   including a network blip after a partial success) would have inserted a
   byte-identical second timeline entry or summary row.

None of these were fixed by rewriting existing migrations — Migration
`20260807180008_intelligence_engine_fields.sql` is purely additive
(inserts, `alter table add column`, one new table, two new unique
constraints, one new function), consistent with "do not silently change the
schema."

## Decisions

### Repository interface: implemented exactly as it exists today, not as the phase brief described it

The phase brief asked for a repository supporting "append merge history,"
"read entities," and "update connector metrics" — none of which exist on
the actual `Repository` interface (`upsertRawEvent`, `upsertNormalizedEvent`,
`recordEventUpdate`/`getEventUpdates`, `recordAiSummary`, `recordEmbedding`,
`getNormalizedEvent` — 7 methods). Those three capabilities map to
`EntityGraphStore` (`pipeline/entityGraph.ts`) and `MetricsStore`
(`manager/metrics.ts`), both separate interfaces this phase's own rules
(**"Do not modify the Connector Manager," "do not change the processing
pipeline," "no breaking interface changes"**) put out of scope. Resolved in
favor of the explicit rule over the brief's capability list: `Repository`
is implemented exactly as it stands, and `EntityGraphStore`/`MetricsStore`/
`DuplicateIndex` stay in-memory — the same "each has the same
'resets-on-restart' limitation... its own decision, not automatic" framing
`06-supabase.md` already used.

"Merge history" is still real, just not a `Repository` method: it's what
`event_confirming_sources` (new table, below) persists, written through
`upsertNormalizedEvent`'s existing signature.

### `@supabase/supabase-js`, not a raw Postgres driver

Considered `postgres.js` (raw TCP, needs Workers' `connect()`/`nodejs_compat`)
and `pg` (needs Node's `net`, not Workers-compatible at all).
`@supabase/supabase-js` talks PostgREST over plain `fetch` — zero Workers
compatibility flags, officially supported for Cloudflare Workers/edge
runtimes, and matches this schema's own stated write path ("writes only
happen via the Worker's `service_role` key, which bypasses RLS... and never
reaches the frontend" — `0007_rls_policies.sql`'s header comment).
`SupabaseRepository` constructs the client with
`{ auth: { persistSession: false, autoRefreshToken: false } }` — there's no
`localStorage` in a Worker, and a service-role key doesn't refresh.

### Transactions: one Postgres function for the one genuinely multi-table write

`Repository.upsertNormalizedEvent` is the only method that needs to write
two tables (`normalized_events` + the new `event_confirming_sources`) from
one call, and they must land together — a mid-write failure that stored the
event but dropped its confirming-sources update would silently corrupt the
next merge's confidence calculation. PostgREST doesn't expose multi-statement
client transactions, so this is a `plpgsql` function
(`upsert_normalized_event_with_sources`, migration 0008) taking the full row
as a **composite-typed parameter** (`public.normalized_events`) rather than
~24 scalar parameters — PostgREST/supabase-js coerce a plain JS object into
it automatically, and the function's insert list tracks the table's actual
columns instead of a parameter list that can silently drift from them.

Every other `Repository` method is a single Postgres statement against a
single table — already atomic by Postgres's own guarantee, no function
needed.

**Known limit, stated plainly**: `Repository` has no transaction-handle
concept, so atomicity only exists *within* one method call, never *across*
two (e.g. `upsertRawEvent` then `upsertNormalizedEvent`, called separately
by `processMessage`). Giving `Repository` a cross-call transaction handle
would be an interface change — explicitly out of scope this phase.

### Idempotency: upserts on real constraints, not a dedup layer of its own

Every write is an upsert keyed to a constraint from migration 0008 or the
original schema:

| Method | Conflict target | Effect on replay |
|---|---|---|
| `upsertRawEvent` | `raw_events(source_id, external_id)` | overwrites with identical data |
| `upsertNormalizedEvent` | `normalized_events(id)` via the RPC | overwrites with identical data; confirming-sources rows upsert on `(event, connector)` |
| `recordEventUpdate` | `event_updates(normalized_event_id, at, label)`, `ignoreDuplicates` | no-op |
| `recordAiSummary` | `ai_summaries(normalized_event_id, model, summary)`, `ignoreDuplicates` | no-op |
| `recordEmbedding` | none — deliberately | inserts a duplicate row |

`recordEmbedding` is the one deliberate exception: `0006_ai.sql` already
documents `embeddings` as append-only by design ("a re-embed inserts a new
row rather than overwriting"), so there's no uniqueness invariant to
protect — a retried message inserting one duplicate vector is wasteful, not
corrupting.

**This does not make the whole pipeline idempotent** — `DuplicateIndex`
(`pipeline/dedupe.ts`) is still in-memory and resets on Worker restart, so a
cold start can re-process an event Supabase already has as "new." That's an
existing, already-documented limitation of a different store
(`06-supabase.md`: "the dedup index almost certainly needs to [move to
Postgres] for correctness at scale... its own decision, not automatic"),
unchanged by this phase. What this phase guarantees is narrower and
accurate: *whatever `processMessage` decides to write, writing it twice
doesn't corrupt the database.*

### Retries: Cloudflare Queues' existing mechanism, not a second retry loop inside the repository

`worker.ts`'s `queue()` handler already retries a whole message
(`message.retry()`) on any thrown error, up to `wrangler.toml`'s
`max_retries: 3`, then dead-letters it. `SupabaseRepository` doesn't wrap
its own calls in an additional retry loop — doing so would multiply
side effects for no benefit now that every write is idempotent-safe to
repeat, and would silently mask the very failures the dead-letter queue
exists to surface. Every failure path — a returned PostgREST error
(constraint violation, RPC failure) or a thrown network exception (outage,
DNS, timeout) — is converted to a `RepositoryError` (never swallowed) and
left to propagate, which is exactly what makes `queue()`'s existing retry
correct.

### `raw_event_id` is always left null — a named, deliberate gap

`normalized_events.raw_event_id` is a nullable FK meant to trace a
normalized event back to its raw source row. `Repository.upsertRawEvent`
returns `Promise<void>` (no id), and `NormalizedEvent` carries no reference
to its own raw event either — linking them would need either an interface
change (`upsertRawEvent` returning an id) or parsing it back out of
`processMessage`'s call order, both out of scope ("the Repository interface
must remain unchanged"). `SupabaseRepository` always writes `null` here
rather than fabricating a link — an honest gap, not a silent one.

### `source_id`/connectorId: parsed from the one place it's guaranteed to be, not guessed

`normalized_events.source_id` is `not null`, but `NormalizedEvent` has no
`connectorId` field — only `id`, which every connector's `normalize()`
assembles as `` `${connectorId}:${externalId}` `` (ADR 0005). `toNormalizedEventRow`
splits on the first `:` to recover it. This isn't a new convention invented
for this phase — it's the documented contract of `NormalizedEvent.id`
itself; `parseConnectorId` throws a `RepositoryError` (never silently
defaults) if an id doesn't match the shape, which should never happen given
that contract.

## Step 6: error handling

`RepositoryError` wraps every failure — PostgREST errors (with the
Postgres error code preserved on `.cause`) and thrown network exceptions
alike — through one `execute()` helper so no method has its own ad hoc
try/catch. Nothing is caught and discarded anywhere in
`supabaseRepository.ts`.

## Verification performed

- `npm run test --workspace=worker`: **159 tests pass** (145 pre-existing +
  14 new), the new tests covering every `Repository` method against a
  mocked `@supabase/supabase-js` client — correct table/conflict-target per
  method, the RPC call's argument shape (including `coordinates` splitting
  into `lat`/`lng`, `confirmingSources` defaulting to `[]`, `tags`/
  `source_trust_score`/`priority_score` round-tripping), `parseConnectorId`
  rejecting a malformed id before ever calling the RPC, both a returned
  PostgREST error and a thrown network exception surfacing as
  `RepositoryError`, and `getNormalizedEvent` reconstructing
  `confirmingSources` from the join table (present vs. correctly
  `undefined` when empty, matching `InMemoryRepository`'s existing
  contract) — same mocked-client approach as `ClaudeAiProvider`'s tests
  (never a real network call).
- `npx tsc --noEmit` (worker workspace): clean.
- Root frontend/shared `npm run build`: confirmed unaffected (no frontend
  files touched).
- `worker.ts`: `selectRepository(env)` follows `selectAiProvider`'s exact
  "not configured -> honest default" pattern; `InMemoryRepository` stays the
  default so local `wrangler dev` without Supabase credentials behaves
  exactly as every prior phase.

## Live verification (Steps 7-8) — performed, real numbers

**Migrations applied for real.** `supabase link`/`db push` hit a genuine CLI
bug unrelated to this project's schema —
`LegacyLinkApiKeysNetworkError: failed to get api keys: SchemaError(...
at [2]["inserted_at"])` — reproduced twice, against the latest published CLI
(2.112.0), while `supabase login`/`projects list` worked fine (the account's
3 real projects listed correctly, including `InsightWire`/`loelneyenvxcuyoluksd`,
`ACTIVE_HEALTHY`, Postgres 17.6). Worked around by applying all 9 migrations
(concatenated, in order) directly through the project's SQL Editor instead —
same SQL, no CLI involved. First real proof these migrations apply cleanly
against actual Postgres, not just `libpg-query` syntax validation.

**Local end-to-end run**, same technique as every prior phase
(`wrangler dev --test-scheduled`, real `workerd` + Miniflare-simulated
Queue), against real credentials in `worker/.dev.vars` (created by the user;
never read or printed by the assistant — verified present via `test -f`
only) and the 5 real live connectors:

```json
{"connectorsCollected": 5, "itemsQueued": 413,
 "results": [
   {"connectorId": "nasa-news", "status": "collected", "itemsCollected": 10},
   {"connectorId": "who-news", "status": "collected", "itemsCollected": 25},
   {"connectorId": "un-news", "status": "collected", "itemsCollected": 30},
   {"connectorId": "gdacs-alerts", "status": "failed", "itemsCollected": 0},
   {"connectorId": "nws-alerts", "status": "collected", "itemsCollected": 348}
 ]}
```

GDACS failed collection with a real transient upstream error
(`internal error`, GDACS's own server) — health-gated and skipped for this
tick, exactly the documented behavior from ADR 0006's own prior live run,
not a regression. All 413 queued messages processed: **411 stored, 1
merged, 1 invalid** (an NWS keepalive entry, correctly rejected — same
mechanism verified in ADR 0005). Processing took ~3.3 minutes end-to-end
(20:53:02 → 20:56:19), almost entirely NWS's 348 sequential per-item
Supabase round-trips — each `processMessage` call now does several real
network writes instead of an in-memory map insert, the expected cost of
"durable" per docs/architecture/06-supabase.md's own framing; no batching
was added this phase (out of scope — the pipeline's sequential-send/
sequential-process shape is unchanged, per "do not change the processing
pipeline").

**Row counts written to the real database** (queried directly via
PostgREST, service-role key never printed):

| Table | Rows | Expected? |
|---|---|---|
| `raw_events` | 413 | ✓ — matches `itemsQueued` exactly |
| `normalized_events` | 411 | ✓ — matches stored count; the 1 merge collapsed onto an existing id, no extra row |
| `event_updates` | 1 | ✓ — exactly the merge's timeline entry |
| `event_confirming_sources` | 411 | ✓ — one row per stored event; the merge's same-connector re-confirmation correctly upserted the existing row rather than adding a second (see below) |
| `ai_summaries` | 0 | ✓ — `NullAiProvider` (no `ANTHROPIC_API_KEY`), honestly no fabricated summaries |
| `embeddings` | 0 | ✓ — same reason, `NullAiProvider.embed()` returns nothing |
| `connector_runs` | 0 | **Expected, not a bug** — this phase only replaces `Repository`; nothing in scope writes `connector_runs` (that's `MetricsStore`/`ConnectorManager`, explicitly untouched — see "Repository interface" decision above) |
| `event_relationships` | 0 | **Expected** — Phase 10 future work, no code populates this table yet (distinct from `event_confirming_sources`, which does) |
| `sources` | 5 | ✓ — all 5 registered connectors now present (migration 0008's seed fix) |

**Duplicate check**: queried `raw_events(source_id, external_id)` and
`normalized_events(id)` directly — **0 duplicate keys in either table**
across all 413/411 rows.

**The one real merge, inspected directly in Postgres**: NWS reissued alert
`...0267483fa6e5224226e4a112b4e6852bf2e39df0.002.1` under the same id.
`event_updates` shows exactly one row: `"Re-confirmed by NWS Active
Alerts"`. `event_confirming_sources` shows exactly **one** row for that
event (`connector_id: nws-alerts`), not two — proving the "same-connector
re-confirmation doesn't double-count" behavior (ADR 0006) holds against the
real schema, not just the in-memory one. `priority_score: 57`,
`source_trust_score: 0.9`, `tags: ["Air Quality Alert"]` all persisted and
read back correctly.

**Idempotency, tested directly against the real database**
(`worker/scripts/verifyIdempotency.ts` — a manual verification script, not
part of the automated suite; deletes its own probe rows before and after
running): called `upsertRawEvent`, `upsertNormalizedEvent`,
`recordEventUpdate`, and `recordAiSummary` **twice each** with identical
payloads through the real `SupabaseRepository` against the live project.
Result: exactly **1 row** in each of `raw_events`, `normalized_events`,
`event_updates`, `ai_summaries`, `event_confirming_sources` — the second
write of each was a true no-op, not a second row. `getNormalizedEvent`
round-tripped `tags`, `priorityScore`, `sourceTrustScore`, and
`confirmingSources` byte-for-byte correctly.

**A real gap found during this step, fixed immediately**: `worker/` was
entirely untracked in git with no `.gitignore` entry covering `.dev.vars` —
`git add worker` or `-A` would have staged the real service-role key. Added
`.dev.vars`/`.dev.vars.*` to `.gitignore` and verified with `git
check-ignore` before any further commits happened. No secret was ever
staged, committed, or printed in any tool output this session.

## Risks & assumptions carried forward

- **Cross-call atomicity doesn't exist** — see "Transactions" above.
  `upsertRawEvent` succeeding and `upsertNormalizedEvent` failing (or vice
  versa) leaves the two tables inconsistent; `processMessage`'s per-message
  retry (idempotent on replay) is what recovers, not a repository-level
  transaction.
- **The in-memory `DuplicateIndex` is still the weakest link** for real
  idempotency at the pipeline level, unchanged by this phase — a Worker
  restart between polls would still let an already-stored event look "new"
  again to the in-memory index; `SupabaseRepository`'s upserts mean that
  even then, the resulting write is a safe overwrite, not a duplicate row.
- **Per-item sequential Supabase round-trips make the consumer meaningfully
  slower than the in-memory version** — confirmed live (~3.3 minutes for
  413 items, dominated by NWS's 348). Acceptable at today's per-tick
  volumes; `sendBatch()`/bulk upserts would be the fix if volume grows,
  same "worth revisiting if it becomes a real bottleneck" framing ADR 0005
  already used for sequential queue sends.
- **`connector_runs`/`event_relationships`/entity-graph persistence are
  still not written by anything** — confirmed empty in the live run, by
  design (out of this phase's scope), not a bug to chase.
- GDACS's transient collection failures (observed again this run, as in
  ADR 0006) mean any given verification run's exact connector mix is not
  fully reproducible — the pipeline's health-gating handled it correctly
  both times, which is the actual property being verified.

## Consequences

- `SupabaseRepository` is a complete, unit-tested, **and live-verified**
  drop-in `Repository` implementation — `processMessage` imports nothing
  from it directly and needs no changes; `worker.ts` is the only call site
  aware it exists.
- The schema now actually matches what `NormalizedEvent` needs to
  round-trip losslessly (`tags`, `sourceTrustScore`, `priorityScore`,
  `confirmingSources` all persist), closing gaps two prior architecture
  docs had only partially predicted — proven not just by migration syntax
  validation but by real inserts, a real merge, and a real idempotency
  probe against the live project.
- InsightWire's data is durable for the first time in this project's
  history: 411 real events from 4 live sources now exist in
  `loelneyenvxcuyoluksd` and survive a Worker restart. Nothing was deployed
  to Cloudflare and the frontend was not touched, per this phase's explicit
  scope.
