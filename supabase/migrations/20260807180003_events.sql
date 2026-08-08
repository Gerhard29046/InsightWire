-- Phase 6: Database Schema
-- Core event tables. `normalized_events` mirrors
-- @insightwire/shared's NormalizedEvent field-for-field (camelCase TS <->
-- snake_case columns), with two deliberate exceptions noted on the table:
-- `embeddings` lives in its own polymorphic table (0006_ai.sql), and
-- `people`/`organizations` are kept here as plain text[] (matching the app
-- schema's raw AI-extracted name strings) in addition to the resolved
-- entity join tables in 0005_entities.sql — the array columns are "what the
-- AI pipeline said," the join tables are the deduplicated entity graph
-- built from those names.

create type public.event_importance as enum ('low', 'medium', 'high', 'critical');
create type public.event_verification_status as enum ('verified', 'unverified', 'disputed');
create type public.event_status as enum ('live', 'developing', 'scheduled', 'resolved');

comment on type public.event_importance is 'Matches packages/shared/src/taxonomy.ts SEVERITY_LEVELS exactly.';
comment on type public.event_verification_status is 'Matches packages/shared/src/taxonomy.ts VERIFICATION_STATUSES exactly.';
comment on type public.event_status is 'Matches packages/shared/src/taxonomy.ts EVENT_STATUS_IDS exactly.';

-- One row per distinct item ever seen from a source (upserted on refetch,
-- not appended every poll cycle — see worker/src/connectors/base/RssConnector.ts
-- RawEvent). `payload` is the untouched shape from the connector.
create table public.raw_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources (id) on delete cascade,
  external_id text not null,
  connector_run_id uuid references public.connector_runs (id) on delete set null,
  fetched_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);

comment on table public.raw_events is
  'Mirrors worker/src/connectors/types.ts RawEvent. One row per distinct external_id per source — upsert on refetch, do not insert a new row per poll cycle.';

create table public.normalized_events (
  id text primary key,
  raw_event_id uuid references public.raw_events (id) on delete set null,
  source_id text not null references public.sources (id) on delete cascade,

  title text not null,
  description text not null,
  summary text,

  country text not null,
  city text,
  lat double precision,
  lng double precision,

  category text not null references public.categories (id),
  source text not null,
  source_url text,

  start_time timestamptz,
  end_time timestamptz,
  published_at timestamptz not null,
  updated_at timestamptz not null,

  importance public.event_importance not null,
  confidence real not null check (confidence >= 0 and confidence <= 1),
  verification_status public.event_verification_status not null,
  language text not null,

  people text[] not null default '{}',
  organizations text[] not null default '{}',
  keywords text[] not null default '{}',

  status public.event_status not null,

  inserted_at timestamptz not null default now(),

  check ((lat is null) = (lng is null))
);

comment on table public.normalized_events is
  'Mirrors @insightwire/shared NormalizedEvent field-for-field, except `embeddings` (see 0006_ai.sql, polymorphic table). `country`/`city` are free text, not FK-enforced against countries/cities — see 0002_taxonomy.sql. `inserted_at` is this row''s own audit timestamp, distinct from the app-level `updated_at` (content freshness).';

create index normalized_events_source_id_idx on public.normalized_events (source_id);
create index normalized_events_category_idx on public.normalized_events (category);
create index normalized_events_published_at_idx on public.normalized_events (published_at desc);
create index normalized_events_status_idx on public.normalized_events (status);

-- Backs the frontend's EventTimeline component (src/components/feed/EventTimeline.tsx)
-- and NormalizedEvent.updates.
create table public.event_updates (
  id uuid primary key default gen_random_uuid(),
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  at timestamptz not null,
  label text not null,
  created_at timestamptz not null default now()
);

create index event_updates_normalized_event_id_idx on public.event_updates (normalized_event_id);

-- Phase 5 (AI pipeline) "relationship detection" and Phase 10's
-- "cross-event relationships" both write here. Self-referential many-to-many.
create table public.event_relationships (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.normalized_events (id) on delete cascade,
  related_event_id text not null references public.normalized_events (id) on delete cascade,
  relationship_type text not null check (relationship_type in ('duplicate', 'follow-up', 'related', 'contradicts')),
  confidence real check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  check (event_id <> related_event_id),
  unique (event_id, related_event_id, relationship_type)
);

create index event_relationships_event_id_idx on public.event_relationships (event_id);
create index event_relationships_related_event_id_idx on public.event_relationships (related_event_id);
