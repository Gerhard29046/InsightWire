-- Phase: connector expansion (South Africa). Seeds the sources row for the
-- new south-africa-gov connector — required before any raw/normalized event
-- from it can be inserted (source_id foreign key), same gap-fixing pattern
-- as migration 20260807180008 for the Phase 6.5 connectors. Metadata copied
-- verbatim from worker/src/connectors/sources/southAfricaGov.ts's
-- constructor, not guessed.

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('south-africa-gov', 'South African Government (Cabinet & Speeches)', 'Cabinet statements and government speeches (gov.za speeches-feed) — official South African government communication, no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true)
on conflict (id) do nothing;
