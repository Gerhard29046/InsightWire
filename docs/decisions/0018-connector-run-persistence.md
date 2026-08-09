# ADR 0018: Persist Connector Run History

**Status:** Accepted (implemented, unit-tested, live-verified)
**Date:** 2026-08-09

## Context

A background architecture audit (prompted by "are ingestion errors being swallowed, which feeds are stale/failing?") found that `connector_runs` — the table Phase 6 explicitly designed to answer exactly that question, per its own migration comment ("what would back a Postgres MetricsStore implementation later") — had **zero rows and zero write paths anywhere in the codebase**. Every connector run's success/failure/item-count history lived only in `InMemoryMetricsStore`, which resets on every Worker restart. There was no way to answer "which feeds are stale or failing" after the fact — only "what happened since the last cold start."

## Decision

Add `recordConnectorRun()` (`worker/src/manager/supabaseConnectorRuns.ts`), a plain async function (not a `MetricsStore` implementation), called from `worker.ts`'s `scheduled()` handler once per connector immediately after `collectDue()` returns — the one place that already has both a real `env` and the ability to genuinely `await`.

**Deliberately not folded into `MetricsStore`**: `MetricsStore.record()` is synchronous by contract — `ConnectorManager.getDueConnectorIds()` calls `metrics.getSnapshot()` synchronously in a hot path run once per connector per tick, and a real Postgres write cannot honestly satisfy a synchronous interface. Making `record()` async would mean threading `await` through every scheduling decision in `ConnectorManager` — a much larger, riskier change than "persist a run history" requires, and out of proportion to what was asked. The existing in-memory due-tracking is untouched; this is a purely additive audit trail alongside it.

Each `CollectionResult` (from `collectDue`, the async/queue-based collection path — not `ConnectorRunResult`, which only exists on the synchronous `runConnector`/`runAll`/`runDue` paths nothing in production actually calls) maps honestly onto `connector_runs`' columns: `items_normalized`/`items_valid`/`items_invalid` are always `0`, because normalize/validate genuinely haven't run yet at collection time (that happens downstream, in the queue consumer) — the same honesty already documented at `ConnectorManager.collectOne`'s existing in-memory `metrics.record()` call.

Persistence failures are isolated per-connector (`Promise.all` over individually-caught inserts) and only logged, never thrown — one connector's insert failing (or Supabase not being configured at all, e.g. local dev without credentials) must never mask or abort the real collection results already gathered that tick.

## Verification performed

- `npx vitest run` (worker): 521 tests pass, including 3 new tests for `recordConnectorRun` (successful insert with honest zero-fields, failed-collection mapping with the real error message, and insert-failure error propagation).
- `npx tsc --noEmit`: clean.
- **Live**: triggered the real scheduled handler against the real linked Supabase project (`wrangler dev` + `/cdn-cgi/local/scheduled`) and confirmed via direct query that all 17 enabled connectors now have a real `connector_runs` row with accurate `status`/`items_fetched`/`duration_ms`/`attempts`, matching the same run's own structured log output exactly (e.g. `gdacs-alerts`: 320 items fetched in both the log and the persisted row).

## Consequences

- "Which feeds are stale or failing" is now a real SQL query (`select source_id, status, started_at from connector_runs order by started_at desc`), not a question only answerable while the current Worker isolate happens to still be warm.
- The in-memory `MetricsStore`/`getDueConnectorIds` scheduling logic is unchanged and still resets on restart — a genuinely separate concern (moment-to-moment scheduling cadence) from persisted history (audit trail), not conflated by this change.
- A future phase could build a real "connector health" admin view directly off this table now that it has real data.
