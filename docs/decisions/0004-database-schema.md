# ADR 0004: Database Schema (authored only, not executed)

**Status:** Accepted (SQL authored and syntax-validated; nothing applied to any database)
**Date:** 2026-08-07

## Context

Phases 1-3 (connector framework, Connector Manager, Cron scheduling) are
done and fully local/tested, but every prior ADR flags the same gap:
results are logged, never stored. Phase 6 of the backend roadmap (ADR 0002)
designs the Supabase Postgres schema that closes that gap.

Confirmed with the user before writing any SQL: **author migrations only,
don't execute them.** Docker still isn't installed (checked again this
session) and no Supabase access token exists yet (ADR 0001) — there is no
local or remote Postgres available to run anything against. This phase
produces versioned Supabase-CLI-format migration files, verified offline,
ready for the user to apply once they connect a real project.

## Decisions

### Scaffold via the real CLI, not hand-authored

Ran `npx supabase init` for real — pure local scaffolding (no account, no
Docker, no network resource touched, same category of action as `npm init`)
— producing an authentic `supabase/config.toml` rather than one typed from
memory. Its comments turned out to matter: current Supabase projects do
*not* auto-expose new tables to `anon`/`authenticated` by default anymore
(`auto_expose_new_tables` is unset/false), so the RLS migration includes
explicit `GRANT` statements alongside every `CREATE POLICY` — relying on
policies alone would leave every table invisible to PostgREST regardless of
RLS.

### Eight migrations, one concern each

```
supabase/migrations/
  20260807180000_extensions.sql   pgvector, in its own `extensions` schema
  20260807180001_taxonomy.sql     categories (seeded), countries, cities, tags
  20260807180002_sources.sql      sources (seeded: nasa-news, who-news), connector_runs
  20260807180003_events.sql       raw_events, normalized_events, event_updates,
                                   event_relationships, 3 native enum types
  20260807180004_entities.sql     organizations, people + 3 event join tables
  20260807180005_ai.sql           ai_summaries, embeddings (polymorphic)
  20260807180006_user_data.sql    watchlists, alerts, notifications, bookmarks
  20260807180007_rls_policies.sql RLS + GRANTs for all 21 tables above
```

Verified (by hand) that every `references` points at a table defined in an
earlier-numbered migration, including within-file ordering — no forward
references anywhere in the set.

### `normalized_events` mirrors `@insightwire/shared`'s `NormalizedEvent`, with two named exceptions

Field-for-field, camelCase TS ↔ snake_case columns (`sourceUrl` ↔
`source_url`, etc.) — one contract, two representations. The exceptions:

