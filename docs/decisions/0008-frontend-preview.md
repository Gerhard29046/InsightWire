# ADR 0008: Frontend Preview (local, anon-read)

**Status:** Superseded by [ADR 0009](0009-intelligence-api.md) — the
anon-key-direct-from-browser pattern this ADR describes was a deliberate,
temporary stopgap and has since been fully removed (anon RLS access
revoked, `@supabase/supabase-js` and its frontend wrapper code deleted) now
that a real server-side Intelligence API exists. Kept below for historical
context on why the stopgap existed and what it traded off.
**Date:** 2026-08-07

## Context

Phase 7 made the backend durable but explicitly left the frontend
untouched. The user then asked to "make the site live so I can see the
data." Two real questions had to be resolved before writing any code,
since both change the security posture or scope of what "connect the
frontend" means:

1. **Local preview vs. public deployment.** The user chose local preview —
   no Cloudflare/hosting deploy this phase.
2. **How the frontend reads data, given RLS.** `0007_rls_policies.sql`
   locks `normalized_events` and every other reference/intelligence table
   to `SELECT` for `authenticated` only — not `anon` — and that migration's
   own comment flagged this as "a business/subscription-tiering question
   nobody has answered yet." No auth UI/flow exists in the frontend. The
   user chose to answer that question now: open anon read access rather
   than build an auth flow or a server-side API layer first.

## Decisions

### Migration `20260807190000_anon_read_access.sql`: anon SELECT, scoped to reference/intelligence tables only

Grants `SELECT` to `anon` and widens every existing `authenticated`-only
policy on the 18 reference/intelligence tables (the same set from
`0007`/`0008`) to `anon, authenticated`. **User-owned tables
(`watchlists`, `bookmarks`, `notifications`, `alerts`) are deliberately
untouched** — they stay `auth.uid()`-scoped regardless. Opening someone's
personal bookmarks to anonymous reads was never part of what was asked;
only public intelligence data was.

This is a real, explicit security posture change, not a default anyone
should assume: it means anyone with the project's anon key (embedded in
any client bundle built against it) can read all event data. Acceptable
for a local, unshared preview; worth revisiting before this is ever
deployed publicly.

### Frontend reads Supabase directly with the anon key — a preview shortcut, not the planned API layer

`src/lib/api/events.ts`'s `fetchEvents` already had a REST contract
(`GET {VITE_API_BASE_URL}/events`) designed for a future backend API layer
that doesn't exist yet. Rather than build that layer now, `fetchEvents`
gained a second path: when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are
set, it calls `fetchEventsFromSupabase` (new: `src/lib/api/supabaseEvents.ts`)
instead, translating the same `EventFiltersState`/`EventSortMode` into a
PostgREST query directly against `normalized_events`. Both paths return the
identical `FetchEventsResult` shape, so `useEventsFeed` and every UI
component under it needed zero changes — the same "swap, not a rewrite"
pattern the worker's `Repository` already used.

**Known, accepted narrowing**: `regions` (a frontend-only geographic
grouping) has no filter applied — `NormalizedEvent` has no region field and
no country→region mapping table exists. An honest no-op, not a fabricated
mapping; the REST contract this replaces would have hit the exact same gap.
`'trending'` sort falls back to `priority_score` (same as `'importance'`) —
no real trending/velocity signal exists yet (per ADR 0006), so this is the
closest honest proxy rather than inventing one.

### Scope: `EventsFeed` only, not `Dashboard`

`src/routes/EventsFeed.tsx` (`useEventsFeed` → `fetchEvents`) already used
the real `NormalizedEvent`/`EventFiltersState` contract — the natural,
already-built integration point. `src/routes/Dashboard.tsx` is still on an
older, different mock shape (`mockEvents` with `.severity`/`.score`/
`.entities`, from `src/lib/mockData.ts`) that predates the shared
`NormalizedEvent` type entirely — wiring it up is a separate, larger task
(different data shape, not just a missing data source) and wasn't part of
what was asked. Left on mock data, unchanged.

### The anon key is not the service-role key — different handling is correct, not an oversight

The worker's `SUPABASE_SERVICE_ROLE_KEY` (Phase 7) bypasses RLS and must
never reach a browser. The frontend's `VITE_SUPABASE_ANON_KEY` is the
opposite by Supabase's own design: meant to ship in client bundles, safe
because RLS is what actually gates what it can read. `src/lib/supabaseClient.ts`
only ever touches the anon key; the service-role key has no code path into
the frontend workspace at all.

## What it took to actually see data

1. Applied `20260807190000_anon_read_access.sql` via the SQL Editor (same
   workaround as Phase 7 — `supabase link`/`db push` still hits the CLI's
   `LegacyLinkApiKeysNetworkError` bug). **First application attempt
   silently didn't take effect** — a direct anon-key `curl` against
   `normalized_events` still returned `Content-Range: */0` (0 rows) even
   though the service-role key showed all 411 existing. Traced to the
   migration not actually having been run yet (a false start, corrected by
   the user re-running it) rather than a caching/propagation issue — the
   second real run took effect immediately (`Content-Range: 0-2/411`), no
   `NOTIFY pgrst, 'reload schema'` or other workaround needed.
2. `.env.local` created at the repo root (gitignored) with
   `VITE_SUPABASE_URL` and the user's `sb_publishable_...` anon key (the new
   Supabase key format — same underlying `anon` Postgres role, publishable
   by Supabase's own design, never the service-role key).
3. `npm run dev` (Vite, port 5174) and the Events Feed page.

## Verification performed

- `npm run build` (root workspace): typecheck + Vite build clean with the
  new Supabase client wired in. Bundle grew ~427KB → ~638KB
  (`@supabase/supabase-js`) — expected, not investigated further for a
  local preview.
- **Real browser verification**: launched headless Chromium (Playwright)
  against the running dev server, navigated to `/feed`, and confirmed real
  rendered content — actual NWS alert titles ("Severe Thunderstorm Warning
  issued August 7...", "Flash Flood Warning..."), real locations
  (Westmoreland/Greensburg PA), real confidence percentages (95%), and
  "Live"/"Verified" badges from the real `normalized_events` rows written
  in Phase 7 — not the old mock data. Zero console errors, zero page
  errors. Screenshot confirms correct layout/styling, not a broken or
  blank render.

## Risks & assumptions carried forward

- Anon-readable event data is a real, live security posture change from
  Phase 6/7's original conservative default — flagged here explicitly, not
  silently changed.
- If this is ever deployed publicly, the anon key becomes effectively
  public infrastructure (embedded in the built JS bundle) — revisiting
  whether anon-read is still the right call before that happens is a real
  future decision, not automatic.
- `Dashboard.tsx` remaining on mock data means the app is now in a mixed
  state (one real page, one mock page) until/unless that's addressed
  separately.

## Consequences

- The Events Feed page can show real, live InsightWire data end-to-end
  (Supabase → anon-readable RLS → direct PostgREST query → existing UI)
  without any REST API layer existing yet — once the user completes the
  two manual steps above.
- The originally-planned `VITE_API_BASE_URL` REST contract is untouched and
  still the intended path once a real API layer exists — this phase adds a
  second path, it doesn't remove the first.
