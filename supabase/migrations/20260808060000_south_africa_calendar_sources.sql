-- InsightWire Global Government & Events Calendar, phase 1 (South Africa).
-- Seeds the sources rows for the two new real calendar connectors —
-- required before any raw/normalized event from them can be inserted
-- (source_id foreign key), same gap-fixing pattern as migration
-- 20260808020000 for south-africa-gov. Metadata copied verbatim from
-- worker/src/connectors/sources/southAfricaGovEvents.ts and
-- southAfricaPresidencyEvents.ts's constructors, not guessed. Both are
-- `dataset` type (structured HTML, not RSS/API) — verified live
-- 2026-08-08 that neither source publishes an RSS/Atom/JSON/ICS feed.

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('south-africa-gov-events', 'South African Government (Events Calendar)', 'Official upcoming government activities (gov.za/news/events) — presidential/ministerial engagements, campaigns, summits, and other scheduled government events. No auth required, explicitly public; no RSS/API/ICS exists for this section, so it is fetched as structured HTML using the site''s own real start_date/end_date filter.', 'dataset', '1.0.0', 3600000, true),
  ('south-africa-presidency-events', 'The South African Presidency (Principals Event Calendar)', 'Official upcoming engagements for South Africa''s government principals (thepresidency.gov.za/events-calendar) — presidential, deputy-presidential, and ministerial events. No auth required, explicitly public; no RSS/API/ICS exists, so it is fetched as structured HTML. No date filter/sort is exposed on the source, so coverage is a bounded page scan each poll, not a guaranteed-complete listing.', 'dataset', '1.0.0', 3600000, true)
on conflict (id) do nothing;
