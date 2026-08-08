-- Phase: connector expansion (SAnews). Seeds the sources rows for the two
-- new sanews/sanews-features connectors — required before any
-- raw/normalized event from either can be inserted (source_id foreign
-- key). Metadata copied verbatim from worker/src/connectors/sources/sanews.ts's
-- constructors.

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('sanews', 'SAnews', 'South African Government News Agency breaking news (sanews.gov.za/south-africa-news-stories.xml) — published by the Department of Communications, no auth required, explicitly public.', 'rss', '1.0.0', 900000, true),
  ('sanews-features', 'SAnews Features', 'South African Government News Agency long-form feature stories (sanews.gov.za/features.xml) — published by the Department of Communications, no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true)
on conflict (id) do nothing;
