# ADR 0016: Institutional Source Expansion (US/UK/EU) — First Increment

**Status:** Accepted (implemented, unit-tested, live-verified)
**Date:** 2026-08-09

## Context

The user asked for a "product-wide improvement pass" that includes substantially broadening the Global Events Feed's international coverage — explicitly naming the White House, US Congress/Senate/SCOTUS, State Department, Pentagon, Federal Reserve, Treasury, the European Commission/Parliament/Council, ECB, and UK Government/Parliament/PM/Bank of England — while holding the line on this project's hard rule: **never invent a connector endpoint; always live-verify a real, machine-readable feed before writing any code against it** (established in prior ADRs, e.g. the SARB/SA Parliament investigated-but-not-connectable precedent).

This is a large ask — the full list names roughly 20 institutions across three governments plus several international bodies. Verifying each live (not guessing a plausible-looking URL) is the expensive part, and quality matters more than quantity per the user's own stated priority ("more signal, not more noise").

## What was verified live (2026-08-09), via direct `curl` against the real endpoint

**Real, working, connected this phase:**
- Federal Reserve Board press releases — `https://www.federalreserve.gov/feeds/press_all.xml` (RSS 2.0)
- The White House, Presidential Actions — `https://www.whitehouse.gov/presidential-actions/feed/` (RSS 2.0; the site's older `/feed/` and `/briefing-room/feed/` paths both now 404 under the current site structure)
- UK Government, News and communications — `https://www.gov.uk/search/news-and-communications.atom` (Atom, not RSS — uses `<updated>`/`<summary>`, not `<pubDate>`/`<description>`)
- Bank of England news — `https://www.bankofengland.co.uk/rss/news` (RSS 2.0)
- European Commission press corner — `https://ec.europa.eu/commission/presscorner/api/rss?language=en` (RSS 2.0)
- European Central Bank press releases — `https://www.ecb.europa.eu/rss/press.html` (RSS 2.0)

**Investigated, found not connectable from this environment — real gaps, not silently skipped (same posture as the SARB precedent):**
- US State Department press releases (`state.gov/rss-feeds/press-releases/feed/`) — returns HTTP 200 but the body is a "Technical Difficulties" error page, not RSS.
- US Supreme Court, US Congress (`congress.gov/rss`) — both redirect to sign-up/alert pages, not a direct feed.
- US Treasury — no discoverable feed at the expected path (404).
- NATO — no `<link rel="alternate">` feed reference found on its news page, and no working feed at several plausible historical paths; likely removed in a past site restructure.
- World Bank — the historical `all-rss.xml` path now redirects to a 404 response page.
- IMF — `imf.org/en/News/RSS` returns HTTP 403 (Access Denied) regardless of User-Agent; likely blocked at a WAF/edge layer from this environment.

Pentagon/Department of Defense, EU Parliament, and EU Council were not yet investigated in this pass — left for a future increment rather than guessed.

## Decision

Ship the 6 verified connectors now (`usFederalReserve.ts`, `usWhiteHouse.ts`, `ukGovernment.ts`, `bankOfEngland.ts`, `euCommission.ts`, `ecb.ts`), all extending the existing `RssConnector` base class with no changes to that contract. Categorized `markets` (Fed, Bank of England, ECB — monetary policy/regulation) or `government` (White House, UK Government, EU Commission — executive/legislative institutional output), using existing `CategoryId` values rather than inventing new ones. Supranational sources (EU Commission, ECB) use `country: 'European Union'`, the same "real institutional origin, not a literal country" convention `UnConnector` already established with `country: 'Global'`.

The remaining named institutions (Congress, SCOTUS, State, Treasury, Pentagon, NATO, World Bank, IMF, EU Parliament, EU Council) are an honest gap, not a silent omission — each either has no real public feed today, or wasn't yet investigated. Extending this list further is a natural next increment, following the exact same live-verification discipline.

## Verification performed

- `npx vitest run` (worker): all existing tests plus 6 new connector test suites, each against a **real captured fixture** (trimmed from a live `curl` response at verification time, not fabricated) — normalize() output checked against the real title/description/country/category, HTML-stripping checked against the real WordPress "appeared first on" boilerplate in the White House fixture, and Atom-specific field handling (`<updated>`/`<summary>`) checked against the real UK Government fixture.
- `npx tsc --noEmit` (worker): clean.
- All 6 connectors registered in `createDefaultRegistry()` (`worker/src/index.ts`) and exported alongside the existing 12.
- `sources` table seeded via `supabase/migrations/20260809110000_institutional_source_expansion.sql`, applied directly against the real linked Supabase project (same `supabase db query --linked -f` method used for the Workspace migrations, due to the pre-existing migration-history desync — see memory `project-insightwire-migration-history-desync`).

## Consequences

- The Global Events Feed now has real coverage of core US monetary/executive policy, UK government/monetary policy, and EU executive/monetary policy — directly answering the "what matters internationally" ask for those three governments' most consequential institutions (central banks + head of government/commission).
- Congress/SCOTUS/State/Treasury/Pentagon/NATO/World Bank/IMF remain uncovered; a future phase should re-attempt State/Treasury/NATO/World Bank (site restructures can add feeds back) and investigate EU Parliament/Council, which weren't checked this pass.
- No weather connectors were added or considered, per explicit instruction.
