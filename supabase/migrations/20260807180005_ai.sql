-- Phase 6: Database Schema
-- "Store AI output separately from raw data. Never overwrite original
-- source information." Both tables here are append-only histories, not
-- mutable columns — normalized_events.summary keeps a denormalized "current
-- best value" for fast reads, but every generation attempt is preserved here.

create table public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  model text not null,
  prompt_version text,
  summary text not null,
  confidence real check (confidence >= 0 and confidence <= 1),
  generated_at timestamptz not null default now()
);

comment on table public.ai_summaries is
  'Append-only history of every AI summary generation for an event. normalized_events.summary holds the current best value for fast reads; this table is the audit trail — never delete/overwrite a row here to "fix" a summary, insert a new one.';

create index ai_summaries_normalized_event_id_idx on public.ai_summaries (normalized_event_id);

-- Polymorphic on purpose: Phase 10 wants semantic search over more than just
-- events eventually (entities, story suggestions), and a generic table now
-- avoids a schema rewrite later. Trade-off: subject_id can't be a real FK
-- (a single column can't reference multiple tables) — subject_type is the
-- caller's contract for which table subject_id refers to. subject_id is
-- stored as text regardless of the referenced table's actual key type
-- (normalized_events.id is text; organizations/people ids are uuid — cast
-- to text when inserting).
create table public.embeddings (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('normalized_event', 'organization', 'person')),
  subject_id text not null,
  model text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

comment on table public.embeddings is
  'Polymorphic (subject_type/subject_id) rather than event-specific — see Phase 10 (semantic search, knowledge graph). Append-only: a re-embed inserts a new row rather than overwriting; "select ... order by created_at desc limit 1" gets the latest. No ANN index (ivfflat/hnsw) yet — needs tuning against real data volume, exact search is fine until then.';

create index embeddings_subject_idx on public.embeddings (subject_type, subject_id);
