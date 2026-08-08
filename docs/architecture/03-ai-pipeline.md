# 03 · AI Pipeline & Intelligence Layer

Everything in this file lives under
[`worker/src/pipeline/`](../../worker/src/pipeline). This is the part of
the system that turns a raw fetched item into a scored, deduplicated,
connected `NormalizedEvent`.

## Per-message flow (`processMessage`)

[`processMessage.ts`](../../worker/src/pipeline/processMessage.ts) is the
**only** place `connector.normalize()`/`.validate()` run in the async
pipeline — a connector has no other path to producing a stored event.

```
normalize → validate → trust lookup → dedupe
  ├─ unchanged        → stop, no write
  ├─ duplicate        → merge into the existing event (see Merge Engine)
  └─ new / updated    → AI enrich → entity graph → priority score → persist
```

## Duplicate Detection (`dedupe.ts`)

Two layers: the deterministic `NormalizedEvent.id`
(`${connectorId}:${externalId}`) catches the same source re-sending the
same item; a SHA-256 hash of normalized `title+description` catches the
same real-world event arriving under a *different* id (a second source
covering the same story, or a feed reissuing an item with a new guid).
Four outcomes: `new`, `unchanged` (no write), `updated` (same id, real
change — see Timeline Engine), `duplicate` (different id, same content —
see Merge Engine, below).

## Event Merge Engine (`mergeEngine.ts`)

"If multiple connectors report the same event, don't create duplicate
events" — a content-hash duplicate no longer gets rejected; it gets
merged into the existing event:

- **Sources**: `confirmingSources` (every connector that reported this
  event) unioned, deduped by connector id.
- **Evidence**: `tags`/`keywords` unioned.
- **Confidence**: `min(1, max(existing, incoming) + 0.15 × newSourceCount)`
  — a genuinely new confirming source raises confidence; the same
  connector re-confirming does not (verified against a real NWS
  re-issued alert).
- **Importance**: the higher of the two, never lowered.

The merged event is upserted under the **existing** id — the incoming
event's own id is never separately stored.

## Timeline Engine (`timeline.ts`)

"Append, never overwrite." A thin module both the update-diff path
(`dedupe.ts`'s `updated` outcome) and the merge path go through to record
`EventUpdate`s (`{at, label}`) — e.g. "Status changed from developing to
resolved" or "Confirmed by additional source: gdacs-alerts (now 2
confirming sources)". `getTimeline()` reads them back chronologically —
this is what would back a "how did this story evolve" view for
journalists.

## Source Trust Engine (`trust.ts`)

Trust describes the *source*, not any single event — a separate registry,
not a field renegotiated per event. Seven categories
(`official`/`government`/`company`/`ngo`/`university`/`rss`/`community`)
each carry a default trust score (0.95 down to 0.40); an explicit
per-connector override always wins. `NormalizedEvent.sourceTrustScore` is a
denormalized snapshot, kept deliberately separate from `importance`.

## Event Priority Engine (`priority.ts`)

A real, deterministic weighted-sum formula (not AI-generated) producing a
0-100 score:

| Input | Weight |
|---|---|
| Source trust | 0.20 |
| Confirming sources | 0.15 |
| Freshness (24h linear decay) | 0.15 |
| AI confidence | 0.10 |
| Geographic impact | 0.10 |
| Political impact | 0.10 |
| Economic impact | 0.10 |
| Disaster severity (weather only) | 0.05 |
| Category weighting | 0.05 |

Geographic/political/economic impact fall back to a per-category default
table when no AI provider supplies real per-event scores (today — see
below). Verified live: real events score across a genuine spread (roughly
32-66 observed), not a flat number. This is what the frontend will
eventually sort the feed by, instead of publication time.

## Entity Graph (`entityGraph.ts`)

Eight entity types (`person`/`organization`/`country`/`city`/`company`/
`government_body`/`event`/`topic`), deduped by normalized name, connected
by typed relationships (`occurred_in`, `tagged_with`, `mentions`, ...) —
deliberately separate storage from `Repository`. **Only 3 of 8 types have
real data today**: `country`/`city` (from the event itself) and `topic`
(from feed-provided tags). `person`/`organization`/`company`/
`government_body` wait on real AI entity extraction. Narrower than the
Postgres schema in [04-database.md](04-database.md), which has no generic
entity/relationship table yet.

## AI Enrichment (`ai/`)

`AiProvider.enrich()` returns one consolidated result (summary, keywords,
entities, suggested category, importance, confidence) — matching how this
would actually be prompted against a real LLM, not eight separate calls.

- **`NullAiProvider`** — the active default. Returns nothing fabricated;
  every event today gets this.
- **`ClaudeAiProvider`** — a real implementation (direct `fetch()` to
  Anthropic's Messages API, tool-call schema) that has never actually been
  called in this environment — tested against a mocked `fetch` only.
  Selected automatically once `ANTHROPIC_API_KEY` is set (see
  [`selectAiProvider`](../../worker/src/pipeline/ai/enrichmentPipeline.ts)).

`enrichEvent()` never touches raw fields (title/description/source) — only
AI-derived fields are conditionally updated, and a real summary always also
produces a separate, append-only `ai_summaries`-shaped record.

## Persistence seam (`repository.ts`)

`Repository` is named after the Postgres tables in
[04-database.md](04-database.md) — `InMemoryRepository` is the only
implementation today (resets on Worker restart). This is the seam a real
Supabase-backed implementation slots into without changing
`processMessage`'s orchestration — see [06-supabase.md](06-supabase.md).
