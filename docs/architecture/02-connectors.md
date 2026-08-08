# 02 · Connectors

## The contract

Every data source implements `SourceConnector`
([`worker/src/connectors/types.ts`](../../worker/src/connectors/types.ts)):

```ts
interface SourceConnector {
  id, name, description, type, enabled, version, refreshIntervalMs
  supportedCountries: string[]
  supportedCategories: CategoryId[]
  rateLimit?: { requestsPerMinute: number }

  healthCheck(): Promise<ConnectorHealthStatus>
  fetch(): Promise<RawEvent[]>
  normalize(raw: RawEvent): NormalizedEvent
  validate(event: NormalizedEvent): ValidationResult
}
```

No connector is hardcoded into anything that runs it — `ConnectorRegistry`
(register/lookup only) and `ConnectorManager` (scheduling/retries/health)
both operate purely against this interface.

## The shared base class

[`RssConnector`](../../worker/src/connectors/base/RssConnector.ts)
implements `fetch()`/`healthCheck()` once for **both** RSS 2.0
(`<rss><channel><item>`) and Atom+CAP (`<feed><entry>`) feeds — adding NWS
(a different wire format entirely) only required extending the shared
parser, not writing a new base class. It also sends a `User-Agent` header
on every request (`InsightWire/1.0 (...)`) — added after NOAA's live API
returned HTTP 403 without one; some official APIs require this and reject
anonymous requests.

## The 5 live connectors

| Connector | Source | Format | Category | Refresh | Notes |
|---|---|---|---|---|---|
| `nasa-news` | nasa.gov RSS | RSS 2.0 | science | 1h | |
| `who-news` | who.int RSS | RSS 2.0 | government | 1h | No `health` category exists yet |
| `un-news` | news.un.org RSS | RSS 2.0 | government | 1h | |
| `gdacs-alerts` | gdacs.org RSS | RSS 2.0 | weather | 15m | Extracts real `lat`/`lng`; feed's own `<copyright>` says "public domain" |
| `nws-alerts` | api.weather.gov | **Atom+CAP** | weather | 15m | Uses CAP's own `severity`/`certainty` fields directly (see 03); rejects `Test`/keepalive entries in `normalize()` |

All 5 are verified against their **live** endpoints, not just fixtures —
most recently: NASA 10/10, WHO 25/25, UN 30/30, GDACS 313/313, NWS 239/240
valid (1 keepalive correctly rejected).

## Adding a connector

1. Extend `RssConnector` if the source is RSS or Atom (most official
   sources are); implement `SourceConnector` directly otherwise.
2. Implement `normalize()`/`validate()` — map the source's fields onto
   `NormalizedEvent` ([`packages/shared`](../../packages/shared)), leave
   AI-derived fields (`summary`, real `importance`/`confidence`, entities)
   unset — the pipeline fills those in later, not the connector.
3. Register it in `createDefaultRegistry()`
   ([`worker/src/index.ts`](../../worker/src/index.ts)).
4. Add a source trust profile in `createDefaultTrustRegistry()`
   ([`worker/src/pipeline/trust.ts`](../../worker/src/pipeline/trust.ts)) —
   see [03-ai-pipeline.md](03-ai-pipeline.md).
5. Record a fixture (`__fixtures__/*.xml`, trimmed to a few real items) and
   write parse/normalize/validate tests — never invent fixture content;
   record it from a real response.

**Engineering rule, not a suggestion**: only official APIs, RSS feeds, or
sources that explicitly permit automated access. Every connector added so
far was checked live against its real endpoint and its access policy
before being coded — not assumed from memory.

## Connector Manager

[`ConnectorManager`](../../worker/src/manager/ConnectorManager.ts) —
loading (via the registry), scheduling (`runDue`/`collectDue`), retries
(exponential backoff), concurrency limits, health-gating, structured
logging, and per-connector metrics. It never knows connector-specific
logic — everything it does is against the `SourceConnector` interface.

Two entry points, both still live:

- `runConnector`/`runAll`/`runDue` — the original synchronous path (fetch →
  normalize → validate, all in one call). Still used for local/admin
  "run now and see the result" scenarios.
- `collectDue(publish)` — the async pipeline's entrypoint (Phase 3+):
  health-gates and retries the fetch, then calls `publish()` per raw event
  instead of normalizing — see [05-cloudflare.md](05-cloudflare.md) for
  what calls this.
