# ADR 0002: Backend Intelligence Engine Architecture

**Status:** Accepted (Phase 1 implemented; Phases 2-10 planned, not yet built)
**Date:** 2026-08-07

## Context

The frontend (Dashboard, Global Events Feed, Alerts, Calendar) is built. The
Events Feed deliberately contains zero mock data — it calls a backend API
that, until this ADR, didn't exist, and correctly shows a "backend not
connected" state (see `src/lib/api/client.ts`'s `ApiNotConfiguredError`).

InsightWire's backend is the system that discovers events from public sources
before they become mainstream news, normalizes them, enriches them with AI,
and serves them to the frontend. This ADR records the overall 10-phase
architecture and the concrete decisions made while building Phase 1.

Work proceeds one phase at a time, each with its own review, per the working
method agreed for this project: design and get approval before writing code,
implement one phase, summarize how it integrates, then stop for confirmation
before starting the next.

## Full roadmap (for context — most of this is not yet built)

1. **Source Connector Framework** — ✅ implemented (this ADR). One connector
   per data source, behind a common interface.
2. **Connector Manager** — registers/runs/retries/schedules/monitors
   connectors. Not yet built.
3. **Cloudflare scheduling** — Cron triggers fetch, Queues process, Workers
   normalize and store. Not yet built; requires a live Cloudflare account
   (deliberately not connected yet — see ADR 0001).
