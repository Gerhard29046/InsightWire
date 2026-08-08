-- Phase 11: Entity Explorer
--
-- Persists the entity graph the ingestion pipeline has been *computing*
-- since Phase 6.6 (worker/src/pipeline/entityGraph.ts's populateEntityGraph,
-- called from processMessage.ts for every real event) but never durably
-- stored — it only ever lived in InMemoryEntityGraphStore, which resets on
-- every Worker restart. This migration gives that already-real, already-
-- tested computation somewhere permanent to live.
--
-- Supersedes 0005_entities.sql's organizations/people/event_organizations/
-- event_people/event_tags tables in practice: those required real
-- people/organizations *extraction* from AI, which has never run in this
-- environment (selectAiProvider falls back to NullAiProvider without
-- ANTHROPIC_API_KEY — see pipeline/ai/enrichmentPipeline.ts), so those
-- tables have held 0 rows since they were created. Left in place rather
-- than dropped (zero real data at risk either way, but dropping applied
-- production schema outside this task's scope isn't necessary for
-- correctness). This migration generalizes to every entity type Entity
-- Explorer needs — including country/location/source-organization, which
-- already have real, always-populated data today with zero AI dependency.

create type public.entity_type as enum (
  'person',
  'organization',
  'government',
  'company',
  'agency',
  'country',
  'location',
  'political_party',
  'international_organization',
  'topic',
  'other'
);

comment on type public.entity_type is
  'Matches worker/src/pipeline/entityGraph.ts EntityType, minus the internal "event" pseudo-type (never persisted here — see entity_event_links.event_id, which references normalized_events directly).';

create type public.entity_relationship_type as enum (
  'occurred_in',
  'tagged_with',
  'mentions',
  'reported_by',
  'affiliated_with',
  'located_in',
  'part_of'
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  entity_type public.entity_type not null,
  name text not null,
  normalized_name text not null,
  country text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (entity_type, normalized_name)
);

comment on table public.entities is
  'Real-world nodes a journalist can investigate (person/organization/government/company/agency/country/location/political_party/international_organization/other) plus "topic" (tag-derived, excluded from Entity Explorer''s default listing — see entitiesApi.ts). normalized_name mirrors entityGraph.ts''s normalizeName() exactly (trim/lowercase/collapse whitespace) — the same dedup key InMemoryEntityGraphStore has always used, so behavior is identical, just durable.';

create index entities_entity_type_idx on public.entities (entity_type);
create index entities_normalized_name_idx on public.entities (normalized_name);
create index entities_last_seen_at_idx on public.entities (last_seen_at desc);
create index entities_country_idx on public.entities (country);

-- One row per (event, entity) edge actually observed. Deliberately
-- event<->entity rather than entity<->entity: "connected entities"
-- (co-occurrence) is derived at query time by joining this table to itself
-- on event_id, so it's always exactly as fresh as real event data and needs
-- no separately-maintained relationship table that could drift out of sync.
create table public.entity_event_links (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id) on delete cascade,
  event_id text not null references public.normalized_events (id) on delete cascade,
  relationship_type public.entity_relationship_type not null,
  created_at timestamptz not null default now(),
  unique (entity_id, event_id, relationship_type)
);

comment on table public.entity_event_links is
  'The evidence trail: every claim Entity Explorer makes ("X and Y appeared together in N events") must trace back to real rows here, each pointing at a real normalized_events row a journalist can open.';

create index entity_event_links_entity_id_idx on public.entity_event_links (entity_id);
create index entity_event_links_event_id_idx on public.entity_event_links (event_id);

alter table public.entities enable row level security;
alter table public.entity_event_links enable row level security;

-- Same convention as every other table since 0007_rls_policies.sql:
-- authenticated-only, no anon grant. The Worker reads/writes with the
-- service-role key, which bypasses RLS entirely — this is defense in depth
-- for any future authenticated-frontend path, not what currently gates access.
create policy "entities are readable by authenticated users"
  on public.entities for select to authenticated using (true);

create policy "entity_event_links are readable by authenticated users"
  on public.entity_event_links for select to authenticated using (true);
