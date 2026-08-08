# ADR 0010: AI Journalist Brief (Gemini-backed)

**Status:** Accepted (implemented, unit-tested, and verified live end-to-end
— real Gemini API call, real persisted row, real browser render)
**Date:** 2026-08-08

## Context

Following Phase 8 (the Intelligence API), the user asked to build the "AI
button" described in the original Phase 8 request, and provided a detailed
29-section editorial ruleset ("INSIGHTWIRE AI — EDITORIAL INTELLIGENCE
RULES") specifying exactly how the model must behave: never fabricate,
classify every claim by evidence level, separate known from potential
impact, never let repetition pass as corroboration, and so on. The ruleset
said "update the Gemini AI provider" — no Gemini provider existed yet
(only `ClaudeAiProvider` and `NullAiProvider`, both scoped to the automatic
per-event ingestion pipeline). Two real decisions were confirmed with the
user before writing code: build a new `GeminiAiProvider`-family
implementation (not Claude), and the user would provide a real
`GEMINI_API_KEY` so this could be verified for real rather than left
mocked-only — consistent with this project's established rule (see ADR
0005's treatment of `ClaudeAiProvider`).

## Decisions

### A new, separate capability — not a bigger version of the automatic enrichment pipeline

`worker/src/pipeline/ai/journalistBrief.ts` defines `JournalistBrief`/
`JournalistBriefProvider`, deliberately independent from `AiProvider`/
`enrichEvent` (`pipeline/ai/types.ts`, `pipeline/ai/enrichmentPipeline.ts`),
which `processMessage` calls automatically for every ingested event. A
journalist brief is richer (19 structured fields vs. `AiEnrichmentResult`'s
8), user-triggered per event ("Summarize this event"), and must never run
automatically for hundreds of events per ingestion tick — a different
cost/trigger model, not a scaled-up version of the same thing. The
automatic ingestion-time pipeline is completely untouched by this phase,
per "do not rewrite working components unnecessarily."

### Verified against the real Gemini API before writing the provider

`gemini-2.5-flash` (assumed from training-time knowledge) returned a live
404 — "no longer available to new users." Listed the account's actually
available models via the real API rather than guessing again, and
confirmed `gemini-flash-latest` (currently resolving to `gemini-3.6-flash`)
works with `responseMimeType: application/json` + `responseSchema`
controlled generation before any provider code was written — matching this
project's "verify the live feed before coding it" rule applied to an API
integration instead of a data feed.

### The 29-section ruleset, condensed into a system instruction — every MUST/NEVER rule preserved, formatting boilerplate dropped

`geminiJournalistBriefProvider.ts`'s `SYSTEM_INSTRUCTION` keeps every
behavior-changing rule: never fabricate (with the specific fabrication
list), source-first attribution, the 6-level evidence classification
(confirmed/reported/claim/inference/unverified/unknown) and the rule that
none of the latter four may be silently promoted to confirmed, syndication
≠ independent corroboration, "report both sides, pick no winner" for
contradictions, hedged language for developing events, the 5-level story-
opportunity classification, investigative-question-only story angles, the
Africa/international coverage-priority instruction (not a hardcoded
importance boost — a bias-correction instruction: don't downgrade for lack
of international attention), political neutrality, conflict/military
caution, known-vs-potential impact separation, confidence-in-information
(not confidence-in-prose), never-invent-URLs, transparency about what the
model actually received, and no-clickbait. Section dividers and repeated
examples were not reproduced verbatim — the rule's substance was, and
`suggestedHeadline` was kept as its own field even though the ruleset's
§26 payload list omits it, because §27 (no clickbait) and the original
Phase 8 request both clearly assume a headline is being suggested.

### Structured output via Gemini's `responseSchema`, not a parsed free-text response

`BRIEF_RESPONSE_SCHEMA` mirrors `JournalistBrief` field-for-field (19
required fields) — Gemini's controlled generation enforces the shape
server-side, the same reasoning `ClaudeAiProvider`'s tool-call schema and
`SupabaseRepository`'s typed rows already use elsewhere in this codebase:
push structure enforcement as close to the source as possible rather than
hoping free text parses cleanly. `toBrief()` still defensively coerces
every field (arrays via `Array.isArray`, enums via allow-lists falling
back to a conservative default) — schema conformance from Gemini is
expected, not blindly trusted.

### Input is exactly what the ingestion system already collected — nothing else

`JournalistBriefInput` is `{ event, timeline, confirmingSources }` — the
same `NormalizedEvent`/timeline/confirming-sources the detail page already
reads via `Repository.getNormalizedEvent`/`getEventUpdates`. The prompt
explicitly instructs the model not to use outside knowledge about the
specific event and to write "Not available from the supplied sources"
for gaps, directly implementing rule 2 ("never fabricate... if information
is missing, say so"). No web search, no other tool access exists for this
provider to reach for something ungrounded.

### Persistence: a new, append-only table — not a repurposed `ai_summaries`

`journalist_briefs` (migration `20260808010000`) is separate from
`ai_summaries` (the automatic pipeline's per-event enrichment history) —
conflating "the automatic thing every event gets" with "the rich thing a
journalist explicitly asked for" would blur what each table means. One
JSONB column holds the whole structured brief (the shape is still
evolving and every field is read/written as a whole object, never queried
column-by-column — same reasoning `event_confirming_sources` vs. a jsonb
blob went the *other* way in ADR 0007, because that data *is* queried
per-column there). Append-only like `ai_summaries`/`embeddings`:
regenerating inserts a new row; "latest" is `order by generated_at desc
limit 1`.

### API shape: GET (cached) and POST (generate) — GET never costs an API call

`GET /events/:id/brief` returns the most recent cached brief (404 if none
exists) — free, no Gemini call. `POST /events/:id/brief` is the actual "AI
button": fetches the real event/timeline/sources via `Repository`, calls
Gemini, persists, returns it. The frontend (`useJournalistBrief`) checks
GET on page load (silently — the 404 for "no brief yet" is expected, not
an error state) and only calls POST on an explicit click. This keeps every
Gemini call attributable to a real user action, never a background poll.

### A real bug found and fixed by actually running this against a live Workers runtime

The first live call failed with `Illegal invocation: function called with
incorrect \`this\` reference`. Root cause: `this.fetchImpl = config.fetchImpl
?? fetch` followed by `this.fetchImpl(...)` detaches `fetch` from the
global scope Cloudflare Workers' runtime requires it to be called with —
this exact pattern already existed in `ClaudeAiProvider`, just never
triggered, because no `ANTHROPIC_API_KEY` had ever been configured in this
environment (ADR 0005: "never called against the real API here"). Fixed
in both providers by wrapping the default in a closure
(`(input, init) => fetch(input, init)`) instead of passing the bare
reference. This is exactly the kind of bug this project's "verify against
the real thing" discipline exists to catch — a unit test with a mocked
`fetchImpl` can never surface it, because the bug is specifically in how
the *real*, unmocked default behaves inside the *real* runtime.

## Verification performed

- `npm run test --workspace=worker`: **202 tests pass** (187 pre-existing +
  15 new across `geminiJournalistBriefProvider.test.ts` and
  `briefApi.test.ts`, plus 6 new router tests for the brief routes) —
  request shape, model override, response parsing, enum fallback on
  out-of-range values, HTTP/parse-error handling, and the "don't call the
  provider if the event doesn't exist" short-circuit, all against a mocked
  `fetchImpl`/Supabase client.
- `npx tsc --noEmit` (worker) and `npm run build` (root): clean.
- **Real, live, local verification**: `POST /events/:id/brief` against a
  real NWS severe thunderstorm event, hitting the real Gemini API. Output
  inspected directly: every entity/location named was present in the
  original CAP alert text (nothing invented), `confirmedFacts` correctly
  populated while `reportedClaims`/`unverifiedClaims`/`contradictions`
  were correctly empty (a single official-source event has nothing to
  report/dispute), `whyItMattersKnown` vs. `whyItMattersPotential`
  genuinely distinguished direct risk from speculative downstream effects,
  `sourceAssessment` correctly identified the NWS feed as an official
  government source, `confidence: very_high` with a stated reason. The
  brief persisted to `journalist_briefs` (confirmed via a direct
  service-role query) and the cached `GET` endpoint served it back
  correctly.
- **Real browser verification** (Playwright, headless Chromium against the
  running dev servers): navigated to a real event's detail page, clicked
  "Summarize this event," and confirmed the full `JournalistBriefPanel`
  rendered every section correctly with real content — zero console errors
  besides the expected 404 from the initial "no cached brief yet" check.
- Along the way, found and cleaned up a real operational issue unrelated
  to this feature's logic: roughly a dozen zombie `wrangler dev`/`vite`
  processes had accumulated across this session on ports 8787/8801-8803/
  5173-5183, because `TaskStop` on Windows does not kill the full
  `npx → node → workerd.exe` process tree, only the top-level wrapper.
  One of the stale instances (started before `GEMINI_API_KEY` existed) was
  answering requests instead of the current one, which is what actually
  caused the first "not configured" response. Killed by process tree, not
  by more retries — the retry would have "worked" against the wrong
  process and taught nothing.

## Risks & assumptions carried forward

- `gemini-flash-latest` is a moving alias — the specific underlying model
  (`gemini-3.6-flash` as of this writing) can change without this code
  changing. Acceptable (avoids repeating the `gemini-2.5-flash`
  deprecation-for-new-users problem), but means behavior/cost can shift
  under this feature without a code change to flag it.
- No rate limiting or per-user cost control on `POST /events/:id/brief` —
  it's a real, metered API call, currently gated only by "the frontend has
  a button for it." Fine for a local, single-user preview; a real concern
  before any public exposure.
- The system instruction is long (condensed from 29 sections); token cost
  per brief includes it in full on every call. Not measured/optimized this
  phase.
- Editorial-priority/confidence classification is the model's judgment,
  not a verified ground truth — spot-checked against one real event, not
  evaluated systematically across categories or adversarial inputs (e.g.
  genuinely conflicting multi-source events, which haven't occurred yet in
  the live dataset's single-tick history).
- The `ClaudeAiProvider` fetch-binding fix means that provider is now more
  likely to work correctly *if* a real `ANTHROPIC_API_KEY` is ever
  configured — but it still hasn't been verified live itself; only the
  identical bug pattern was fixed by inspection once the Gemini path
  proved it existed.

## Consequences

- A journalist can click one button on a real event and get a structured,
  source-grounded brief — with confirmed/reported/unverified separated,
  known/potential impact separated, and every entity/location traceable
  back to the real source text — matching the "AI Intelligence Brain"
  vision without inventing anything the ingestion pipeline didn't already
  collect.
- The automatic ingestion pipeline (`processMessage`, `NullAiProvider`/
  `ClaudeAiProvider`, `ai_summaries`) is completely unchanged — this is a
  new, additive read/generate path, not a modification of working
  components.
- A real, previously-undiscovered bug in `ClaudeAiProvider` is now fixed,
  found only because this feature was actually run against a live
  Workers runtime instead of staying mocked-only.
