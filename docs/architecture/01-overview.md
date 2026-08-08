# 01 · Overview

## What InsightWire is

An AI-powered newsroom intelligence platform — not a news website.
Crawlers/connectors gather information from trusted public sources, a
backend pipeline scores and enriches it, and a dashboard surfaces it via
feeds, timelines, calendars, maps, and alerts. See the root
[`README.md`](../../README.md) for the full vision statement.

## How this document set relates to `docs/decisions/`

Two documentation tracks, deliberately different jobs:

- **`docs/decisions/*.md`** (ADRs) — chronological. Each records *why* a
  decision was made at a point in time, including the reasoning, the
  alternatives considered, and the risks accepted. Never rewritten after
  the fact.
- **`docs/architecture/*.md`** (this folder) — a living reference. Each
  file describes *how the system works right now*, updated as the system
  changes. When the two disagree, the architecture docs are current and
  the ADR explains how it got that way.

## Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, Framer Motion — see
  [`src/`](../../src).
- **Backend**: Cloudflare Workers, Queues, Cron Triggers — see
  [`worker/`](../../worker) and [05-cloudflare.md](05-cloudflare.md).
- **Database**: Supabase Postgres (schema authored, not yet connected) —
  see [04-database.md](04-database.md) and [06-supabase.md](06-supabase.md).
- **AI**: Anthropic Claude (architecture built, not yet active — no API key
  configured) — see [03-ai-pipeline.md](03-ai-pipeline.md).
- **Shared types**: [`packages/shared/`](../../packages/shared) — the
  `NormalizedEvent` contract both the frontend and the worker import from.

## What's actually built vs. planned

| Layer | Status |
|---|---|
| Frontend shell (Dashboard, Feed, Alerts, Calendar) | Built, backend-shaped, no live data yet |
| Connector framework (5 live connectors) | Built, tested, verified against live feeds |
| Connector Manager (scheduling, retries, health) | Built, tested |
| Cloudflare Cron + Queue pipeline | Built, tested locally (`wrangler dev`) — **not deployed** |
| Normalization, dedup, merge, timeline, entity graph, trust, priority | Built, tested, verified end-to-end locally |
| AI enrichment | Architecture built; `NullAiProvider` active (no API key configured) |
| Database schema | Authored (`supabase/migrations/`) — **not applied to any database** |
| REST API | Not started (explicitly deferred — see [07-api.md](07-api.md)) |
| Auth | Not started |
| Deployment | Nothing deployed except the frontend's Cloudflare Pages config |

## Phase map (chronological, matches `docs/decisions/`)

1. Source Connector Framework — ADR 0002
2. Connector Manager — ADR 0002
3. Cloudflare Scheduling (Cron) — ADR 0003
4. Normalization schema — ADR 0002 (`NormalizedEvent`)
5. AI enrichment pipeline (architecture) — ADR 0005
6. Database schema — ADR 0004
6.5. Intelligence Engine (collect → queue → normalize → dedupe → enrich → persist) — ADR 0005
6.6. Intelligence & Quality (trust, priority, entity graph, merge engine, timeline, metrics) — ADR 0006
7-10. REST API, admin, realtime, future features — not started

## Where to look next

- Building/changing a connector → [02-connectors.md](02-connectors.md)
- Understanding scoring, merging, or the entity graph → [03-ai-pipeline.md](03-ai-pipeline.md)
- The Postgres schema → [04-database.md](04-database.md)
- The Worker/Queue setup → [05-cloudflare.md](05-cloudflare.md)
- Connecting Supabase for real → [06-supabase.md](06-supabase.md)
- What the REST API will look like → [07-api.md](07-api.md)
- The dev-tooling agent harness (not part of the product) → [08-agents.md](08-agents.md)
- Current security posture → [09-security.md](09-security.md)
- What deploying would actually involve → [10-deployment.md](10-deployment.md)
