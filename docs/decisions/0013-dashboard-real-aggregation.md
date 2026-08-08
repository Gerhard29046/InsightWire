# ADR 0013: Dashboard — Real Backend-Computed Aggregation

**Status:** Accepted (implemented, unit-tested, and verified live end-to-end
against the real `loelneyenvxcuyoluksd` Supabase project, including an
independent hand-written cross-check of every number)
**Date:** 2026-08-08

## Context

The user asked for a full audit of the Dashboard, believing its stat cards
("517 events tracked," "138 high-priority alerts," etc.) might be
hardcoded or mock. They weren't — ADR 0009 had already wired `Dashboard.tsx`
to the real Intelligence API, with zero `mockData.ts` imports. But auditing
it directly (not trusting that prior ADR's claim) surfaced two real,
separate problems that made the numbers *look* untrustworthy even though
most of them were real:

1. **"Signal by category" was silently wrong.** `CategoryBreakdown.tsx`
   computed its counts by filtering whatever `events` array it was passed
   — and `Dashboard.tsx` passed it the 6-event "highest signal" sample, not
   the real 24-hour total. Every category count on that widget was capped
   at 6, no matter how many real events actually existed. Not mock data —
   a real calculation bug with the same practical effect of being wrong.
2. **"High-priority alerts" used an inconsistent, undocumented definition.**
   It filtered on `importance ∈ {critical, high}` (a connector-seeded,
   `UNSCORED_IMPORTANCE = 'medium'` default field — see every connector's
   own doc comment), not `priority_score >= 60`
   (`BREAKING_PRIORITY_THRESHOLD`), which is the actual, documented
   "high-priority/breaking" definition the rest of the system already uses
   (`docs/decisions/0006-intelligence-quality.md`, and `eventsApi.ts`'s own
   `breakingOnly` filter). Two different "high priority" definitions
   existed in the codebase; Dashboard used the wrong one.
3. **Country/source diversity was sampled, not exact.** Capped at a
   200-row `fetchEvents` call — an honest, documented limitation from ADR
   0009 ("would need a real count distinct query... if the dataset grows
   much larger"), but a real accuracy gap once the real dataset (currently
   830+ rows) exceeds that cap within a 24h window.

## Decisions

### One real endpoint: `GET /dashboard/summary`, computed entirely server-side

Per the user's explicit instruction ("define dashboard metrics in the
backend/API rather than duplicating complicated business logic in React"),
`worker/src/api/dashboardApi.ts`'s `getDashboardSummary()` replaces the
three separate `fetchEvents()` calls `Dashboard.tsx` used to make. It runs
4 real Postgres queries against `normalized_events` in parallel
(`Promise.all`):

1. `eventsTracked24h` — exact `count: 'exact'` of non-scheduled rows with
   `published_at >= now-24h`.
2. `highPriorityAlerts24h` — the same, plus `priority_score >=
   BREAKING_PRIORITY_THRESHOLD` (imported from `eventsApi.ts`, not
   redefined — one threshold, one place).
3. A narrow `country, source, category`-only select over every matching
   row in the window (no cap) — used to compute `countriesReporting`/
   `sourcesReporting` as **exact** `Set` sizes and `categoryBreakdown` as
   **exact** per-category counts, replacing the 200-row sample entirely.
   Fetching 3 narrow columns for ~500 rows is cheap; the old sampling
   approach traded a real accuracy gap for a savings that didn't exist at
   this scale.
4. `highestSignalEvents` — `SELECT_COLUMNS` (exported from `eventsApi.ts`
   so both files can't drift), same `status != 'scheduled'` exclusion,
   ordered by `priority_score` descending — **the exact same column and
   direction** `eventsApi.ts`'s `sort: 'importance'` already uses for the
   Feed, per the user's "use the existing scoring, don't invent a second
   list" instruction.

Every real category (`CATEGORY_IDS`) is zero-filled up front, so a category
with no events this window reports `{ category: 'courts', count: 0 }`
rather than being silently absent.

### Scheduled events excluded explicitly, in every one of the 4 queries

`dashboardApi.ts` doesn't call `listEvents()` (it needs raw aggregation
`listEvents` doesn't expose), so it asserts `.neq('status', 'scheduled')`
itself on all 4 queries rather than relying on `listEvents`'s own default
exclusion (docs/decisions/0012's "Correction" section) implicitly. Verified
live: on the day this shipped, 45 real scheduled calendar events had been
*discovered* (and therefore had a recent `published_at`) within the 24h
window — proving this isn't a hypothetical edge case — and all 45 were
confirmed absent from every Dashboard number.

### Duplicates/merges: already correct, by construction

`normalized_events` is already the deduplicated/merged table — a single
event confirmed by 3 connectors is one row with 3 `confirmingSources`, not
3 rows (see `mergeEngine.ts`, unchanged). Every Dashboard count is a
`COUNT`/`SELECT` over this same table, so it inherits this property for
free; no additional dedup logic was needed or added.

### Frontend: one hook, real per-second "Updated Xs ago," no fabricated deltas

`src/hooks/useDashboardSummary.ts` polls `GET /dashboard/summary` every
60 seconds — explicitly the Feed's own cadence (`useEventsFeed`'s default),
not the Calendar's hourly one, per the user's explicit instruction that the
Dashboard is a live-intelligence view. `lastUpdatedAt` is set only on a
real successful response; `Dashboard.tsx` re-renders once a second (a tiny
local `useClockTick`) purely to keep the "Updated Xs ago" text current
without re-fetching. `CategoryBreakdown.tsx` now takes the real
`categoryBreakdown` array directly instead of computing anything itself.
No `+18%`-style fabricated deltas were reintroduced (`StatCard`'s optional
`delta` prop is simply never passed) — consistent with ADR 0009's original
decision to drop the mock cards' fake percentages rather than replace them
with an equally fake real-looking number.

### Honest empty/error states, not a second mock layer

`status === 'ready' && eventsTracked24h === 0` renders "No live
intelligence detected in the selected period." (`EmptyState`, reusing the
`title`/`description` override added for the Calendar in ADR 0012) instead
of a grid of real zeroes — a deliberate UX choice, not a data question
(the zeroes are still real and would be shown correctly if rendered).
`ErrorState` gained the same kind of override (`title="Unable to load live
intelligence."`) while keeping its existing specific diagnostic
description (offline/timeout/auth/server) — the user's exact requested
copy plus the diagnostic detail already good enough to keep.

### `Alerts.tsx` and its own mock data: explicitly out of scope, not silently ignored

The audit found `src/components/dashboard/EventCard.tsx` and
`StorySuggestions.tsx` still reference `mockData.ts`'s `IntelEvent`/
`StorySuggestion` types — but neither is imported by `Dashboard.tsx`
(confirmed by grep): `EventCard.tsx` (dashboard-scoped) is used only by
`Alerts.tsx`, and `StorySuggestions.tsx` is imported nowhere at all
(orphaned since ADR 0009 removed it from the Dashboard). Per the user's own
framing — Dashboard, Feed, Calendar, and Live Alerts are four *separate*
responsibilities — rebuilding the standalone Alerts page's real
watchlist-matching feature is real, separate, ADR-worthy work (it needs a
notifications/matching pipeline that doesn't exist yet), not something to
fold into "fix the Dashboard" without being asked. Named here rather than
silently left alone.

## Verification performed

- `npm run test --workspace=worker`: **274 tests pass** (258 pre-existing +
  16 new: 10 in `dashboardApi.test.ts` covering exact counts, the
  `status != 'scheduled'` exclusion on all 4 queries, the
  `BREAKING_PRIORITY_THRESHOLD` filter, exact (uncapped) diversity
  counting, zero-filled category breakdown, `priority_score` sort order,
  custom window-hours, `generatedAt`, and error propagation; 6 in
  `router.test.ts` for the new route including CORS/503/500/malformed
  `?hours=`).
- `npx tsc --noEmit` (worker) and `npm run build` (root): both clean.
- **Real, live endpoint verification**: `wrangler dev` against the real
  Supabase project returned `eventsTracked24h: 513`,
  `highPriorityAlerts24h: 303`, `countriesReporting: 4`,
  `sourcesReporting: 6`, `categoryBreakdown` summing exactly to 513
  (19 government + 491 weather + 3 science + 0 everywhere else).
- **Cross-checked against the Feed's own endpoint**: `GET
  /events?timeRange=24h&pageSize=1` (the Feed's own default
  status-exclusion) returned `totalCount: 513` — an exact match with
  `eventsTracked24h`, directly proving the user's "if Feed says 517,
  Dashboard should derive the same number" requirement.
- **Independent hand-written re-verification**
  (`worker/scripts/verifyDashboardSummary.ts`, same one-off-script
  convention as `verifyIdempotency.ts`/`verifyCalendarConnectors.ts`):
  separate queries, not calling `dashboardApi.ts` at all, reproduced every
  number exactly (513/303/4/6/{government:19, weather:491, science:3}) and
  additionally confirmed **45 real scheduled events discovered within the
  same 24h window were correctly excluded from all of them** — not a
  hypothetical, an observed real case the day this shipped.
- **Real, live browser verification** (Playwright against the real Worker
  + real data): exactly 2 `/dashboard/summary` requests over a 15-second
  observation window (React's normal dev-mode double-invoke, flat — not a
  refetch loop, the same class of bug just fixed on the Calendar page),
  stat cards rendering `513/303/4/6` in the DOM, "Updated Xs ago" and
  "Auto-refreshes every 60s" both present, zero console errors.

## Risks & assumptions carried forward

- The diversity/category query fetches every matching row's 3 narrow
  columns with no cap — fine at today's real volume (~500 rows/24h); would
  need revisiting (e.g. a Postgres `count(distinct ...)` RPC) if that
  volume grows by an order of magnitude or more.
- `Alerts.tsx` remains on `mockData.ts` — unchanged, named above as
  explicitly out of scope for this phase.
- No Supabase Realtime — the Dashboard, like the Feed, still polls rather
  than subscribes; unchanged from every prior phase's documented gap.

## Consequences

- Every number on the Dashboard is now traceable to one real, tested,
  independently-verified backend function reading `normalized_events`
  directly — no sampling, no second event list, no inconsistent
  "high-priority" definition.
- The Dashboard and the Global Events Feed are now provably showing the
  same real number for the same real definition of "events tracked,"
  closing the exact gap the user's audit was worried about.
- `CategoryBreakdown.tsx` is now correct for any real dataset size, not
  silently capped at whatever the "highest signal" list happened to
  contain.
