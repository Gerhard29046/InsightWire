-- Phase 6: Database Schema
-- `sources` mirrors worker/src/connectors/types.ts's SourceConnector static
-- metadata. `connector_runs` mirrors worker/src/manager/types.ts's
-- ConnectorRunResult exactly — this is what would back a Postgres
-- MetricsStore implementation later, without changing ConnectorManager.

create table public.sources (
  id text primary key,
  name text not null,
  description text not null,
  type text not null check (type in ('rss', 'api', 'dataset')),
  version text not null,
  refresh_interval_ms integer not null check (refresh_interval_ms > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sources is
  'DB-side counterpart of the connector registry (worker/src/connectors/registry.ts). Seeded with today''s two connectors; kept in sync by hand when connectors are added.';

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('nasa-news', 'NASA News', 'Official NASA news releases (nasa.gov RSS feed) — no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true),
  ('who-news', 'WHO News', 'World Health Organization news releases (who.int RSS feed) — no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true);

create table public.connector_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources (id) on delete cascade,
  status text not null check (status in ('success', 'partial', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  attempts integer not null check (attempts >= 0),
  items_fetched integer not null default 0,
  items_normalized integer not null default 0,
  items_valid integer not null default 0,
  items_invalid integer not null default 0,
  sample_errors text[] not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.connector_runs is
  'One row per ConnectorManager.runConnector() call. Mirrors ConnectorRunResult field-for-field (worker/src/manager/types.ts).';

create index connector_runs_source_id_started_at_idx
  on public.connector_runs (source_id, started_at desc);
