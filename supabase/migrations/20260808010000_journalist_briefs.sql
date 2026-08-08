-- Phase 9: on-demand "AI button" journalist briefs (Gemini-backed — see
-- docs/decisions/0010-journalist-brief.md). Deliberately separate from
-- ai_summaries (0005_ai.sql), which is the automatic per-event enrichment
-- history written by the ingestion pipeline (processMessage) for every
-- event. A journalist brief is much richer, user-triggered per event, and
-- must never be conflated with the automatic pipeline's output — a
-- different table, not a repurposed one.
--
-- One JSONB column for the whole structured brief rather than ~19 scalar
-- columns: the shape is still evolving (see JournalistBrief in
-- worker/src/pipeline/ai/journalistBrief.ts) and every field is read/written
-- as a whole object by the API layer, never queried column-by-column.
-- Append-only, like ai_summaries/embeddings: regenerating an event's brief
-- inserts a new row; "latest" is `order by generated_at desc limit 1`.

create table public.journalist_briefs (
  id uuid primary key default gen_random_uuid(),
  normalized_event_id text not null references public.normalized_events (id) on delete cascade,
  model text not null,
  prompt_version text,
  brief jsonb not null,
  generated_at timestamptz not null default now()
);

comment on table public.journalist_briefs is
  'Append-only history of on-demand AI-generated journalist briefs ("Summarize this event"). Distinct from ai_summaries, which is the automatic per-event ingestion-time enrichment history.';

create index journalist_briefs_normalized_event_id_idx on public.journalist_briefs (normalized_event_id, generated_at desc);

grant select on public.journalist_briefs to authenticated;

alter table public.journalist_briefs enable row level security;
create policy "journalist_briefs are readable by authenticated users"
  on public.journalist_briefs for select to authenticated using (true);
