-- Phase 7: Supabase Repository — schema gaps found while wiring
-- SupabaseRepository against the Phase 6 schema (see
-- docs/decisions/0007-supabase-repository.md). Three real gaps, each
-- called out in advance by 06-supabase.md/04-database.md's own "where the
-- code-level contract and the DB schema diverge" notes, plus one they
-- missed (`tags`) and one idempotency gap this phase's own requirements
-- surfaced (replayed queue messages must not create duplicate history rows).

-- ---------------------------------------------------------------------------
-- Gap 1: only 2 of the 5 registered connectors (worker/src/index.ts's
-- createDefaultRegistry) are seeded in `sources`. Any raw/normalized event
-- from un-news/gdacs-alerts/nws-alerts would violate the source_id FK today.
-- Metadata copied verbatim from each connector's constructor, not guessed.
-- ---------------------------------------------------------------------------

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('un-news', 'UN News', 'United Nations News Centre releases (news.un.org RSS feed) — no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true),
  ('gdacs-alerts', 'GDACS', 'Global Disaster Alert and Coordination System (gdacs.org RSS feed) — EU Joint Research Centre + UN OCHA, explicitly public domain.', 'rss', '1.0.0', 900000, true),
  ('nws-alerts', 'NWS Active Alerts', 'NOAA National Weather Service active watches/warnings/advisories (api.weather.gov) — official public API, no auth required, US government work (public domain).', 'rss', '1.0.0', 900000, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Gap 2: `normalized_events` predates ADR 0006 (Source Trust + Priority
-- Engines) — `sourceTrustScore`/`priorityScore` have no columns.
-- `tags` has no column either — unlike its sibling `keywords`, which does
-- (0003_events.sql), even though every connector populates `tags` and
-- mergeEngine.ts merges it. Neither omission was intentional; both are
-- required for upsertNormalizedEvent to round-trip NormalizedEvent without
-- silent data loss on every restart-triggered re-read (e.g. the Merge
-- Engine's getNormalizedEvent lookup).
-- ---------------------------------------------------------------------------

alter table public.normalized_events
  add column source_trust_score real check (source_trust_score >= 0 and source_trust_score <= 1),
  add column priority_score real check (priority_score >= 0 and priority_score <= 100),
  add column tags text[] not null default '{}';

comment on column public.normalized_events.source_trust_score is
  'Denormalized snapshot from the Source Trust Engine at ingestion time (worker/src/pipeline/trust.ts) — added in Phase 7, ADR 0006 predates this column.';
comment on column public.normalized_events.priority_score is
  'Computed by the Priority Engine (worker/src/pipeline/priority.ts) after enrichment — added in Phase 7, ADR 0006 predates this column.';
comment on column public.normalized_events.tags is
  'Free-form per-event tags from connector normalize()/AI enrichment — distinct from the curated public.tags taxonomy table (event_tags join). Missing since 0003_events.sql; added in Phase 7 alongside the other Phase 6.6 fields.';

-- ---------------------------------------------------------------------------
-- Gap 3: confirmingSources (Merge Engine, worker/src/pipeline/mergeEngine.ts)
-- has nowhere to persist. Modeled as its own append/upsert table, matching
-- this schema's existing convention (event_updates, ai_summaries) of "a
-- separate table per array field" rather than a jsonb blob column — and
-- unlike event_updates/ai_summaries, this one is upserted per (event,
-- connector) rather than appended, matching mergeEvents' own semantics
-- (sources are deduped by connectorId, not accumulated as a log).
-- ---------------------------------------------------------------------------

create table public.event_confirming_sources (
  id uuid primary key default gen_random_uuid(),
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  connector_id text not null,
  source_url text,
  reported_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (normalized_event_id, connector_id)
);

comment on table public.event_confirming_sources is
  'Mirrors NormalizedEvent.confirmingSources (packages/shared/src/normalizedEvent.ts). One row per (event, connector) — mergeEvents dedupes by connectorId, so this table is upserted, not appended, on every merge.';

create index event_confirming_sources_normalized_event_id_idx
  on public.event_confirming_sources (normalized_event_id);

-- ---------------------------------------------------------------------------
-- Gap 4 (idempotency, not a missing field): "duplicate processing must not
-- corrupt the database" (Phase 7 requirement). processMessage calls
-- recordEventUpdate/recordAiSummary as plain appends with no natural key —
-- a retried queue message (Cloudflare Queues redelivers on any thrown error,
-- including a network blip after a partial success) would otherwise insert
-- a byte-identical second timeline entry or summary row. Both gain a unique
-- constraint so SupabaseRepository can upsert with `on conflict do nothing`.
-- A genuinely new update/summary (different label/summary text) is
-- unaffected — this only collapses exact repeats.
-- ---------------------------------------------------------------------------

alter table public.event_updates
  add constraint event_updates_event_at_label_key unique (normalized_event_id, at, label);

alter table public.ai_summaries
  add constraint ai_summaries_event_model_summary_key unique (normalized_event_id, model, summary);

-- ---------------------------------------------------------------------------
-- RLS + grants for the new table — same shape as every other
-- reference/intelligence table in 0007_rls_policies.sql (authenticated-read
-- only; writes only ever happen via the Worker's service_role key, which
-- bypasses RLS by Supabase design).
-- ---------------------------------------------------------------------------

grant select on public.event_confirming_sources to authenticated;

alter table public.event_confirming_sources enable row level security;
create policy "event_confirming_sources are readable by authenticated users"
  on public.event_confirming_sources for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Transactional write path for SupabaseRepository.upsertNormalizedEvent.
-- Postgres function instead of two sequential PostgREST calls: the
-- normalized_events row and its confirming-sources rows must land together
-- or not at all (Phase 7 Step 3, "avoid partial writes") — a mid-write
-- failure here would otherwise leave a stored event whose confirmingSources
-- don't match what mergeEngine.ts actually computed, corrupting the next
-- merge's confidence calculation silently. Takes the full row as a
-- composite-typed parameter (PostgREST/supabase-js coerce a plain object
-- into it) rather than ~24 scalar parameters, so the function tracks the
-- table's columns automatically instead of drifting from them.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_normalized_event_with_sources(
  p_event public.normalized_events,
  p_confirming_sources jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.normalized_events (
    id, raw_event_id, source_id, title, description, summary,
    country, city, lat, lng, category, source, source_url,
    start_time, end_time, published_at, updated_at,
    importance, confidence, verification_status, language,
    people, organizations, keywords, tags, status,
    source_trust_score, priority_score
  )
  values (
    p_event.id, p_event.raw_event_id, p_event.source_id, p_event.title, p_event.description, p_event.summary,
    p_event.country, p_event.city, p_event.lat, p_event.lng, p_event.category, p_event.source, p_event.source_url,
    p_event.start_time, p_event.end_time, p_event.published_at, p_event.updated_at,
    p_event.importance, p_event.confidence, p_event.verification_status, p_event.language,
    p_event.people, p_event.organizations, p_event.keywords, p_event.tags, p_event.status,
    p_event.source_trust_score, p_event.priority_score
  )
  on conflict (id) do update set
    raw_event_id = coalesce(excluded.raw_event_id, public.normalized_events.raw_event_id),
    title = excluded.title,
    description = excluded.description,
    summary = excluded.summary,
    country = excluded.country,
    city = excluded.city,
    lat = excluded.lat,
    lng = excluded.lng,
    category = excluded.category,
    source = excluded.source,
    source_url = excluded.source_url,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at,
    importance = excluded.importance,
    confidence = excluded.confidence,
    verification_status = excluded.verification_status,
    language = excluded.language,
    people = excluded.people,
    organizations = excluded.organizations,
    keywords = excluded.keywords,
    tags = excluded.tags,
    status = excluded.status,
    source_trust_score = excluded.source_trust_score,
    priority_score = excluded.priority_score;

  if jsonb_array_length(p_confirming_sources) > 0 then
    insert into public.event_confirming_sources (normalized_event_id, connector_id, source_url, reported_at)
    select p_event.id, src ->> 'connectorId', src ->> 'sourceUrl', (src ->> 'reportedAt')::timestamptz
    from jsonb_array_elements(p_confirming_sources) as src
    on conflict (normalized_event_id, connector_id) do update set
      source_url = excluded.source_url,
      reported_at = excluded.reported_at;
  end if;
end;
$$;

comment on function public.upsert_normalized_event_with_sources is
  'Atomic write path for Repository.upsertNormalizedEvent (SupabaseRepository) — the normalized_events row and its confirming-sources rows commit together or not at all. security invoker: runs as whichever role calls it (the Worker''s service_role key), same RLS-bypass behavior as every other write path in this schema, not an elevated-privilege escape hatch.';
