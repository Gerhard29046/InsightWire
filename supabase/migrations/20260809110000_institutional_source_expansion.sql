-- Phase 15: institutional source expansion (US/UK/EU). Seeds the sources
-- rows for the 6 new connectors — required before any raw/normalized event
-- from them can be inserted (source_id foreign key), same gap-fixing
-- pattern as prior source-seed migrations. Metadata copied verbatim from
-- each connector's own constructor. See
-- docs/decisions/0016-institutional-source-expansion.md.

insert into public.sources (id, name, description, type, version, refresh_interval_ms, enabled) values
  ('us-federal-reserve', 'US Federal Reserve', 'Federal Reserve Board press releases (federalreserve.gov RSS feed) — monetary policy, bank regulation/enforcement, and rate decisions. No auth required, explicitly public.', 'rss', '1.0.0', 1800000, true),
  ('us-white-house', 'The White House', 'Presidential Actions (whitehouse.gov/presidential-actions RSS feed) — executive orders, proclamations, nominations. No auth required, explicitly public.', 'rss', '1.0.0', 900000, true),
  ('uk-government', 'UK Government', 'News and communications across UK government departments (gov.uk Atom feed) — no auth required, explicitly public.', 'rss', '1.0.0', 900000, true),
  ('bank-of-england', 'Bank of England', 'News, minutes, and statistical notices (bankofengland.co.uk RSS feed) — no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true),
  ('eu-commission', 'European Commission', 'Press releases and daily news (ec.europa.eu/commission/presscorner RSS feed) — no auth required, explicitly public.', 'rss', '1.0.0', 1800000, true),
  ('ecb', 'European Central Bank', 'Press releases, speeches, and press conferences (ecb.europa.eu RSS feed) — no auth required, explicitly public.', 'rss', '1.0.0', 3600000, true)
on conflict (id) do nothing;
