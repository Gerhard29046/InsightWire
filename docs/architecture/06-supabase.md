# 06 · Supabase

**Status: connected and live-verified, as of Phase 7.** The project
(`https://loelneyenvxcuyoluksd.supabase.co`, per
[ADR 0001](../decisions/0001-mcp-server-setup.md)) now has all 9 migrations
applied (via the SQL Editor — `supabase link`/`db push` hit a CLI bug, see
[ADR 0007](../decisions/0007-supabase-repository.md)) and holds real data: a
local `wrangler dev --test-scheduled` run against 5 live connectors wrote
413 `raw_events` and 411 `normalized_events` rows, with zero duplicates and
a verified idempotency probe. Nothing was deployed to Cloudflare; the
frontend is still unconnected — both explicitly out of scope this phase.

## Why the interface swap was safe to do without live credentials

`Repository` (`worker/src/pipeline/repository.ts`) is named after the real
Postgres tables in [04-database.md](04-database.md) specifically so a
Supabase-backed implementation is a **swap, not a rewrite** —
`processMessage`'s orchestration logic doesn't change. `SupabaseRepository`
(`worker/src/pipeline/supabaseRepository.ts`) could therefore be written,
typechecked, and unit-tested (mocked `@supabase/supabase-js` client, same
technique as `ClaudeAiProvider`'s tests) entirely before any real database
connection exists — only the final live-verification step actually needs
one.

## Connecting it for real — the steps, and who does which

1. **The user runs `supabase login`** (browser OAuth) — not something typed
   into a chat session, a real account action.
2. **The user (or the assistant, once logged in) runs
   `supabase link --project-ref loelneyenvxcuyoluksd` then
   `supabase db push`** from `supabase/` — applies all 9 authored migrations
   (`0000` through `0008`) for the first time. This is the first real test
   that they apply cleanly against actual Postgres; previously only
   syntax-validated (`libpg-query`) and structurally reviewed.
3. ~~A migration adding the Phase 6.6 fields~~ — done: migration `0008`
   (`sourceTrustScore`, `priorityScore`, `tags`, `confirmingSources`), plus
   the schema gaps that migration also fixes (missing `sources` rows for 3
   of 5 connectors, idempotency constraints) — see ADR 0007.
4. ~~A `SupabaseRepository implements Repository`~~ — done
   (`worker/src/pipeline/supabaseRepository.ts`).
5. **Swap `InMemoryRepository` for it** — done, but conditionally:
   `worker/src/worker.ts`'s `selectRepository(env)` picks `SupabaseRepository`
   only when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are both set (the
   same "not configured -> honest default" pattern as `selectAiProvider`),
   so local `wrangler dev` without credentials is unaffected.
6. **The user creates `worker/.dev.vars`** (gitignored, and outside this
   session's file-read access by design — the values are never pasted into
   a chat transcript) with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   `wrangler dev` injects both into `env` automatically.
7. Decide what becomes of `InMemoryMetricsStore`/`InMemoryDuplicateIndex`/
   `InMemoryPipelineMetrics`/`InMemoryEntityGraphStore` — unchanged this
   phase, still each its own future decision (see ADR 0007's scope
   discussion — Phase 7 only replaces `Repository`).

All 7 steps are complete as of ADR 0007 — see that document for the full
verification results (row counts, the one real merge inspected directly in
Postgres, the idempotency probe, and a `.gitignore` gap this step found and
fixed before it could leak the service-role key).
