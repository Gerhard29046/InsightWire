# ADR 0011: SAnews Connector, Trust Registry Audit, Statement-Nature Classification

**Status:** Accepted (implemented, unit-tested, and verified live against real
feeds through the real `workerd` runtime)
**Date:** 2026-08-08

## Context

The user asked for SAnews (South African Government News Agency) as a
first-class connector, with 20 specific requirements plus a separate
Facebook investigation. This ADR covers the connector, a real gap it
surfaced in the trust registry, a schema extension to the Journalist Brief
feature (statement-nature classification), and the Facebook findings.

## Decisions

### Two real, live SAnews feeds found and verified — not guessed

Fetched `https://www.sanews.gov.za/` and read the actual footer RSS
subscription links (not assumed): `south-africa-news-stories.xml` (breaking
news, several items per hour) and `features.xml` (long-form, roughly
weekly). Both confirmed live (most recent items hours old, respectively).
Registered as two connectors (`sanews`, `sanews-features`) sharing a common
`SAnewsConnectorBase` — `RssConnector`'s design is one feed URL per
instance, so two real feeds need two connector instances, not one
connector guessing which feed to prefer.

### `sourceUrl` is already the human-readable article page — verified, not assumed

`<link>` in both feeds points at the real article page (e.g.
`https://www.sanews.gov.za/south-africa/government-urges-public-stay-vigilant-amid-expected-cold-weather`),
never the `.xml` feed endpoint — confirmed directly from live feed content
before writing code. `sourceUrl` is set to exactly this value, and (per
ADR 0009) the frontend's "Read original source" action already only ever
opens `event.sourceUrl` — satisfied by the existing architecture, no new
frontend logic needed for this requirement.

### A real quality bug found by writing the "no fabricated author" test, and fixed for all 4 government connectors

The requirement to extract "author if available" surfaced that
`<dc:creator>` in this feed contains internal CMS editor usernames ("Neo",
"Edwin", "GabiK") — the same underlying government CMS platform as
`south-africa-gov`'s gov.za feed. Presenting an internal staff handle as a
journalist byline would mislead, not inform, so it's deliberately **not**
surfaced as an author field (`NormalizedEvent` has none, and none was
added).

Writing the test that checks this (`sanews.test.ts`) caught something more
concrete: the same editor username, plus a raw Drupal timestamp
("Sat, 08/08/2026 - 08:44"), was leaking into the plain-text `description`
after HTML-tag stripping — because Drupal embeds a title/editor/timestamp
metadata block inside the same `<description>` field as the real article
body, and generic tag-stripping only removes markup, not the metadata
text itself. Confirmed this affects `south-africa-gov` too (same platform;
its existing test never checked for this specific leak, so it passed
undetected for two phases). Fixed once, in the shared
`stripHtmlDescription` helper (`RssConnector.ts`, now used by all 4
non-English-source-format connectors), by:
- removing the editor-username-plus-Drupal-datetime pattern wherever it
  occurs (confirmed the block appears in a *different position* — leading
  for `south-africa-gov`, trailing for `sanews` — so the fix matches by
  pattern, not position), and
- stripping a leading duplicate of the item's own title, which Drupal also
  repeats as the description's first line.

Verified against all 20 real, live items across both SAnews feeds
post-fix: zero leaked editor usernames or raw timestamps.

### No structured department/people/organizations/topic extraction from feed metadata

