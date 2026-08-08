# ADR 0012: Global Government & Events Calendar — Real Data (Phase 1: South Africa)

**Status:** Accepted (implemented, unit-tested, and verified live end-to-end
against the real gov.za/thepresidency.gov.za sites and the real
`loelneyenvxcuyoluksd` Supabase project)
**Date:** 2026-08-08

## Context

ADR 0009 explicitly deferred the Calendar page: "no scheduled-event data
source exists anywhere in the system yet." The user's follow-up request
(34 sections, a full production architecture spec) asks for a real,
zero-mock calendar of upcoming government/parliamentary/economic events,
global in ambition but explicit that fabricated coverage is worse than
honest partial coverage ("If only 5 countries have verified connectors
today, show 5 countries").

This ADR scopes what was actually verified and buildable in one phase —
two real South African sources — using the existing architecture rather
than a parallel one, per this project's own established discipline
(ADR 0002/0005/0009: verify each source live before writing a connector
against it; dozens of sources means dozens of individual verifications,
not a bolt-on).

## Decisions

### No new schema, no new pipeline — the existing architecture already models a "scheduled" event

`@insightwire/shared`'s `NormalizedEvent` already has `startTime`/`endTime`
(optional ISO datetimes) and `status` already includes `'scheduled'`
(`packages/shared/src/taxonomy.ts` `EVENT_STATUS_IDS`) — unused by any
connector until now. `eventsApi.ts` already had a `futureOnly` filter
(`start_time > now()`). The Calendar is therefore not a new subsystem: it
is the same `normalized_events` table and the same Intelligence API,
filtered to `status: 'scheduled'` events with a future `start_time` — the
exact "one database, one API" principle the master spec asks for so a
future World Map can reuse the same data (ADR 0004 already left `lat`/
`lng` columns in place for this, still unpopulated by any connector).

Two small, additive API changes were needed: a `statuses` filter
(`status.in(...)`, mirroring the existing `categories`/`sources` filters)
and a new `'upcoming'` sort mode (`start_time` ascending, nulls last) —
the calendar's natural "soonest first" order, as opposed to the Feed's
"most recently published first."

### Two real South African sources, verified live before coding — not guessed

Per the master spec's explicit instruction ("verify the actual endpoint...
do not assume a source has an API"), every candidate source named in the
brief was checked against its real, live response before any connector
code was written:

| Source | Verified reality |
|---|---|
| `gov.za/news/events` | Real, structured Drupal Views **HTML table** (not RSS/API/ICS — checked the page's own `/rss-feeds` link and `<head>`, neither covers this section). Machine-readable `<time datetime="...">` ISO timestamps. Its own column-sort links exposed a real, working `start_date`/`end_date` server-side filter — confirmed by fetching it directly and checking returned rows fell inside the requested window. |
| `thepresidency.gov.za/events-calendar` | Real, structured HTML grid, server-rendered (no JS required — checked via plain `curl`). Real `<time datetime>` per item plus a separate free-text local time range (e.g. "18h00 - 20h00"). **No date filter or date-ascending sort exists** — confirmed by comparing page 0 and page 1's date ranges, which overlap and aren't monotonic. |
| SARB (`resbank.co.za`) monetary policy page | Real future MPC dates ("23 September 2026", "19 November 2026") genuinely exist on the page, but are rendered client-side (an AEM/Adobe Experience Manager site) — no dates appear in the raw HTML `curl` returns, and no underlying JSON/API endpoint was found. **Not built** — would require either headless-browser rendering (not available in a Workers isolate) or further reverse-engineering of a hidden AEM content-fragment endpoint. Flagged as real, valuable, unverified — not guessed at. |
| Parliament of South Africa (`parliament.gov.za/parliament-programme`) | Real programme exists but is published as **downloadable PDF documents** per term (e.g. "PARLIAMENTARY PROGRAMME FIRST TERM 2026"), not HTML/RSS/API. Not built this phase — PDF parsing is a real, different connector shape, not a copy of the two HTML connectors built here. |
| US BLS API (`api.bls.gov`) | Confirmed (from prior public knowledge of the API, not this session's fetch — the docs page itself 403'd to the fetch tool) to serve **already-published historical time-series data**, not a forward release-date calendar. A different, real BLS "release schedule" page exists publicly but was not fetched/verified this session — not built. |
| `api.data.gov` | Confirmed to be an API-key management gateway for other agencies' APIs, not a data source or calendar itself, and not a cross-agency search/browse layer. Nothing to connect to directly. |

### `dataset` connector type for structured HTML — not a new `type`, not a scrape hack

Neither new connector extends `RssConnector` (they parse HTML, not XML) —
`SourceConnector` is implemented directly, using `type: 'dataset'`
(already one of the three allowed `sources.type` values in the schema:
`'rss' | 'api' | 'dataset'`). A small shared helper module
(`worker/src/connectors/base/htmlCalendar.ts`) holds only the logic that's
genuinely identical between the two sources (relative-URL resolution,
entity decoding, extracting `<time datetime>` values, combining a
date-only value with a real local time-of-day into a precise UTC
instant) — row/item extraction stays per-connector since the two sites'
markup shapes differ enough that a shared parser would obscure more than
it'd share.

### Timezone handling: South Africa's fixed +02:00, never a fabricated time-of-day

Both sites' `<time datetime="...">` attribute always carries the
platform's own `T12:00:00Z` **placeholder** hour for date-only fields —
confirmed by direct inspection, not assumed. `south-africa-gov-events`
(gov.za) never has a separate time-of-day field, so this placeholder is
passed straight through exactly as published — the same "pass through the
source's literal value" principle every RSS connector already follows for
`pubDate`. `south-africa-presidency-events` *does* publish a real local
time range (e.g. "18h00 - 20h00", South Africa Standard Time, UTC+2
year-round, no DST) in a separate field — `combineDateWithSastTime` uses
that real text to produce a precise UTC instant, and — verified live — a
single time with no range never gets a fabricated `endTime`.

### Presidency connector: an honestly bounded, not fabricated-complete, page scan

Unlike gov.za's real `start_date`/`end_date` filter, the Presidency's
calendar exposes no date filter or sort — only a "principal" (person)
dropdown — and consecutive pages are not date-ordered (verified: page 0
held Aug 11-13, page 1 held a mix of Jul 31 and Aug 4-11). Scanning a
bounded 5 pages per poll (`PAGES_PER_POLL`) is a real trade-off, documented
in the connector's own doc comment, over either crawling all 73 pages
hourly (disrespectful of the source) or trusting page 0 alone (proven
incomplete). This is a real, named coverage gap — not hidden.

### Description is an honest empty string, not a fabricated summary

Neither listing page provides a synopsis for its events — `description:
''` on every event from both connectors, the same "leave it honestly
empty until a real source/AI pipeline provides one" pattern every
connector in this codebase already follows for fields it can't source
(e.g. `people`/`organizations` staying empty at ingestion).

### Frontend: Calendar.tsx rebuilt on the real Intelligence API, all mock data removed

`src/lib/calendarData.ts`'s fabricated 9-category taxonomy, 10-country
list, and 18 hardcoded demo events (`mockCalendarEvents`) are deleted
outright — it now holds only pure date-formatting helpers. `Calendar.tsx`
uses the same `useEventsFeed`/`fetchEvents` path as the Events Feed
(`futureOnly: true`, `statuses: ['scheduled']`, `sort: 'upcoming'`),
the same real 8-value category taxonomy (`lib/categories.ts`) already
used by Dashboard/Feed instead of a page-local invented one, and the same
free-text country `TagInput` the Feed already uses (no hardcoded
10-country dropdown). The truthful empty state reads "No upcoming events
found for the selected filters." per the master spec's explicit
requirement; `EmptyState` gained optional `title`/`description` overrides
so this doesn't fork a second copy of that component. Every agenda item's
"View official source ↗" link uses the event's real `sourceUrl` and only
renders when one exists — never fabricated, matching the existing Feed/
detail-page convention (ADR 0009). A small honest "Coverage today: N
countries · N sources" line is computed live from whatever the API
actually returns — never a fixed or padded number.

`useEventsFeed` gained an optional `pageSize` parameter (defaulting to the
existing 25) so the Calendar can request a wider window (200) to populate
a month grid — the Feed's own call sites are unaffected.

## Verification performed

- `npm run test --workspace=worker`: **256 tests pass** (238 pre-existing +
  18 new: `southAfricaGovEvents.test.ts`, `southAfricaPresidencyEvents.test.ts`,
  plus 2 new `eventsApi.test.ts` cases for the `statuses` filter and
  `'upcoming'` sort) — against real captured-and-trimmed HTML fixtures
  (not fabricated markup), covering single-day vs. date-range parsing,
  SAST time combination (including the "no fabricated endTime" case),
  relative-URL resolution, empty-description honesty, and schema
  validation.
- `npx tsc --noEmit` (worker) and `npm run build` (root): both clean.
- **Real, live connector verification** (`worker/scripts/verifyCalendarConnectors.ts`,
  same one-off-script pattern as `verifyIdempotency.ts`): both connectors
  fetched the real, live gov.za/thepresidency.gov.za pages —
  `south-africa-gov-events`: 15/15 real items valid; `south-africa-presidency-events`:
  30/30 real items valid (5 pages × 6 items) — normalized, schema-validated,
  and persisted via the real `SupabaseRepository` into the real
  `loelneyenvxcuyoluksd` project. Row counts confirmed by direct query:
  15 and 30 rows respectively; 23 events across all sources are
  genuinely `status = 'scheduled' AND start_time > now()` at verification
  time.
- **Real, live API verification**: `wrangler dev` against the real
  Supabase project, `GET /events?status=scheduled&future=true&sort=upcoming` —
  the exact query shape the Calendar page sends — returned real events
  sorted soonest-first ("National Women's Day", 2026-08-09, first),
  real `sourceUrl`s resolving to the actual gov.za/thepresidency.gov.za
  article pages, and `totalCount: 23`.

## Risks & assumptions carried forward

- `south-africa-presidency-events`'s page-scan coverage is real but
  bounded — a future poll cycle could miss an event that never appears in
  the first 5 pages scanned. Named in the connector's own doc comment,
  not silently accepted.
- SARB, Parliament, BLS, and every other country/institution named in the
  master spec remain **unconnected** — investigated to the depth the
  brief asked for ("verify before implementing"), not coded, because
  either no real machine-readable endpoint was found (SARB) or the real
  format (PDF, historical-only API) needs its own connector shape not
  built here.
- Neither new connector populates `lat`/`lng` — no legitimate coordinate
  source exists in either listing page; left null rather than
  geocoded/guessed, consistent with ADR 0004's existing rule.
- Gemini enrichment of calendar events (why it matters, story angles) is
  unbuilt, same "no real AI provider configured" gap as every other
  enrichment feature in this codebase (`NullAiProvider` is still active).
- Cron scheduling exists (`worker/src/index.ts`'s `createDefaultRegistry`
  now includes both connectors, polled hourly like the other government
  connectors) but nothing is deployed to a live Cloudflare account — same
  unchanged status as every connector in this codebase per ADR 0003.

## Consequences

- The Calendar page shows exactly what it should: real South African
  government/presidential events with real dates and real source links,
  or a truthful empty state — never a fabricated event.
- The Intelligence API's filter/sort surface is now a real superset
  capable of serving both a news feed and a forward-looking calendar from
  one table, proving out the "one database, one API, multiple views"
  design ADR 0004 anticipated for the future World Map.
- Global/African coverage beyond South Africa remains real, honest, and
  named as open work — not silently implied by a page that looks
  globally complete.