- **`embeddings` is not a column** on `normalized_events` — it's a separate,
  **polymorphic** table (`subject_type`/`subject_id` instead of a hard FK to
  events only), because Phase 10 explicitly wants semantic search over more
  than events eventually (entities, story suggestions), and building that in
  now avoids a schema rewrite later. Trade-off: `subject_id` can't be a real
  FK (one column can't reference multiple tables) — `subject_type` is the
  caller's contract for which table it means. No ANN index (ivfflat/hnsw)
  is created yet; that needs tuning against real row counts that don't
  exist.
- **`people`/`organizations` stay as plain `text[]` columns** *in addition
  to* new `organizations`/`people` reference tables and `event_organizations`/
  `event_people` join tables. The array columns are "whatever names the AI
  pipeline extracted" (Phase 5); the join tables are the deduplicated,
  queryable entity graph a future resolution step builds from those names.
  Not redundant — different layers of confidence.

### `category` is a real FK; `country`/`city` are deliberately not

`categories` is its own table (seeded with the same 8 values as
`packages/shared/src/taxonomy.ts`'s `CATEGORY_IDS`, kept in sync by hand —
noted directly in a `COMMENT ON TABLE`) — addresses the "no `health`
category" gap flagged in ADR 0002/0003 by making a new category a data
change instead of a code change.

`country`/`city` on `normalized_events` stay free text, matching exactly
what the shared Zod schema already requires and what the two live
connectors already emit (`'Global'` — not a resolvable ISO country).
`countries`/`cities` exist as reference tables for future geo joins (World
Map page, Phase 5 entity resolution) but are **not** FK-enforced against
`normalized_events` — forcing that FK today would immediately reject real
data from both existing connectors. `countries`/`cities` are left unseeded:
hand-typing a full ISO-3166 country list would be fabricated reference
data, not something this project actually sources.

### Native Postgres ENUMs for the three small, code-controlled unions

`importance` (`event_importance`), `verification_status`
(`event_verification_status`), and `status` (`event_status`) are native
Postgres `CREATE TYPE ... AS ENUM`, matching `Severity`/`VerificationStatus`/
`EventStatusId` exactly. Unlike `category`, these are small, fixed unions
where adding a value means a TypeScript change anyway — a real ENUM is the
more honest representation than a lookup table implying admin-editability
that doesn't exist for these.

### AI output is append-only, never overwritten

Directly implements the master prompt's "store AI output separately from
raw data, never overwrite original source information": `ai_summaries` is a
full history of every summary generation attempt (model, prompt version,
timestamp); `normalized_events.summary` is a denormalized "current best
value" column for fast reads, updated by an application-layer write, but
the history is never lost. Same append-only pattern for `embeddings`
(re-embedding inserts a new row; "latest" is a query, not an overwrite).

### RLS: authenticated-read for intelligence data, owner-scoped for user data

Two shapes, applied to all 21 tables:
1. **Reference/intelligence tables** (14 of them): RLS enabled, `SELECT`
   granted to `authenticated` only — not `anon`. The README's Vision section
   is explicit that this is "NOT another news website," so gating reads
   behind auth is the conservative default until a real
   subscription/access-tier decision is made (flagged as an open business
   question, not resolved here). No write policies for
   `authenticated`/`anon` on these tables — all writes happen via the
   Worker's `service_role` key, which bypasses RLS by Supabase design and
   never reaches the frontend.
2. **User-owned tables** (`watchlists`, `bookmarks`, `notifications`,
   `alerts`): full CRUD scoped to `auth.uid() = user_id`, referencing
   Supabase's built-in `auth.users` table (present by default on every
   Supabase project, even though no auth UI/flow exists in the frontend
   yet). `alerts` has no direct `user_id` — ownership is checked via its
   parent `watchlists` row — and only gets `select`/`update` policies
   (mark-as-read), since alerts are meant to be system-generated by a future
   matching job, not user-authored.

`watchlists.filters` (jsonb) is deliberately shaped to match the frontend's
existing mock `SavedSearch` concept (`src/lib/mockData.ts`), so a future
real-watchlists feature reads naturally as "the Alerts page's saved
searches, persisted." `bookmarks` backs the per-card Bookmark button already
built in `src/components/feed/EventCard.tsx` (currently local component
state only).

## Verification performed

- **Real Postgres-grammar syntax validation**: `libpg-query` (the actual
  PostgreSQL parser, not a generic/approximate SQL parser) parsed all 8
  files with zero errors (113 total statements across the set).
- **Structural cross-check**: every `CREATE TABLE` has a matching `ENABLE
  ROW LEVEL SECURITY` in the RLS migration (diffed, exact match, 21/21).
  Every `REFERENCES` target is defined in an earlier-numbered migration,
  verified both across files and in-file statement order.
- Root frontend/worker/shared typecheck confirmed unaffected (no application
  code touched this phase — SQL and Supabase config only).

## Explicitly not verified (no environment available)

That the migrations actually apply cleanly to a real Postgres in order,
that the RLS policies behave as intended under real auth sessions, and that
the pgvector extension is available on the target project's plan. All three
become real verification steps once the user connects an actual Supabase
project — this ADR does not claim the schema is proven correct at runtime,
only that it's syntactically valid and structurally consistent.

## Consequences

- `supabase/` now exists with a complete, ordered migration set covering all
  21 tables from the Phase 6 spec. Applying it (`supabase link` +
  `supabase db push`, once a project is connected) is the natural next
  action whenever the user is ready — not implied or triggered by this ADR.
- Phase 2's `InMemoryMetricsStore` gap (metrics reset on Worker restart) now
  has a real destination (`connector_runs`) — swapping in a Postgres-backed
  `MetricsStore` is future work, not done here.
- No code reads or writes this schema yet. That's the natural next phase
  once a real database exists to point at.
