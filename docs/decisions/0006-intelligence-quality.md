# ADR 0006: Intelligence & Quality (Phase 6.6)

**Status:** Accepted (implemented; still no live database, nothing deployed)
**Date:** 2026-08-07

## Context

Phase 6.5 shipped a working ingestion pipeline verified end-to-end against
5 live connectors, with an in-memory repository. The user reviewed it and
explicitly asked to **defer connecting a real Supabase project** until the
architecture is more mature, and instead strengthen the pipeline's
intelligence layer: source trust, event priority, an entity relationship
graph, merging duplicate reports instead of discarding them, a formal
timeline engine, and richer metrics. No new infrastructure decisions were
needed — local-only, in-memory, undeployed, exactly like every prior phase.

Mid-implementation, the user also asked for documentation to be organized
into a `docs/architecture/` reference set (`01-overview.md` through
`10-deployment.md`), alongside the existing chronological ADR log in
`docs/decisions/`. Both now exist: ADRs record *why* a decision was made at
a point in time; `docs/architecture/` describes *how the system works
right now*, updated as of this phase.

## Decisions

### Source Trust Engine: a registry, not another connector field

`worker/src/pipeline/trust.ts`. Trust describes *where information comes
from*, not any single event — kept separate from `SourceConnector`
(extended once already in 6.5) since it's meant to be tunable without a
redeploy. Seven categories (`official`/`government`/`company`/`ngo`/
`university`/`rss`/`community`) each get a default trust score
(0.95 → 0.40, roughly by publisher accountability); an explicit per-connector
override always wins. Seeded for today's 5 connectors: NASA/NWS →
`government` (US federal agencies), WHO/UN/GDACS → `official`
(international/multilateral bodies). `NormalizedEvent` gained a
denormalized `sourceTrustScore?: number` snapshot — stored separately from
`importance`, per the explicit requirement, so a highly-trusted source's
routine announcement doesn't outscore a major story from a newer one.

### Event Priority Engine: a real weighted formula, not AI

`worker/src/pipeline/priority.ts`. Nine inputs, weights summing to 1.0,
scaled to 0-100: source trust (0.20), confirming-source count (0.15),
freshness — linear decay over 24h (0.15), AI confidence (0.10), geographic/
political/economic impact (0.10 each), disaster severity — weather-only
(0.05), category weighting (0.05). This is deterministic, rules-based
engineering, not a fabricated AI score. Geographic/political/economic
impact fall back to a documented per-category default table
(`CATEGORY_IMPACT_DEFAULTS`) since `NullAiProvider` supplies none today —
`AiEnrichmentResult` can carry real per-event scores once a provider
actually does, at which point they override the defaults automatically, no
pipeline change needed. Verified live: a real Severe Thunderstorm Warning
scored around 62-66; routine science/business items scored in the low-to-mid
40s — the formula produces genuine, sensible spread across live data, not
a flat number.

### Entity Graph: built in full, populated in part — stated honestly

`worker/src/pipeline/entityGraph.ts`. All 8 requested entity types exist
(`person`/`organization`/`country`/`city`/`company`/`government_body`/
`event`/`topic`) with dedup-by-normalized-name (`findOrCreateEntity`) and
typed relationships, deliberately separate from `Repository` ("store
relationships independently from events"). **Only 3 of 8 types have a real
data source today**: `country`/`city` (from `event.country`/`.city`) and
`topic` (from `event.tags`) — wired into `processMessage` and proven
against live data during verification. `person`/`organization`/`company`/
`government_body` stay unpopulated until real AI entity extraction exists
(`NullAiProvider` returns empty arrays) — the graph is ready for them, it
simply has nothing to connect yet. Also narrower than Phase 6's Postgres
schema, which has no generic entity/relationship table spanning all 8
types — flagged as future schema work, not assumed to already exist.

### Event Merge Engine: replaces "reject" with "merge"

`worker/src/pipeline/mergeEngine.ts`. This is the most consequential change
to Phase 6.5's behavior: a content-hash match under a different id used to
be rejected and discarded. Now it's merged — `NormalizedEvent` gained
`confirmingSources?: {connectorId, sourceUrl?, reportedAt}[]`, seeded by
every connector's `normalize()` as a one-entry array. On a match:
- Sources: unioned, deduped by `connectorId`.
- Evidence: `tags`/`keywords` unioned.
- Confidence: `min(1, max(existing, incoming) + 0.15 × newSourceCount)` —
  genuinely new confirmation raises confidence; a same-connector
  re-confirmation (verified live — see below) correctly does not.
- Importance: the higher of the two, never lowered.
- The merged event is upserted **under the existing id**; the incoming
  event's id is never separately stored.

`processMessage` now fetches the full existing event from the `Repository`
on a duplicate signal (dedupe.ts's detection logic is unchanged — only what
happens *after* detection changed), calls `mergeEvents`, and — if the
existing event can't be found (a defensive fallback for store/index
disagreement, never observed in practice) — falls back to storing the
incoming event standalone with a warning logged, rather than crashing.