Neither feed has `<category>` or geo tags (unlike NWS's CAP fields or
GDACS's `dc:subject`) — there is nothing to extract from feed metadata for
department/topic beyond what's already in the free-text title/description.
`people`/`organizations` stay empty at ingestion, the same honest pattern
every connector in this codebase follows — real entity extraction only
happens where a real AI provider actually runs: automatically via
`NullAiProvider`/`ClaudeAiProvider` (currently empty), or per-event via the
Journalist Brief feature (ADR 0010), which **does** extract real
entities/locations from the article body on request. Regex-guessing a
"department" out of prose (e.g. matching "Department of X" substrings)
was considered and rejected — a fragile heuristic that would sometimes be
wrong, which is worse than honestly leaving the field empty until real
extraction exists.

### Trust registry: SAnews classified `government`, and a real 2-phase-old gap fixed

SAnews is a literal government publisher (Department of Communications) —
classified `government`, same tier as `south-africa-gov`/NASA/NWS. Per the
requirement, this is a statement about **source reliability**, not a claim
about truth: every SAnews-derived event still starts
`verificationStatus: 'unverified'`, same as every other connector — a
government-owned publisher's trust score and an individual claim's
verification status are deliberately different axes (`trust.ts`'s own
long-standing design).

Auditing `trust.ts` to add SAnews surfaced a real gap: `south-africa-gov`,
`namibia-newera`, and `zimbabwe-zbc` (added in the two phases before this
one) were **never added to `createDefaultTrustRegistry()`** — they'd been
silently falling back to `UNKNOWN_CONNECTOR_CATEGORY` ('rss', trust 0.6)
this whole time instead of the `government` tier (0.9) they should have
had, quietly understating their priority-score contribution. Fixed here,
found only because this phase's own requirement forced a full audit of
that file.

### Deduplication/merge: already correct by construction, proven with a real test

Requirement 13/14 ("don't duplicate an existing event just because SAnews
reports it after another connector — attach as a confirming source") is
exactly what `dedupe.ts`/`mergeEngine.ts` already do for every connector,
unchanged. Added a test (`sanews.test.ts`) proving it end-to-end: a
byte-identical report under a different id is correctly classified
`duplicate` by `checkForDuplicate`, resolving to the original event's id —
the same mechanism already verified live in ADR 0007 for NWS's reissue
case, now explicitly asserted for SAnews too rather than just assumed to
apply.

### First-seen tracking: already the existing `confirmingSources[].reportedAt`/`publishedAt`

No new field or mechanism needed — "when did SAnews first report this
event" is `confirmingSources.find(s => s.connectorId === 'sanews')?.reportedAt`,
already populated by every connector's `normalize()` and preserved through
merges by `mergeEngine.ts`'s existing dedupe-by-connector-id logic.

### Source/country filters: already free-text, no frontend change needed

Checked `EventFilters.tsx` directly: both "Country" and "Source" are
already free-text `TagInput` components (not fixed dropdowns) — "South
Africa" and "SAnews" work as filter values the moment real data exists,
with zero code change. `Admin.tsx` ("source dashboard") is still a bare
`PagePlaceholder` with no backend — unchanged, consistent with every other
out-of-scope mock page flagged in ADR 0009; a real per-connector stats
dashboard would need a `connector_runs`/`MetricsStore` API that doesn't
exist yet, not something to fake here.

### Statement-nature classification added to the Journalist Brief (not the automatic ingestion pipeline)

Requirement 12 (Gemini distinguishing announcement / claim / confirmed
external fact / proposed policy / scheduled / completed event) is a
richer classification than anything in the automatic per-event enrichment
pipeline (`AiEnrichmentResult`) — it belongs with the Journalist Brief
feature (ADR 0010), which already does comparable epistemic classification
(confirmed/reported/claim/unverified). Added `GovernmentStatementNature`
(7 values, `not_applicable` for non-government sources) as a new
`JournalistBrief` field, extended `geminiJournalistBriefProvider.ts`'s
schema and system instruction, and surfaced it in
`JournalistBriefPanel.tsx` as a badge (hidden when `not_applicable`, so
non-government events don't show a meaningless tag). Applies to any
event, not just SAnews — every connector today is government-or-official
in nature, so scoping this narrowly to one connector would have missed
the point.

## Facebook: investigated, not built — here's exactly what would be required

Found the real official page:
`https://www.facebook.com/p/South-African-Government-News-100064496628267/`.
Checked Meta's actual current developer documentation (Page Public Content
Access / Page Public Metadata Access), not assumed from general knowledge:

- Reading **any** Facebook Page's posts via the Graph API — including a
  fully public government page InsightWire doesn't administer — requires
  the **Page Public Content Access (PPCA)** permission.
- PPCA requires **App Review** — a formal submission to Meta with a
  documented use case, and in practice **Business Verification** of the
  requesting entity. This is a real approval process with real turnaround
  time, not a config flag.
- Without an approved App Review, a Meta developer app can only read pages
  where the *same person* is both a Page admin and an app
  developer/tester — meaning without SAnews/GCIS's own direct cooperation,
  there's no way to read their page today, full stop.
- **No arbitrary scraping was implemented or considered** — per the
  explicit instruction, and consistent with every connector in this
  codebase using only official feeds/APIs.

**What it would actually take to build this for real:**
1. Create a Meta developer account and app.
2. Submit App Review requesting Page Public Content Access, with a written
   use case (this project's actual purpose) and likely Business
   Verification of whoever owns the app.
3. Once (if) approved, call `GET /{page-id}/posts` with a valid access
   token — a straightforward Graph API call at that point.
4. Build the connector to treat a Facebook post as a **signal pointing at**
   the underlying SAnews article (cross-reference by matching URL/title
   against the already-ingested `sanews`/`sanews-features` events), not as
   its own independent copy of the content — matching the explicit "detect
   an early signal and connect it to the authoritative source, don't copy
   social media" framing.

None of this is built. No credentials exist. Nothing is faked.

## Verification performed

- `npm run test --workspace=worker`: **230 tests pass** (217 pre-existing +
  13 new across `sanews.test.ts` — parsing, the human-readable-URL
  requirement, unverified-by-default, confirmingSources seeding, HTML/
  metadata stripping, the no-fabricated-author check that caught the real
  bug above, validation rejection, unreachable-feed and unhealthy-feed
  failure handling, and the dedup/merge-attachment proof — plus 2 new
  tests in `geminiJournalistBriefProvider.test.ts` for `statementNature`).
- `npx tsc --noEmit` (worker) and `npm run build` (root): both clean.
- **Real, live verification**: both `sanews` and `sanews-features`
  collected successfully through the actual `workerd` runtime (`10/10`
  items each, via a real `wrangler dev` scheduled trigger) — confirmed in
  `scheduled.tick.complete`'s own results array. Directly re-verified
  connector-level (`fetch()`/`normalize()`/`validate()`) against live data:
  10/10 valid on both feeds, real article titles/URLs, zero leaked editor
  usernames or raw timestamps across all 20 real items checked
  automatically.
- Nothing deployed — local `wrangler dev` verification only, per the
  explicit instruction.

## Risks & assumptions carried forward

- `EDITOR_TIMESTAMP_PATTERN`'s fix is pattern-based, not structural
  (no HTML parser distinguishing "metadata span" from "content div") —
  matches the two real Drupal government sites checked; a future
  connector on a differently-formatted government CMS could need its own
  look before assuming this helper covers it.
- Department/people/organizations/topic extraction for SAnews remains
  entirely dependent on a real AI provider being configured — currently
  empty at ingestion for the same reason every other connector's is.
- Facebook: revisit only if the user actually pursues Meta App Review —
  nothing here expires or needs redoing before then.

## Consequences

- SAnews (both feeds) is a real, verified, live connector — 5 of the 20
  requirements were already satisfied by existing architecture
  (dedup/merge, first-seen tracking, filters) without new code, which is
  itself a sign the earlier phases' design held up under a real new
  requirement rather than needing rework.
- A real, silent trust-registry gap affecting 3 already-shipped connectors
  is fixed.
- The Journalist Brief's classification vocabulary is now richer
  (statement nature, not just evidence level) for every event, not just
  government sources — a generalizable improvement, not a one-off hack for
  SAnews.
- Facebook integration has a clear, honest "not yet, here's what it takes"
  answer instead of either silence or a shortcut.
