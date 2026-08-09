-- Remove weather, introduce natural disasters (see docs/decisions/0014-remove-weather-keep-natural-disasters.md).
--
-- InsightWire is not a weather platform. Routine weather (NWS forecasts,
-- thunderstorm/wind/rain statements) is being removed from every
-- Journalist-facing surface at the API layer (see eventsApi.ts,
-- dashboardApi.ts, mapApi.ts, entitiesApi.ts — all now exclude
-- category='weather' unconditionally). Genuinely major natural disasters
-- (earthquake, tsunami, volcanic eruption, major cyclone, catastrophic
-- flooding, major wildfire — gated by GDACS's own real alertlevel, see
-- gdacs.ts) get this new category instead.
--
-- Deliberately additive, not a rename: the existing 'weather' row in
-- `categories` is left in place so historical rows (already-stored NWS/
-- GDACS-routine events) keep a valid FK target and are never destructively
-- deleted — they simply stop being returned by any Journalist-facing query.
insert into public.categories (id, label) values
  ('natural_disasters', 'Natural Disasters');