4. **Normalization schema** — ✅ implemented as part of Phase 1
   (`@insightwire/shared`'s `NormalizedEvent`), since connectors need
   something to normalize into.
5. **AI enrichment pipeline** (language detection, translation, entity
   extraction, summarization, importance/confidence scoring, dedup, topic
   classification, relationship detection, embeddings, timeline detection).
   Not yet built; requires AI provider credentials (Claude/OpenAI/Gemini).
6. **Database schema** (Supabase Postgres, RLS, pgvector). Not yet built;
   requires a connected Supabase project (see ADR 0001 — identified, no
   access token yet).
7. **REST API** (OpenAPI-documented). Not yet built.
8. **Admin/observability dashboard**. Not yet built.
9. **Realtime** (Supabase Realtime pushing to Feed/Timeline/Calendar/Map/
   Bookmarks/Watchlists). Not yet built.
10. **Future features** (AI story angles, interview questions, headline/
    newsletter/podcast/video generation, watchlists, geographic alert zones,
    semantic search, knowledge graph, cross-event relationships,
    multi-language support) — architecture in phases 1-9 is meant to leave
    room for these without a rewrite, but none are built yet.

## Decisions made in Phase 1

### Repo layout: npm workspaces, frontend untouched

Added `worker/` and `packages/shared/` as new npm workspaces
(`package.json`'s `"workspaces"` field). The existing frontend at `src/` and
its Cloudflare Pages build config are unchanged — lowest-risk way to add a
backend without disturbing a working deploy pipeline.

```
InsightWire/
├─ src/                  # frontend — unchanged
├─ packages/shared/       # NormalizedEvent contract + taxonomy, shared by both
└─ worker/                # Cloudflare Worker backend (connector framework so far)
```

### Why Phase 1 needed no cloud credentials

No `wrangler.toml`, `supabase/` config, `.env`, or Cloudflare/Supabase MCP
connection exist in this environment (confirmed via `npx wrangler --version`
/ `npx supabase --version` needing on-the-fly install, and `claude mcp list`
showing only `figma` and `claude-flow`). Per ADR 0001, Supabase is identified
but has no access token, and Cloudflare was deliberately deferred to avoid
auto-provisioning.

Phase 1 is pure TypeScript — connector interfaces, two concrete RSS
connectors, Zod validation — runnable and testable with `npm test`, no live
Worker deployment, no database writes, no AI provider keys. Phases 3, 5, and 6
each need one of those and will be their own explicit go/no-go before
touching any real account.

### The event contract lives in `@insightwire/shared`, once

`NormalizedEvent` (and the `CategoryId`/`Severity`/`VerificationStatus`/
`EventStatusId` vocabulary it's built from) is defined once, as a Zod schema,
in `packages/shared/src/normalizedEvent.ts` and `taxonomy.ts`. Both the
worker's `validate()` step and the frontend import it — the frontend's
`src/lib/api/types.ts` re-exports it instead of declaring its own copy, and
`src/lib/categories.ts` / `src/lib/severity.ts` re-export the taxonomy types
while keeping their icon/color presentation metadata local (that's a frontend
concern the backend has no reason to know about).

Field naming is camelCase (TypeScript/JSON convention) rather than the
snake_case used in the original Phase 4 field list, which reads as Postgres
column naming. Phase 6 owns the actual DB schema and the snake_case↔camelCase
mapping at that boundary; this schema is the wire/application-level shape.

`description` (raw source text) and `summary` (AI-generated, Phase 5) are
separate fields — `summary` stays absent until the AI pipeline runs, per
"never overwrite original source information." Likewise `importance`
('medium') and `confidence` (0.4) are connector-seeded, clearly-conservative
placeholders, not real scores — Phase 5 replaces them. They're required
fields (not optional) so every consumer can rely on them being present, just
not yet authoritative.

`country` is `'Global'` for both Phase 1 connectors rather than a guess —
NASA and WHO stories don't reliably concern a single country (e.g. "WHO
Director-General visits Jordan"), and geolocating from article text is
explicitly a Phase 5 (entity extraction) job, not a connector's. Same
reasoning applies to `people`/`organizations`/`keywords`/`embeddings`: left
empty by connectors, populated later by AI enrichment.

### Connector framework

`worker/src/connectors/types.ts` defines `SourceConnector` per the requested
shape (`id`, `name`, `description`, `type`, `enabled`, `healthCheck()`,
`fetch()`, `normalize()`, `validate()`), typed against concrete `RawEvent`/
`NormalizedEvent`/`ConnectorHealthStatus` types instead of left abstract.

`worker/src/connectors/base/RssConnector.ts` implements `fetch()` and
`healthCheck()` once for any RSS/Atom source; concrete connectors supply only
a feed URL plus `normalize()`/`validate()`. This is the mechanism that keeps
RSS-shaped connectors (NASA, WHO today; UN News, many government press feeds,
plausibly some parliaments later) from duplicating fetch/parse logic. XML
parsing uses `fast-xml-parser` — no native bindings, works in a Workers V8
isolate (no DOM APIs required), with `htmlEntities: true` so numeric entities
in article bodies decode correctly.

`worker/src/connectors/registry.ts` (`ConnectorRegistry`) only registers and
looks connectors up. It deliberately does not schedule, retry, or collect
metrics — that's Phase 2 ("Connector Manager"). Keeping Phase 1's registry
dumb keeps this phase reviewable on its own and avoids building Phase 2
prematurely.

### First two connectors: NASA + WHO

Both are open RSS feeds with no auth and explicit public-access policies —
lowest legal/technical risk pair to prove the framework end-to-end (Reuters
was explicitly avoided per its licensing ambiguity; parliament calendars were
deferred since they typically need bespoke parsing per legislature rather
than fitting the RSS base class).

- **NASA** (`nasa-news`): `https://www.nasa.gov/news-release/feed/` → category
  `science`.
- **WHO** (`who-news`): `https://www.who.int/rss-feeds/news-english.xml` →
  category `government` (closest fit — the existing 8-category taxonomy has
  no `health` bucket; flagged below as a gap, not solved here).

Both were verified against their live feeds during implementation (fetched,
normalized, and schema-validated successfully), in addition to the automated
fixture-based test suite.

### Testing: fixture-based, no live network in CI

`worker` uses `vitest`. Each connector has a recorded fixture
(`src/connectors/sources/__fixtures__/{nasa,who}.xml`, trimmed to 3 items) so
`fetch()`'s parsing logic is tested deterministically without hitting NASA's
or WHO's servers on every CI run — immune to upstream flakiness and
respectful of their infrastructure. `parseRssItems()` is exported as a
standalone function (not a class method) specifically so tests can run
fixture XML through the exact same path `fetch()` uses.

## Risks & assumptions carried forward (not all solved yet)

- **Licensing/ToS**: only official, explicitly-open RSS/API sources are in
  scope. Each future connector needs its own ToS check before being added —
  a per-source gate, not a one-time decision.
- **Schema drift**: RSS feeds change shape without notice. `validate()` +
  fixture tests catch this in CI; Phase 8 (admin monitoring) needs to surface
  validation failures in production rather than failing silently.
- **Cloudflare Worker constraints** (relevant from Phase 3 on): CPU-time
  limits mean heavy parsing/AI work belongs in Queue consumers, not the
  Cron-triggered fetch step; Queue messages cap at 128KB, so large raw
  payloads (e.g. full article HTML in `content:encoded`) will need to go to
  storage with only a reference on the queue.
- **Cost** (Phase 5+): AI enrichment at scale is the largest recurring cost;
  dedup needs to happen before the AI pipeline runs, not after.
- **Category taxonomy gap**: no `health` category exists yet. WHO uses
  `government` as a stopgap; revisit when more health-adjacent sources are
  added.
- **`worker`'s tsconfig currently targets Node** (`"types": ["node"]`) since
  Phase 1 only runs under Vitest/Node, not deployed. Phase 3 will need to
  reassess this against `@cloudflare/workers-types` once real deployment
  starts — Node and Workers globals aren't identical.
- **Assumption**: "millions of events, thousands of sources" is the long-term
  design target shaping today's choices (typed contracts, async-shaped
  interfaces, no hidden coupling), not a Phase 1 load-testing requirement.

## Consequences

- `npm install` now installs three workspaces (root frontend, `worker`,
  `packages/shared`); the frontend's build/deploy is otherwise unaffected.
- The frontend and worker share one definition of `NormalizedEvent` and its
  taxonomy — a future field change happens in one place.
- Two real, working connectors exist and are unit-tested, proving the
  `SourceConnector` interface and `RssConnector` base class end-to-end. No
  data flows to the frontend yet — that requires Phase 2 (scheduling) through
  Phase 7 (API) before the Events Feed's "backend not connected" state goes
  away.
