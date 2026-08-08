-- Phase 13: Historical World Timeline — data model foundation only.
--
-- NormalizedEvent (normalized_events) is real-time ingestion data — a single
-- article/alert with a single publishedAt. It genuinely cannot represent
-- "the COVID-19 pandemic, 2020-2023" or "Russia's invasion of Ukraine,
-- 2022-present": multi-year spans with a curated, editorial significance
-- judgment behind them. That judgment is explicitly NOT something this
-- migration or any AI process makes — this table starts and stays empty
-- until a real curation process exists. No rows are seeded here; seeding
-- fabricated "historical significance" would be exactly the kind of
-- invented content this whole phase was scoped to avoid.
--
-- Purely additive: does not touch normalized_events or any Entity
-- Intelligence table (entities/entity_event_links/entity_extractions/
-- entity_relationships/entity_briefs) in any way.
create table public.historical_moments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  start_date date not null,
  end_date date,
  -- Two tiers only, both requiring an explicit editorial call — never
  -- inferred from an event's priority_score or an AI's own judgment of
  -- what's "historic" (see entityBriefProvider.ts's "AI is never the source
  -- of truth" precedent for the same reasoning applied here).
  significance text not null check (significance in ('major', 'notable')),
  category text references public.categories (id),
  region text,
  countries text[] not null default '{}',
  source_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

comment on table public.historical_moments is
  'Curated, editorially-significant historical spans ("what shaped the world we live in today") — distinct from normalized_events, which is real-time single-point ingestion data. Zero rows are seeded by this migration; a real curation workflow (human or a future, separately-reviewed process) populates it. Never auto-populated by treating an ordinary ingested event as historically significant.';

create index historical_moments_start_date_idx on public.historical_moments (start_date desc);

alter table public.historical_moments enable row level security;

create policy "historical_moments are readable by authenticated users"
  on public.historical_moments for select to authenticated using (true);
