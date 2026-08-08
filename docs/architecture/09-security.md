# 09 · Security

A snapshot of what's actually true today, not a target-state security
review — there's no live database, no deployed Worker, and no auth flow
yet, so most of this is "designed but unapplied."

## Data access (designed, not yet live)

[04-database.md](04-database.md)'s RLS policies (`0007_rls_policies.sql`):
reference/intelligence tables are `SELECT`-only for `authenticated` (not
`anon`) — a deliberate choice, since InsightWire is explicitly "not another
news website," per the README. Writes to those tables only ever happen via
the Worker's `service_role` key, which bypasses RLS by Supabase design and
never reaches the frontend. User-owned tables (`bookmarks`, `watchlists`,
`notifications`, `alerts`) are scoped to `auth.uid() = user_id`. None of
this has been exercised against a real auth session — see
[06-supabase.md](06-supabase.md).

## Secrets

The only secret the backend currently has a place for is
`ANTHROPIC_API_KEY`, read as a Worker environment variable
([`worker/src/pipeline/ai/enrichmentPipeline.ts`](../../worker/src/pipeline/ai/enrichmentPipeline.ts)'s
`selectAiProvider`) — never sent to or bundled into the frontend. No key is
currently configured anywhere; `NullAiProvider` is what runs today. The
frontend's own `VITE_API_BASE_URL` pattern
([`src/lib/api/client.ts`](../../src/lib/api/client.ts)) is a URL, not a
credential — the frontend has no secrets to leak.

## Ingestion boundary validation

Every connector's output passes through `validate()` (a Zod
`safeParse` against `NormalizedEventSchema`,
[`packages/shared`](../../packages/shared)) before it can reach the
pipeline — malformed or unexpected shapes from any source are rejected at
the boundary, not trusted implicitly. This runs per-item, so one malformed
entry from a feed can't take down a whole batch (see
[03-ai-pipeline.md](03-ai-pipeline.md)).

## External source citizenship

Only official APIs, RSS feeds, or sources that explicitly permit automated
access — no scraping arbitrary websites (see
[02-connectors.md](02-connectors.md)). A descriptive `User-Agent` header is
sent on every outbound request after NOAA's live API rejected anonymous
requests with HTTP 403 — a real finding from live verification, not a
precaution taken blind.

## Known, currently-unaddressed items

- **`react-router-dom` has an open high-severity advisory** (RSC Mode CSRF
  Bypass) flagged by `npm audit` when Phase 6's dependencies were added —
  noted, not fixed (`npm audit fix --force` would be a breaking downgrade,
  out of scope for a backend phase).
- **No authentication exists in the frontend at all** — the RLS design
  above has never been tested against a real signed-in user.
- **No rate limiting or abuse protection** on anything, since nothing is
  deployed publicly yet.
- **In-memory stores mean no audit trail survives a restart** — every
  `InMemory*` store in `worker/src/pipeline/` and `worker/src/manager/`
  resets on redeploy; nothing sensitive is stored today, but this would
  matter once real user data (bookmarks, watchlists) exists.
