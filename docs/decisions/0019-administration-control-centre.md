# ADR 0019: Administration as the Newsroom Operations Centre

**Status:** Accepted (implemented)
**Date:** 2026-08-09

## Context

Administration was a placeholder route. The brief asked for it to become the
real control centre for the whole platform: genuine source/ingestion
control, real system and pipeline health, a database overview, a
user-account and roles *framework* (no live auth exists — see ADR 0015), a
single source of truth for site configuration, and a substantial legal and
content-moderation compliance layer grounded in real South African law
(POPIA, PAIA, ECTA, the Cybercrimes Act, the Copyright Act) plus GDPR/UK GDPR
as design principles — explicitly never claiming compliance without an
actual audit.

The same single-tenant, no-auth constraint from ADR 0015 applies here: there
is still no login, no session, no per-user identity. Every admin write in
this phase is attributed to the same `WORKSPACE_USER_ID` used elsewhere.

## Decisions

**Source Enable/Disable is a real ingestion control, not a cosmetic flag.**
`sources.enabled` previously existed in the schema but was never read by the
real scheduling path — `ConnectorRegistry.listEnabled()` only checked a
static TypeScript property. `ConnectorManager.collectDue()` now accepts a
`disabledIds: ReadonlySet<string>` parameter, and `worker.ts`'s `scheduled()`
handler fetches the current disabled set from the database
(`fetchDisabledSourceIds`) before every run and passes it through. Disabling
a source in Administration genuinely stops it from being polled on the next
tick.

**Site configuration is one table, one context, no scattered state.**
`app_config` (key/value, `appearance`/`navigation`/`notifications`) is read
once by `SiteConfigProvider` (`src/lib/siteConfig.tsx`) and exposed via
`useSiteConfig()`. The Sidebar's visible nav items, the Settings tab, and the
personal Profile > Preferences page all read and write through this single
context — no component keeps a local copy of a setting that could drift from
what Administration configured.

**Trust scoring reuses the existing Source Trust Registry rather than
inventing a new "reliability" metric.** `trust.ts` was already computed and
used in priority scoring; Administration's Source Management surfaces
`trustCategory`/`trustScore` directly from it.

**Pipeline health is honest about what isn't instrumented.** `getOverview`
marks stages with no real per-stage counter (Normalization/Classification,
Deduplication) as `not_monitored` with a factual explanation, rather than
inventing a status. Database and ingestion metrics that fail to query return
`unavailable`/`null`, rendered as "Not configured" — never a fabricated
number.

**User accounts and roles are a framework, not a feature.** `profiles` is a
real, empty table, schema-ready for a 1:1 relationship with a future
`auth.users` once Supabase Auth exists. `profilesApi.ts` deliberately never
reads `auth.users` directly, so the one synthetic `WORKSPACE_USER_ID` row is
never shown as a real registered user. The Administrator/Editor/
Journalist/Viewer roles shown in the Users & Roles tab enforce nothing
today — no route in this app is access-controlled by role. When real
authentication ships, authorization must be enforced server-side in the
Worker against the authenticated identity, never by hiding buttons in the
client and never by trusting a client-supplied user ID.

**Legal documents are versioned, never overwritten.** `legal_documents` rows
are immutable once created; publishing a new version sets the prior active
row's status to `superseded` and inserts a new row. The public
`/legal`/`/legal/:slug` routes only ever serve the `active` version; the
Admin Legal tab's History view is the only place superseded versions are
visible. All 13 documents were researched and drafted against real,
named legislation and explicitly carry a "review by qualified legal counsel
before production launch" disclaimer — they reduce risk through actual
controls (real retention/removal/attribution mechanics described above),
not by trying to disclaim away legal obligations.

**Content moderation is a real, empty queue, not a demo.** `content_reports`
supports public submission (`POST /reports`) and an admin
Report → Review → Actioned/Dismissed workflow with resolution notes. An
empty queue renders "No reports" honestly.

**The audit log only ever contains real entries.** Every admin write in this
phase (`updateSource`, `updateConfig`, `createDocumentVersion`,
`updateReport`) calls `recordAuditEntry` with the real actor, action,
resource, and timestamp. Nothing is backfilled or fabricated for
demonstration purposes.

**Security posture is stated plainly, including its real gaps.** The
Security tab is a set of derived checks, not a score: it confirms (truthfully)
that no service-role or provider API key is ever sent to the browser, that
RLS is enabled on user-owned tables, and that audit logging is real — and it
flags, rather than hides, that CORS is currently fully open and that
authentication does not yet exist, both acceptable only because there is no
authenticated session or user-specific data being protected yet.

## Consequences

- Administration is now a real operations surface: Sources, Overview,
  Database, Pipeline, Users & Roles, Settings, Legal, Moderation, Audit, and
  Security all read genuine data and, where a "framework" is explicitly
  incomplete, say so rather than fake it.
- The single-tenant/no-auth limitation from ADR 0015 now extends across the
  whole admin surface — every admin action is attributed to the same
  synthetic identity, and role enforcement remains a UI-only framework until
  real authentication is built.
- Legal content is real and substantial but explicitly not a substitute for
  qualified legal review before any production launch.