**Real verification finding**: the live end-to-end run produced exactly one
merge — NWS reissuing a near-identical alert under a new URN. Both the
existing and incoming events carried `confirmingSources: [{connectorId:
'nws-alerts'}]`, so the dedup-by-connector union correctly collapsed to 1
source (not 2) and the timeline entry correctly read "Re-confirmed by NWS
Active Alerts" rather than claiming a second independent source — the
formula's same-connector-doesn't-double-count behavior working exactly as
designed, on real data, not just in a unit test.

### Timeline Engine: formalizing what already existed

`worker/src/pipeline/timeline.ts`. A thin, named module
(`recordTimelineEntry`/`recordTimelineEntries`/`getTimeline`) — both the
Phase 6.5 update-diff path and the new merge path now go through it,
guaranteeing "append, never overwrite" from one place instead of two
independent call sites. Required adding `Repository.getEventUpdates()`
(read side didn't exist before — only writing did).

### Metrics: richer, still honest about what a Worker can't see

`worker/src/pipeline/metrics.ts` gained: `duplicatesDetected` and `merged`
as **separate** counters (not one) — "duplicate rate" and "merge rate" are
different questions; today they move together (every detected duplicate
merges successfully), but tracking them separately means a future merge
failure would show up as a real signal, not get silently absorbed.
`sourceTrustDistribution` and `priorityDistribution` (bucketed 0-25/25-50/
50-75/75-100) are new histograms on the same store. `queueThroughputPerMinute`
is a live rate since the store was created. `averageConnectorLatencyMs` is
**not** stored state — it's `computeAverageConnectorLatency()`, a plain
function combining `ConnectorManager`'s per-connector snapshots into one
fleet number, since `PipelineMetrics` has no visibility into
`ConnectorManager` and shouldn't need any just to report an average.

## Verification performed

- `npm run test --workspace=worker`: **145 tests pass** (97 pre-existing +
  48 new), covering every new module (trust, priority, entity graph, merge
  engine, timeline) plus `processMessage`'s rewritten merge branch and the
  `makeRawEvent` test fixture (fixed to produce a complete `NormalizedEvent`
  shape — a Phase 6.5 fixture gap the new entity-graph code exposed:
  iterating `event.tags` on a bare `{id}` stub threw).
- Root frontend/shared typecheck and build confirmed unaffected.
- **Manual, real, local, end-to-end** (`wrangler dev --test-scheduled`,
  same technique as every prior phase): 5 connectors collected, GDACS hit a
  real transient upstream failure this run (`internal error`, its own
  server) — correctly marked unhealthy and skipped for one tick rather than
  crashing the Worker, exactly what health-gating from Phase 2 is for.
  718 items processed: 716 stored, 1 merged (the NWS re-confirmation case
  above), 1 invalid (an NWS keepalive entry, rejected as designed since
  Phase 6.5). Priority scores spread genuinely across live data (32-66
  observed). Zero errors, zero dead-letter activity.

## Risks & assumptions carried forward

- **Priority scores don't decay between polls unless a real update or merge
  occurs** — an "unchanged" re-fetch is a deliberate no-op (no write at
  all, for efficiency), so an event's freshness component can go stale
  between real content changes. Acceptable for now; revisit if the
  frontend's eventual priority-sort needs live decay.
- **Content-hash merging is title+description only** — same limitation
  flagged in Phase 6.5, now with real consequences (a coincidental match
  merges two unrelated events). No observed instance; not mathematically
  ruled out.
- **Entity graph's 3-of-8 real types** — `person`/`organization`/`company`/
  `government_body` require real AI entity extraction that doesn't exist
  yet.
- **Geographic/political/economic impact defaults are a category-level
  heuristic**, not per-event AI scoring — a real provider overrides them
  automatically once configured, but nothing forces that to happen soon.
- Still no live Supabase connection, no deploy — unchanged from every prior
  phase, per the user's explicit instruction this phase.

## Consequences

- Every persisted event now carries a real, comparable `priorityScore` and
  `sourceTrustScore` — what the frontend needs to eventually sort by
  priority instead of publication time (Phase 7+ work, not done here).
- Duplicate reports from independent sources now *strengthen* an event's
  confidence instead of being thrown away — the pipeline's core value
  proposition (cross-source confirmation) is now real, not just modeled.
- `docs/architecture/` now exists as living reference documentation
  alongside the chronological ADR log — see `01-overview.md` for the map.
