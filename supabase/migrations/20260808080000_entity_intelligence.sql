-- Phase 12: Entity Intelligence Layer
--
-- Adds the evidence ledger and true entity-to-entity relationship table that
-- Gemini-backed entity extraction needs on top of Phase 11's deterministic
-- entities/entity_event_links (20260808070000_entity_graph.sql, untouched by
-- this migration). Nothing here changes v1's behavior — this is purely
-- additive, and both tables stay empty until the batch extraction step
-- (worker/src/pipeline/entityExtraction.ts) actually runs, which itself only
-- runs when GEMINI_API_KEY is configured.

-- The append-only evidence ledger: one row per (event, extracted candidate),
-- whether or not it was confident enough to become a real entity. This is
-- what makes re-extraction idempotent (content_hash + extraction_version
-- already seen -> skip) and what makes every AI claim auditable, including
-- the ones that were correctly rejected.
create table public.entity_extractions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.normalized_events (id) on delete cascade,
  entity_type public.entity_type not null,
  extracted_name text not null,
  confidence real not null check (confidence >= 0 and confidence <= 1),
  evidence_snippet text,
  extraction_method text not null check (extraction_method in ('deterministic', 'gemini')),
  model text,
  extraction_version text not null,
  content_hash text not null,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.entity_extractions is
  'Append-only audit trail of every entity candidate extraction has ever produced for an event, accepted or not. "accepted" = it cleared both the evidence-snippet validation and the confidence threshold and became a real entities/entity_event_links row. content_hash (see worker/src/pipeline/dedupe.ts computeContentHash) + extraction_version together are the idempotency key: the batch runner skips any event already extracted at its current content hash and the current extraction_version.';

create index entity_extractions_event_id_idx on public.entity_extractions (event_id);
create index entity_extractions_content_hash_idx on public.entity_extractions (event_id, content_hash, extraction_version);

-- True entity-to-entity relationships (person -> works_for -> organization),
-- distinct from entity_event_links (which is always entity <-> event, e.g.
-- "this country occurred_in this event"). Directional: entity_id is the
-- subject, related_entity_id is the object. The same real relationship
-- re-confirmed by a later event adds a second evidence row rather than
-- colliding, so "how many events support this" is a real, visible count.
create table public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id) on delete cascade,
  related_entity_id uuid not null references public.entities (id) on delete cascade,
  relationship_type text not null check (
    relationship_type in ('works_for', 'member_of', 'represents', 'affiliated_with', 'located_in', 'associated_with', 'related_to', 'mentioned_with')
  ),
  confidence real not null check (confidence >= 0 and confidence <= 1),
  evidence_event_id text not null references public.normalized_events (id) on delete cascade,
  evidence_snippet text not null,
  model text,
  extraction_version text not null,
  created_at timestamptz not null default now(),
  check (entity_id <> related_entity_id),
  unique (entity_id, related_entity_id, relationship_type, evidence_event_id)
);

comment on table public.entity_relationships is
  'Evidence-backed entity-to-entity relationships only — every row must carry a real supporting event and a verbatim evidence_snippet (validated server-side against that event''s own text before insert, see entityExtraction.ts). If the only evidence is co-occurrence in the same event with no more specific relationship identified, relationship_type is "mentioned_with", matching Entity Explorer v1''s "Appeared together" convention rather than claiming a formal relationship the evidence does not support.';

create index entity_relationships_entity_id_idx on public.entity_relationships (entity_id);
create index entity_relationships_related_entity_id_idx on public.entity_relationships (related_entity_id);
create index entity_relationships_evidence_event_id_idx on public.entity_relationships (evidence_event_id);

-- The entity-page "AI Intelligence Summary" — on-demand, Gemini-backed,
-- same append-only/latest-wins-by-timestamp convention as journalist_briefs
-- (20260808010000_journalist_briefs.sql). One JSONB column for the whole
-- structured brief, same rationale: the shape is still evolving and every
-- field is read/written as a whole object, never queried column-by-column.
create table public.entity_briefs (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id) on delete cascade,
  model text not null,
  prompt_version text,
  brief jsonb not null,
  generated_at timestamptz not null default now()
);

comment on table public.entity_briefs is
  'Append-only history of on-demand AI-generated entity intelligence summaries. Distinct from journalist_briefs (per-event); this is per-entity, built only from that entity''s own real recent events/relationships/sources, never freely-invented biography.';

create index entity_briefs_entity_id_idx on public.entity_briefs (entity_id, generated_at desc);

alter table public.entity_extractions enable row level security;
alter table public.entity_relationships enable row level security;
alter table public.entity_briefs enable row level security;

-- Same convention as every table since 0007_rls_policies.sql: authenticated-only,
-- no anon grant. The Worker reads/writes with the service-role key, which
-- bypasses RLS entirely.
create policy "entity_extractions are readable by authenticated users"
  on public.entity_extractions for select to authenticated using (true);

create policy "entity_relationships are readable by authenticated users"
  on public.entity_relationships for select to authenticated using (true);

create policy "entity_briefs are readable by authenticated users"
  on public.entity_briefs for select to authenticated using (true);
