# 07 · REST API

**Status: not started, explicitly deferred.** When Phase 6.5 was proposed,
the user paused it directly: "The highest priority is now the Intelligence
Engine, because without live data the API and frontend have nothing
meaningful to serve." That's still true — there's no live database
([06-supabase.md](06-supabase.md)) for an API to read from yet.

## What's already shaped like an API contract

Nothing here is built, but it isn't a blank page either:

- **`NormalizedEvent`** ([`packages/shared`](../../packages/shared)) is
  already the exact shape the frontend expects
  (`src/lib/api/types.ts` re-exports it directly) and the exact shape
  `Repository` persists — an API layer's main job would be querying/
  filtering/paginating this shape, not inventing a new one.
- **`src/lib/api/events.ts`** (frontend) already documents the query
  contract it expects: `GET /events?<filters>` with country/region/
  category/importance/language/source/verified/future/live/date-range/
  time-range params, sort mode, cursor pagination. This was written
  against an imagined backend in the Events Feed phase — it's a real
  starting point for what Phase 7 needs to implement, not a guess made
  blind.

## Original phase plan (for when this resumes)

REST endpoints (`GET /events`, `/events/:id`, `/timeline`, `/calendar`,
`/countries`, `/sources`, `/categories`, `/search`, `/alerts`, `/entities`;
`POST /bookmarks`, `/watchlists`), documented via OpenAPI. Not scoped in
detail yet — that's the first step whenever this phase actually starts.
