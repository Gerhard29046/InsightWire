-- Phase: connector expansion (Zimbabwe). Seeds the sources row for the new
-- zimbabwe-zbc connector — required before any raw/normalized event from it
-- can be inserted (source_id foreign key). Metadata copied verbatim from
-- worker/src/connectors/sources/zimbabweZbc.ts's constructor.

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('zimbabwe-zbc', 'ZBC News (Zimbabwe)', 'Zimbabwe Broadcasting Corporation''s news site (zbcnews.co.zw RSS feed) — state-owned broadcaster, no auth required, explicitly public.', 'rss', '1.0.0', 900000, true)
on conflict (id) do nothing;
