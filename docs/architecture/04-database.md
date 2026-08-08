# 04 · Database

**Status: authored, syntax-validated, not yet applied to a real project.**
No migration in [`supabase/migrations/`](../../supabase/migrations) has run
against a live Postgres instance as of this writing — a real Supabase
project is being connected as part of Phase 7 (see
[06-supabase.md](06-supabase.md) and
[ADR 0007](../decisions/0007-supabase-repository.md)); this document will
note it once that first real `supabase db push` happens.

## The 22 tables, in migration order

| Migration | Tables |
|---|---|
| `0000_extensions` | pgvector, in its own `extensions` schema |
| `0001_taxonomy` | `categories` (seeded, synced to `packages/shared`), `countries`, `cities` (unseeded — no fabricated ISO data), `tags` |
| `0002_sources` | `sources` (seeded: `nasa-news`, `who-news` — the other 3 registered connectors were seeded in `0008`, see below), `connector_runs` |
| `0003_events` | `raw_events`, `normalized_events`, `event_updates`, `event_relationships` |
| `0004_entities` | `organizations`, `people` + event join tables |
| `0005_ai` | `ai_summaries` (append-only history), `embeddings` (polymorphic, pgvector) |
| `0006_user_data` | `watchlists`, `alerts`, `bookmarks`, `notifications` (reference `auth.users`) |
| `0007_rls_policies` | RLS + explicit `GRANT`s for all 21 tables through `0006` |
| `0008_intelligence_engine_fields` | seeds the 3 missing `sources` rows; adds `normalized_events.source_trust_score`/`.priority_score`/`.tags`; adds `event_confirming_sources` (new table); adds idempotency constraints to `event_updates`/`ai_summaries`; adds the `upsert_normalized_event_with_sources` function |

## Where the code-level contract and the DB schema diverge, on purpose

- **`normalized_events` mirrors `NormalizedEvent` field-for-field** as of
  `0008` — `embeddings` is still its own polymorphic table (not a column),
  and `confirmingSources` lives in `event_confirming_sources` (its own
  table, not a column) rather than jsonb, matching this schema's existing
  "separate table per array field" convention (`event_updates`,
  `ai_summaries`). Otherwise field-for-field, camelCase↔snake_case naming.
- **`category` is a real FK**; `country`/`city` are free text, *not*
  FK-enforced — today's connectors emit `'Global'`, not a resolvable ISO
  country, so forcing that FK would reject real live data.
- **No generic entity/relationship table** spanning all 8 types the
  in-process Entity Graph models (see
  [03-ai-pipeline.md](03-ai-pipeline.md)) — only `organizations`/`people`
  + event-join-tables exist today. Extending the schema to match the
  in-memory graph is still future work, unchanged by Phase 7 (`Repository`
  is the only interface this phase touches — see ADR 0007).
- **`raw_event_id` on `normalized_events` is always null** when written by
  `SupabaseRepository` — `Repository.upsertRawEvent` returns no id and
  `NormalizedEvent` carries no reference back to its raw row; linking them
  would require an interface change, out of scope this phase. Named
  explicitly in ADR 0007, not a silent gap.

## RLS shape

Two patterns, applied to all 22 tables (`event_confirming_sources`, added in
`0008`, follows the same reference-table shape as the 21 from `0007`):
reference/intelligence tables are
`SELECT`-only for the `authenticated` role (not `anon` — "not another news
website," per the README); user-owned tables (`watchlists`, `bookmarks`,
`notifications`, `alerts`) get full CRUD scoped to `auth.uid() = user_id`.
Writes to reference tables only ever happen via the Worker's `service_role`
key, which bypasses RLS by Supabase design and never reaches the frontend.
