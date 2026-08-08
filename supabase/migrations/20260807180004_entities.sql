-- Phase 6: Database Schema
-- Resolved entity tables + event join tables. These are the deduplicated,
-- queryable graph built from normalized_events.people/.organizations (plain
-- text[] on that table) — populated by a future entity-resolution step, not
-- by the connectors themselves. Name-uniqueness here is a known
-- simplification (two different people can share a name); real
-- disambiguation is a Phase 5+ concern, not solved by this schema.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.event_organizations (
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (normalized_event_id, organization_id)
);

create table public.event_people (
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (normalized_event_id, person_id)
);

create table public.event_tags (
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (normalized_event_id, tag_id)
);

create index event_organizations_organization_id_idx on public.event_organizations (organization_id);
create index event_people_person_id_idx on public.event_people (person_id);
create index event_tags_tag_id_idx on public.event_tags (tag_id);
