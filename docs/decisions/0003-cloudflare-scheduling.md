# ADR 0003: Cloudflare Scheduling (Cron-only, no Queues yet)

**Status:** Accepted (implemented; nothing deployed to a live Cloudflare account)
**Date:** 2026-08-07

## Context

Phase 1 (connector framework) and Phase 2 (Connector Manager — retries,
health-gating, metrics, the `runDue()` scheduling policy) are done, fully
local and tested. Phase 3 of the backend roadmap (see ADR 0002) is where the
master architecture prompt calls for real Cloudflare infrastructure: Cron
Triggers, Queues, and Workers that fetch/normalize/store.

Two decisions were confirmed with the user before writing any code:

1. **Cron-only, no Queues.** Cloudflare Queues require a Workers Paid plan;
   Cron Triggers work on the free tier. With only 2 connectors and no
   database yet (Phase 6 — nothing to actually store results in), there's
   nothing today that needs queue-based decoupling. A Cron Trigger calling
   `ConnectorManager.runDue()` directly inside the Worker is honest about
   current scale. Queues get added in a later phase once real volume or
   Phase 6's database justifies the cost and complexity.
2. **Build and test locally only — no live deploy.** This phase produces
   `wrangler.toml` and the Worker entrypoint, verified via `wrangler dev
   --test-scheduled` against the real NASA/WHO feeds and unit tests with
   mocked dependencies. Nothing was deployed to the user's real Cloudflare
   account — no `wrangler login`, no `wrangler deploy`, no resources
   created. Per ADR 0001, Cloudflare was deliberately deferred until the
   user is ready to connect it; this phase respects that gate. Real
   deployment is an explicit future decision, not implied by this phase
   being "done."

## Decisions

### `worker/wrangler.toml`

Minimal, free-tier config: `name`, `main = "src/worker.ts"`,
`compatibility_date`, and `[triggers] crons = ["*/5 * * * *"]`. No
`[[queues.producers]]`/`[[queues.consumers]]`, no environment/secrets blocks
— nothing in this phase needs API keys or a database connection string. The
5-minute tick and each connector's own `refreshIntervalMs` (1 hour, set in
Phase 2) are independent by design: the Cron Trigger just asks "what's due?"
every 5 minutes, and `runDue()` decides.

### `worker/src/worker.ts`

A standard Workers module-syntax export with `fetch()` (a trivial health
response — Workers require this handler to exist even when the real job is
Cron-triggered) and `scheduled()`, which calls
`createDefaultManager().runDue(new Date(controller.scheduledTime))` and logs
a JSON summary. This is the only new orchestration-adjacent code in this
phase — it reuses `ConnectorManager`/`createDefaultManager` from Phase 2
verbatim rather than reimplementing anything.

No persistence: results are logged (via `ConnectorManager`'s own structured
logger, plus a one-line summary in `scheduled()`), not stored anywhere.
Phase 6 (Supabase) is what gives this pipeline a real destination — this is
a known, accepted gap for this phase, not an oversight.

### Runtime-type target switched from Node to Workers

Phase 1's ADR flagged that `worker/tsconfig.json` targeted Node types
(`"types": ["node"]`) since nothing was deployed yet, and that Phase 3 would
need to reassess. Now that `worker.ts` is a real Workers entrypoint,
`@cloudflare/workers-types` was added and `tsconfig.json`'s `"types"` became
`["@cloudflare/workers-types", "node"]` — both, not a swap. `@cloudflare/
workers-types`' `.d.ts` has no top-level exports (a fully ambient global
script, like `@types/node`), so `ScheduledController`, `ExecutionContext`,
`ExportedHandler`, `Response`, etc. are available as globals with no import,
matching real Workers code. `node` stayed in the list because the *test*
files (`nasa.test.ts`, `who.test.ts`) import `node:fs`/`node:path`/`node:url`
to read fixture files, and use `import.meta.url` — verified empirically that
the two type packages coexist in this TypeScript version without global
declaration conflicts (no errors from `tsc --noEmit` with both included).

### Testing without touching the real account

Two layers, both exercised:
- **Unit tests** (`worker/src/worker.test.ts`): `vi.mock('./index', ...)`
  replaces `createDefaultManager` with one built from the Phase 2
  `FakeConnector` test double, so `scheduled()`'s logic (that it calls the
  manager, logs a parseable summary) is verified without any network call.
- **Local integration check**: `npx wrangler dev --test-scheduled` runs the
  Worker in the real `workerd` runtime (not Node/Vitest) locally, with no
  account login required for a Worker with zero external bindings. Hitting
  `GET /` confirmed the health response; hitting `GET /__scheduled?cron=...`
  triggered the real `scheduled()` handler, which ran the real
  `ConnectorManager` against the live NASA (10 items) and WHO (25 items)
  feeds and logged a correct `scheduled.tick.complete` summary — proof the
  entrypoint works in the actual Workers runtime, not just under Node.

## Risks & assumptions

- **No persistence** until Phase 6 — results vanish at the end of each
  Worker invocation. Acceptable now, called out so it isn't mistaken for an
  oversight later.
- **5-minute Cron tick is a starting guess**, trivially changed in
  `wrangler.toml` once this is actually deployed and real behavior can be
  observed.
- **Nothing is deployed.** `wrangler.toml`/`worker.ts` look deploy-ready but
  have never been applied to a real Cloudflare account. First real deploy
  (`wrangler login` + `wrangler deploy`) is its own future decision.
- **No Queues** means the fetch/normalize/validate work for both connectors
  runs synchronously inside one Worker invocation. Fine at 2 connectors;
  revisit if/when the connector count or per-connector payload size grows
  enough that a single Cron-triggered invocation risks Workers' CPU-time
  limits — that's the trigger for adding Queues, not a fixed phase number.

## Consequences

- `worker/` now has a real, testable Cloudflare Workers entrypoint alongside
  the pure-TypeScript connector/manager code from Phases 1-2.
- `npm install` pulls in `wrangler` and `@cloudflare/workers-types` as dev
  dependencies (required approving `esbuild`'s and `workerd`'s install
  scripts, per this environment's script-allowlisting — both are wrangler's
  own well-known dependencies).
- The path to a real deployment is now just `wrangler login` +
  `wrangler deploy`, whenever the user decides to take that step — this ADR
  does not authorize that on its own.
