-- Phase 6: Database Schema
-- Reference/taxonomy tables. `categories` is seeded to match
-- packages/shared/src/taxonomy.ts's CATEGORY_IDS exactly — the two must be
-- kept in sync by hand (see docs/decisions/0004-database-schema.md).
-- `countries`/`cities` are intentionally left unseeded: hand-typing a full
-- ISO-3166 country list here would be fabricated reference data, not
-- something this project actually sources — import a canonical dataset
-- when a real geo feature (World Map, entity resolution) needs it.

create table public.categories (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

comment on table public.categories is
  'Must stay in sync with packages/shared/src/taxonomy.ts CATEGORY_IDS. Adding a row here is a data change; the TS union still needs a matching code change for type safety.';

insert into public.categories (id, label) values
  ('government', 'Government'),
  ('business', 'Business'),
  ('courts', 'Courts'),
  ('markets', 'Markets'),
  ('elections', 'Elections'),
  ('weather', 'Weather & Disasters'),
  ('conflicts', 'Conflicts'),
  ('science', 'Science');

create table public.countries (
  code text primary key,
  name text not null,
  region text,
  created_at timestamptz not null default now()
);

comment on table public.countries is
  'Reference/geo lookup table, not currently FK-enforced from normalized_events.country — see 0004_events.sql. Unseeded until a real geo feature needs it.';

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text references public.countries (code) on delete set null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

comment on table public.cities is
  'Reference/geo lookup table, not currently FK-enforced from normalized_events.city — see 0004_events.sql. Unseeded until a real geo feature needs it.';

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.tags is
  'Curated, browsable tag taxonomy — see event_tags in 0005_entities.sql. Distinct from normalized_events.keywords (plain text[], more free-form).';
