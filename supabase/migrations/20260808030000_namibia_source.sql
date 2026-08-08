-- Phase: connector expansion (Namibia). Seeds the sources row for the new
-- namibia-newera connector — required before any raw/normalized event from
-- it can be inserted (source_id foreign key). Metadata copied verbatim from
-- worker/src/connectors/sources/namibiaNewEra.ts's constructor.

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('namibia-newera', 'New Era (Namibia)', 'Namibia''s government-owned national newspaper (neweralive.na RSS feed) — no auth required, explicitly public. Not a raw government press-release feed; general national news from a state-owned outlet.', 'rss', '1.0.0', 900000, true)
on conflict (id) do nothing;
