# ADR 0009: Intelligence API (Phase 8)

**Status:** Accepted (implemented, unit-tested, and verified live end-to-end
in a real browser against the real database)
**Date:** 2026-08-08

## Context

The user's Phase 8 request described a large, multi-year vision: a real
`/events`/`/events/:id` API, a rich journalist detail view, an AI
"Intelligence Brain" (corroboration, conflict detection, confidence
tiers), a substantially expanded connector ecosystem (dozens of African and
international government sources), polling-priority tiers, and a
scheduled-events calendar. Mid-turn, the user also specified: the Worker
must be the API layer, the service-role key must never reach the frontend,
event cards must link to their real source, and all frontend mock data
must go.

Attempting all of that in one pass would mean either rushing it or
fabricating what this project's own rules forbid: invented connector
endpoints not verified live, AI output with no real model behind it, and
calendar entries with no real source. This ADR scopes **what was actually
buildable and verifiable this phase**, and names what wasn't, explicitly,
rather than silently dropping it.

## Decisions

### The Intelligence API lives in the Worker, not the frontend

`worker/src/api/router.ts` + `worker/src/api/eventsApi.ts` — real HTTP
routes (`GET /events`, `GET /events/:id`) added to the Worker's existing
`fetch()` handler, using the service-role key server-side exactly as the
user required. This retires the prior phase's anon-key-direct-from-browser
pattern entirely (not just superseded — the anon RLS grant from
`20260807190000_anon_read_access.sql` is revoked in
`20260808000000_revoke_anon_read_access.sql`, and the frontend's
`@supabase/supabase-js` dependency, `src/lib/supabaseClient.ts`, and
`src/lib/api/supabaseEvents.ts` are deleted outright). The frontend now
needs **zero** Supabase credentials — only `VITE_API_BASE_URL`, the
Worker's own URL. This closes the security exposure ADR 0008 flagged as a
real, live risk ("anyone with the project's anon key... can read all event
data") rather than leaving it in place alongside the new path.

### Read side deliberately separate from `Repository`

`eventsApi.ts`'s `listEvents`/`getEventDetail` don't extend `Repository`
(`worker/src/pipeline/repository.ts`) — that interface is scoped to the
ingestion pipeline's write/get-by-id needs, and Phase 7 explicitly required
it stay unchanged. Rich filtering, pagination, and sorting for a public
list endpoint is a different shape of problem; `getEventDetail` does reuse
`Repository.getNormalizedEvent`/`getEventUpdates` (via `getTimeline`)
directly, since those already fit exactly. `NormalizedEventRow`/
`fromNormalizedEventRow` are exported from `supabaseRepository.ts` and
reused rather than duplicated a third time.

### Filtering: built against what's real, with taxonomy gaps named instead of faked

The user's filter list included Government/Disaster/Weather/Science/
Health/International as category-like facets. The actual taxonomy
(`packages/shared/src/taxonomy.ts` `CATEGORY_IDS`) only has 8 values:
government, business, courts, markets, elections, weather, conflicts,
science — **no Disaster, Health, or International category exists.**
WHO/UN events are already forced into `government` as a documented
stopgap from an earlier phase. Rather than silently ignore this or invent
new category values with no connector actually producing them, `/events`
supports `category` filtering against the 8 real values only — extending
the taxonomy (migration + shared TS union + frontend category metadata +
recategorizing WHO/UN's `normalize()`) is real, valuable, separate work,
not bundled in here.

"Breaking/emerging" has no dedicated signal either — defined as
`priority_score >= 60` (`BREAKING_PRIORITY_THRESHOLD`), since the Priority
Engine already folds freshness/trust/confirming-sources into that one
number (ADR 0006). A documented operational definition, not a new
fabricated metric. `region` filtering remains a no-op (no country→region
mapping table exists) — same honest gap ADR 0008 already documented for
the path this replaces.

### Related events: a named heuristic, not a knowledge-graph claim

`getEventDetail`'s `relatedEvents` is "same category, same country,
excluding itself, 5 most recent" — a deterministic query, not the
in-process Entity Graph (which still has no Postgres-backed persistence —
unchanged this phase) and not an AI judgment. Labeled as such in both the
API response shape's doc comment and the frontend detail page's rendering,
so nothing implies a curated relationship that doesn't exist yet.

### Real total counts, not estimates

`listEvents` requests `count: 'exact'` from PostgREST and returns
`totalCount` alongside the page of results. The Dashboard's stat cards use
this for "Events tracked"/"High-priority alerts" rather than approximating
from a single page. The old mock Dashboard's fabricated deltas ("+18% vs
yesterday") have no real counterpart yet (would need a second historical
query this phase didn't build) — dropped rather than replaced with an
equally fake-looking real number.

### Event cards: click-to-detail, explicit separate "Read original source"

The user's instructions read as two related but distinct requirements:
make the card open the source, and also provide a distinct labeled action
for it. Implemented as: the card body navigates to the internal journalist
detail page (`/feed/:id` — matching the original Phase 8 mockup's rich
detail view, and keeping the existing "Open details" concept alive rather
than replacing it with an external navigation that would make the detail
page unreachable from the feed). A separate, explicit "Read original
source ↗" action exists on both the card and the detail page, opening
`event.sourceUrl` in a new tab — **only rendered when a real URL exists**;
nothing is fabricated when a connector didn't capture one. This
interpretation is flagged here explicitly in case the intent was for the
whole card to bypass the detail page entirely.

### Mock data removed from Dashboard; other routes explicitly left alone

`src/routes/Dashboard.tsx` now fetches real data through `fetchEvents`
exclusively — `mockEvents`/`mockStorySuggestions`/`mockSources` are no
longer imported there. `StorySuggestions` (AI-generated story angles) had
no real backend to replace it with, so the section was removed from the
Dashboard entirely rather than left showing fabricated suggestions.
`src/components/dashboard/CategoryBreakdown.tsx` was retyped from the old
`IntelEvent` mock shape to real `NormalizedEvent` (its logic — filter by
`.category`, same field name — needed no other change).

**`Alerts.tsx`/`Calendar.tsx`/`EntityExplorer.tsx`/`WorldMap.tsx`/
`TimelineBuilder.tsx`/`Workspace.tsx`/`Admin.tsx`/`Assistant.tsx` are
untouched and still on mock data.** None of them have a real backend yet
(watchlists/alerts have schema but no API; entity graph has no
Postgres persistence or API; calendar/scheduled events don't exist
anywhere in the system; connector health/metrics aren't exposed; the AI
assistant doesn't exist). Gutting their mock data with nothing real to
show would make the app strictly worse, not more honest — flagged here as
open work, not silently left inconsistent.

## Explicitly out of scope this phase (and why)

- **AI Intelligence Brain** (corroboration, conflict detection, confidence
  tiers, suggested questions, earliest-source tracking) — requires a real
  `ANTHROPIC_API_KEY` (still unset; `NullAiProvider` is still the active
  provider) and substantial new prompt/schema design. Building this without
  a real key to verify against would repeat exactly what ADR 0005 already
  flagged about `ClaudeAiProvider`: "never called against the real API...
  a genuine unknown until a key is configured." Not attempted here.
- **African/international connector expansion** (South Africa, Botswana,
  Namibia, Zimbabwe, Zambia, Mozambique, Angola, Kenya, Nigeria, Ghana,
  Tanzania, Uganda, Rwanda, Ethiopia, DRC, AU, Iran, US, Israel, Russia/
  Ukraine, Europe, China, UN, and more) — this project's own established
  rule (every connector added so far, per ADR 0005) is to verify each
  source live before writing code against it. Dozens of sources means
  dozens of individual verifications; none were done this phase, so none
  were coded. A real, sequenced follow-up, not a bolt-on.
- **Polling-priority tiers** (breaking/frequent/normal/slow) — the
  underlying capability already exists: `ConnectorManager.collectDue()`
  already polls each connector at its own `refreshIntervalMs` (NWS/GDACS
  already poll every 15 min vs. NASA/WHO/UN's 60 min — a "frequent" vs.
  "normal" tier in effect today). Named tier labels on top of that are
  presentational sugar, not a functional gap — not added without a
  concrete need for the label itself.
- **Global Forthcoming Events calendar** — agreed with the user as its own
  future phase before this one started; no scheduled-event data source
  exists anywhere in the system yet.

## Verification performed

- `npm run test --workspace=worker`: **179 tests pass** (159 pre-existing +
  20 new — `eventsApi.test.ts`, `router.test.ts`), covering query parsing,
  every filter (including `breakingOnly`'s threshold, `minSourceTrust`/
  `minConfidence`, the documented `region` no-op), pagination/`totalCount`,
  `getEventDetail`'s related-events query shape and its "not found ->
  undefined, no wasted query" short-circuit, and the router's CORS/404/503/
  500 paths against a mocked Supabase client.
- `npx tsc --noEmit` (worker) and `npm run build` (root/frontend): both
  clean.
- **Real, live, local end-to-end verification** (both dev servers running
  against the real `loelneyenvxcuyoluksd` project, headless Chromium via
  Playwright):
  - `GET /events` and `GET /events/:id` return real rows from Phase 7's
    411 stored events, with correct CORS headers.
  - Dashboard renders real numbers: 336 events tracked (24h), 107
    high-priority, 2 countries/2 sources reporting (from a real 200-row
    diversity sample, not the top-6 display set, which alone would have
    understated it) — zero console errors.
  - Feed → click a card → navigates to `/feed/:id` (URL-encoded id
    round-trips correctly through React Router) → detail page renders the
    real title, location, source, first-detected/last-updated, confidence,
    priority score, "What's happening" (honestly falling back to the raw
    description, with an explicit "AI summarization isn't configured yet"
    note since `summary` is genuinely absent), a real "Sources" panel
    (`nws-alerts`, real trust score), and 5 real related events (same
    category+country heuristic, working against live data).
  - "Read original source" link's `href` matches the exact real NWS CAP
    alert URL from the database — not fabricated, not a placeholder.
  - Zero console/page errors throughout.

## Risks & assumptions carried forward

- `getEventDetail`'s related-events query runs one extra round-trip per
  detail-page view; acceptable at today's volume, not load-tested.
- Category/Disaster/Health/International taxonomy gap is now documented in
  two places (this ADR and the code) but not fixed — a real product
  decision (which values, how existing rows get recategorized) that
  shouldn't be made silently inside an API-building phase.
- Dashboard's country/source "reporting" stats are computed from a
  200-row sample, not a true distinct-count query — accurate for today's
  volume (411 total rows), would need a real `count distinct` query (not
  available cheaply via PostgREST) if the dataset grows much larger.
- CORS is fully open (`*`) on a read-only API backed by a service-role key
  that never leaves the Worker — acceptable for a local, unshared instance;
  worth revisiting alongside any public deployment decision.

## Consequences

- The frontend now runs on a real, tested, server-side API with no
  Supabase credentials of its own — a strictly better security posture
  than the previous phase's anon-key-direct pattern, which is now fully
  removed rather than left as a parallel path.
- A journalist can go from the feed to a real detail page with real
  timeline/sources/related-events and reach the original evidence in one
  click — the core "journalist intelligence tool" loop the user described,
  built on real data, with every gap (AI, calendar, connector breadth,
  taxonomy) named rather than papered over.
