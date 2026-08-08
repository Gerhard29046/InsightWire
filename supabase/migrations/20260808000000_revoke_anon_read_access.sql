-- Phase 8 (Intelligence API): revoke the anon SELECT access opened in
-- 20260807190000_anon_read_access.sql. That migration was an explicit,
-- temporary stopgap for a local frontend preview before a real server-side
-- API existed (docs/decisions/0008-frontend-preview.md). Now that
-- worker/src/api/router.ts serves /events and /events/:id using the
-- service_role key server-side, the frontend needs zero Supabase
-- credentials — the anon key and the wide-open read policy it required are
-- both removed. See docs/decisions/0009-intelligence-api.md.
--
-- User-owned tables were never touched by the anon-read migration and are
-- not touched here either.

revoke select on
  public.categories,
  public.countries,
  public.cities,
  public.tags,
  public.sources,
  public.organizations,
  public.people,
  public.normalized_events,
  public.raw_events,
  public.connector_runs,
  public.event_updates,
  public.event_relationships,
  public.event_organizations,
  public.event_people,
  public.event_tags,
  public.ai_summaries,
  public.embeddings,
  public.event_confirming_sources
from anon;

alter policy "categories are readable by authenticated users" on public.categories to authenticated;
alter policy "countries are readable by authenticated users" on public.countries to authenticated;
alter policy "cities are readable by authenticated users" on public.cities to authenticated;
alter policy "tags are readable by authenticated users" on public.tags to authenticated;
alter policy "sources are readable by authenticated users" on public.sources to authenticated;
alter policy "organizations are readable by authenticated users" on public.organizations to authenticated;
alter policy "people are readable by authenticated users" on public.people to authenticated;
alter policy "normalized_events are readable by authenticated users" on public.normalized_events to authenticated;
alter policy "raw_events are readable by authenticated users" on public.raw_events to authenticated;
alter policy "connector_runs are readable by authenticated users" on public.connector_runs to authenticated;
alter policy "event_updates are readable by authenticated users" on public.event_updates to authenticated;
alter policy "event_relationships are readable by authenticated users" on public.event_relationships to authenticated;
alter policy "event_organizations are readable by authenticated users" on public.event_organizations to authenticated;
alter policy "event_people are readable by authenticated users" on public.event_people to authenticated;
alter policy "event_tags are readable by authenticated users" on public.event_tags to authenticated;
alter policy "ai_summaries are readable by authenticated users" on public.ai_summaries to authenticated;
alter policy "embeddings are readable by authenticated users" on public.embeddings to authenticated;
alter policy "event_confirming_sources are readable by authenticated users" on public.event_confirming_sources to authenticated;

comment on schema public is
  'InsightWire: reference/intelligence tables are authenticated-read only (anon access from migration 20260807190000 was revoked in 20260808000000 once the Worker Intelligence API took over serving the frontend). User-owned tables remain auth.uid()-scoped.';
