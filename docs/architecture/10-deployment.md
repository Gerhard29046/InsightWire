# 10 · Deployment

**Status: nothing backend-related is deployed.** Every phase of the
backend (connectors, Connector Manager, Cloudflare Queue pipeline,
intelligence layer) has been built and verified entirely through local
tooling — `npm test` and `wrangler dev`'s local `workerd`/Miniflare
simulation. No `wrangler login`, no `wrangler deploy`, ever, in this
project's history so far. This has been an explicit, repeated user
instruction across every phase, not an oversight.

## What *is* configured for deployment

The **frontend only**, per the root [`README.md`](../../README.md):
Cloudflare Pages, connected to `main` on the GitHub repo, build command
`npm run build`, output directory `dist`. Whether that connection has ever
actually been exercised (a real push triggering a real Pages build) isn't
tracked here — check the Cloudflare dashboard directly, this document
can't see live account state.

## What deploying the backend for real would require, in order

1. **A live Supabase connection** ([06-supabase.md](06-supabase.md)) — the
   backend currently has nowhere durable to write, so deploying it before
   this exists would just run `InMemoryRepository` in production, silently
   losing everything on every cold start.
2. **`wrangler login`** — a real account action, run by the user
   themselves (`! wrangler login`), not something to trigger unprompted.
3. **`wrangler queues create insightwire-raw-events` and
   `insightwire-raw-events-dlq`** — the queues wrangler.toml already
   references declaratively; they don't exist until created against a real
   account.
4. **Worker secrets** (`wrangler secret put ANTHROPIC_API_KEY`, once a real
   AI provider is wanted — see [03-ai-pipeline.md](03-ai-pipeline.md)) and
   the Supabase service-role key/connection string, however that
   repository implementation ends up authenticating.
5. **`wrangler deploy`** — the actual deploy. First time this pipeline runs
   against real Cloudflare infrastructure instead of local simulation;
   worth treating that gap seriously (see the risks below) rather than
   assuming local verification transfers perfectly.

## Local-verification-vs-production gaps worth re-checking at that point

- `wrangler dev`'s local Queue simulation doesn't support consumer
  concurrency — a real deployment might behave differently under
  concurrent batches.
- `Queue.metrics().backlogCount`, used for the `queueDepth` log field
  ([05-cloudflare.md](05-cloudflare.md)), has only been observed locally;
  worth confirming it reports the same way against the real hosted
  service.
- Real network conditions (actual latency, actual rate limits from NASA/
  WHO/UN/GDACS/NWS under sustained production polling, not one-off manual
  checks) haven't been exercised.
- The 5-minute Cron tick and each connector's `refreshIntervalMs` are
  both still first-guess values, chosen before any real production
  traffic existed to tune them against.
