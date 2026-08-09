# ADR 0017: Near-Duplicate Detection Across Independent Sources

**Status:** Accepted (implemented, unit-tested)
**Date:** 2026-08-09

## Context

The product owner asked: "if 20 sources report the same event, the journalist should not necessarily see 20 identical events — instead, one intelligence event with 20 supporting sources, where the architecture allows it." A background architecture audit of this codebase's real dedup/merge pipeline (`worker/src/pipeline/dedupe.ts`, `mergeEngine.ts`) found that the merge machinery (`mergeEvents()` — dedupes `confirmingSources`, bumps confidence, merges tags/keywords, writes a timeline entry) is fully built and correct, but was **never actually reached** for the realistic case: `checkForDuplicate`'s only cross-source match was an exact SHA-256 hash over `title+description`. Confirmed via the existing test suite (`dedupe.test.ts`'s only cross-source case used byte-identical text) that independent newsrooms covering the same real event — who always paraphrase, never copy verbatim — would never trigger it. In practice, today, 20 sources reporting one event become 20 separate rows.

## Decision

Add a third matching tier — near-duplicate similarity — checked after exact id and exact content hash both miss, in `checkForDuplicate` (`dedupe.ts`). It gates hard before ever comparing text:

1. **Different source only.** Same-source matching is explicitly excluded. This surfaced a real risk while building this: institutional press releases (confirmed live against this app's own real Federal Reserve feed) reuse an almost-identical template per release ("Federal Reserve Board announces approval of the application by X, Inc."), differing only in the affected party's name — two genuinely different real events from the *same* source would otherwise score above any reasonable similarity threshold purely from shared boilerplate. The stated goal is "N independent sources, one event," never "collapse one source's own distinct releases."
2. **Same category, same country.** Avoids ever comparing text where shared vocabulary is coincidental.
3. **Within a 48-hour window** of each other's `publishedAt`.
4. **Jaccard word-set similarity** on normalized (lowercased, punctuation-stripped, stopword-filtered) title and description, each required to independently clear its own threshold (title ≥ 0.25 with at least 2 shared words, description ≥ 0.2) — requiring both, not a single blended score, so a short/generic shared title alone can't trigger a false merge.

Thresholds were calibrated against two measured, real-shaped examples rather than picked arbitrarily: two wire services' independent headlines for the same real flood score ~0.286 title / ~0.231 description similarity (kept just inside the bar); two unrelated same-category/country government stories score ~0.222 (kept just outside it). This is a genuinely narrow, hard problem without real embeddings — the margin is real, not a false sense of precision, and is documented directly in `dedupe.ts`'s own comments alongside the exact numbers so a future adjustment has real data to calibrate against, not a guess.

`ExistingRecord`/`SimilarityCandidate` gained `country`, `publishedAt`, and `source` fields to support this — a small, additive interface change, propagated to the one real call site (`processMessage.ts`'s `rememberForDedupe`) and every test's record-construction helper.

## What this does not fix

- The in-memory `DuplicateIndex` (both before and after this change) resets on Worker restart — a pre-existing limitation shared with the connector-metrics store, unrelated to this change, not addressed here.
- This is deterministic word-overlap, not semantic similarity — a paraphrase sharing zero literal words with the original (e.g. translated, or radically reworded) will not be caught. Real embedding-based similarity (this codebase already has `Repository.recordEmbedding`/`embeddings` table plumbing, currently unused for this purpose) is the natural next step if word-overlap proves insufficient in practice.
- `categoryWeight` in `priority.ts` remains intentionally zero (a deliberate prior fix for weather-category score inflation, per ADR 0014) — untouched by this change.

## Verification performed

- `npx vitest run` (worker): 518 tests pass (5 new near-duplicate tests: one true-positive cross-source match, three deliberate false-positive guards — same-source boilerplate, unrelated same-category stories, and out-of-window near-identical text — plus one country-gate-independent-of-text-similarity case), all existing dedupe/merge/sanews tests unaffected.
- `npx tsc --noEmit`: clean.
