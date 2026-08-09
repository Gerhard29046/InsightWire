# ADR 0014: Remove Weather Entirely, Introduce a Natural Disasters Category

**Status:** Accepted (implemented, unit-tested, live-verified)
**Date:** 2026-08-09

## Context

After seeing the live Dashboard dominated by "Weather & Disasters — 176
events," the user made a product decision: InsightWire is not a weather
platform. Routine weather (forecasts, thunderstorm/wind/rain statements,
ordinary NWS alerts) must be removed from every surface — Global Feed,
Dashboard, Significant/Breaking sections, regional sections, category
stats, search/filters, the Geographic Intelligence Map, and Entity
Intelligence's counts. But a genuinely major natural disaster (major
earthquake, tsunami, volcanic eruption, major cyclone, catastrophic
flooding, major wildfire) remains real journalism and must be kept —
reframed as `natural_disasters`, distinct from routine weather.

Explicit constraints: fix this at the pipeline/API boundary, not with
scattered `if category === 'weather'` checks in React; no new, complicated
scoring system (reuse GDACS's own real `alertlevel`); no replacing one
firehose with another; never destructively delete historical weather rows.

## Decisions

### Taxonomy: additive, not a destructive rename

`packages/shared/src/taxonomy.ts`'s `CATEGORY_IDS` drops `'weather'` and
adds `'natural_disasters'`. `normalized_events.category` is `text` with an
FK to a `categories` lookup table (not a Postgres enum), so this is safe:
the existing `weather` row in `categories` is left in place for historical
rows' FK integrity (`20260809000000_natural_disasters_category.sql` only
*adds* a `natural_disasters` row) — no historical data was deleted or
migrated.

### GDACS: gated by its own real severity, not a keyword heuristic

`gdacs.ts`'s `normalize()` now skips (throws, same pattern as NWS's
existing Test/keepalive handling) any item whose `gdacs:alertlevel` is
`'Green'` or absent — GDACS's own real classification of "no or minimal
impact expected." Orange/Red items are kept with `category:
'natural_disasters'`. No new scoring system: this reuses the exact
`alertlevel` field already mapped to `importance` in a prior phase.

### NWS: disabled at the connector level, not deleted

`nws.ts` gets `enabled: false` in its constructor config — the connector
class, its CAP severity-mapping logic, and its tests all stay fully
intact. `ConnectorRegistry.listEnabled()` (what `ConnectorManager` actually
schedules) now skips it entirely; it never collects or queues another item.
`supportedCategories` becomes `[]` (no honest non-empty value exists for a
100%-routine-weather feed once `'weather'` no longer exists as a category).

### Dedupe self-healing extended to `category`

`dedupe.ts`'s `diffEvent` previously compared only `title`/`description`/
`status`/`importance`. An already-stored significant GDACS disaster whose
category needs correcting (weather→natural_disasters) would otherwise have
identical title/description/importance and be reported "unchanged," never
re-persisted. `category` was added to `ExistingRecord`, `diffEvent`, and
`processMessage.ts`'s `rememberForDedupe` snapshot — the same self-healing
mechanism this session already used for country/severity corrections.

### API-layer exclusion — the real fix, not React

Every Journalist-facing query now unconditionally excludes
`category = 'weather'` (regardless of any caller-supplied filter):
`eventsApi.ts`'s `listEvents` and `getEventDetail` (including its own
by-id fetch — a stale link 404s rather than resolving), `briefApi.ts`'s
by-id fetch, all 4 of `dashboardApi.ts`'s `getDashboardSummary` queries,
`mapApi.ts`'s `getGeoReadiness`/`getMapSummary`, and all 9 of
`entitiesApi.ts`'s `entity_event_links`/`normalized_events` query sites
(mention counts, `getEntityDetail`'s stats/breakdown/recentEvents/
breakingEvents/upcomingEvents, relationship evidence). Historical weather
rows are never deleted — simply never returned. `entityExtraction.ts`'s
batch-selection query got the same defensive exclusion, since the dedupe
fix above can bump `updated_at` on corrected rows.

One accepted, bounded gap: an entity's `last_seen_at`/`mentionCount` that
was last touched by a weather event before this change lags until a real
new mention refreshes it — self-healing, not requiring a backfill.

### Priority engine: key swap, same weights

`priority.ts`'s `CATEGORY_IMPACT_DEFAULTS`/`CATEGORY_BASE_WEIGHT` swap
their `weather` key for `natural_disasters` with the same real values;
`computeDisasterSeverity` checks `category === 'natural_disasters'`. No
weight rebalancing — the prior phase's rebalancing rationale (raising
`disasterSeverity`'s weight) still applies unchanged.

### Frontend: one category swapped in place

`src/lib/categories.ts`'s `weather` entry becomes `natural_disasters`
(label "Natural Disasters", `Mountain` icon — chosen to avoid clashing
with `severity.ts`'s icons), same array index (preserves the dataviz
palette's fixed slot order). `index.css` gets `--cat-natural-disasters`
(same validated color as the old `--cat-weather` slot); the old variable
is left defined but unused, not deleted.

## Verification performed

- `npx vitest run` (worker): **431 tests pass** (up from 421 — new tests
  cover GDACS's Green-skip/Orange-Red-kept behavior, NWS's disabled state,
  dedupe's category-diff self-healing, and the weather exclusion on every
  one of the API-layer query sites listed above).
- `npx tsc --noEmit` (worker and frontend) and `npm run build` (frontend):
  both clean. Removing `'weather'` from `CATEGORY_IDS` surfaced every
  `Record<CategoryId, ...>` site (`priority.ts`, both connectors'
  `supportedCategories`) as a compile error, confirmed all were updated;
  loose-object-literal test fixtures (not covered by that safety net) were
  found via a manual grep pass and fixed.
- Live: triggered the scheduled handler against the real Supabase-backed
  worker — confirmed GDACS's real currently-active items (all Green at
  verification time) were skipped entirely (no new rows), NWS was never
  collected again, and the fix propagated correctly to `GET /events`,
  `GET /dashboard/summary`, `GET /map/summary`, and `GET /entities`/entity
  detail with zero `category: 'weather'` rows returned anywhere.

## Risks & assumptions carried forward

- GDACS's live feed may go through periods with zero Orange/Red items —
  an honestly empty `natural_disasters` category is the correct, expected
  state, not a bug to compensate for by lowering the bar.
- The `weather` row in `categories` and any historical `weather`-categorized
  `normalized_events` rows remain in the database, untouched, for audit —
  they are simply excluded from every Journalist-facing read.
- Entities whose only historical mentions were weather-derived will show a
  reduced (correct) mention count immediately, but their `last_seen_at`
  will lag until a real new mention arrives (see the dedicated note above).

## Consequences

- No routine weather can appear anywhere in the Journalist experience —
  enforced once, at the connector/API boundary, not scattered across
  components.
- Genuinely significant natural disasters remain fully supported, using
  GDACS's own real severity classification as the bar.
- The Dashboard, Feed, Map, and Entity Explorer all now answer "what
  matters" rather than "what did a weather feed emit."
