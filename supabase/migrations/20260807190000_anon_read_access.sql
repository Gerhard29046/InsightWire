-- Phase 8 (frontend preview): open anon SELECT on reference/intelligence
-- tables, per the user's explicit choice — 0007_rls_policies.sql's own
-- comment flagged this as "a business/subscription-tiering question nobody
-- has answered yet... the more conservative default, not a final answer."
-- The user has now answered it: they want to see real event data in a
-- local frontend preview without building an auth flow first.
--
-- Scope is deliberately narrower than "everything": only the
-- reference/intelligence tables that already granted `authenticated`
-- SELECT (0007/0008) are opened to `anon` here. User-owned tables
-- (watchlists, bookmarks, notifications, alerts) are untouched — opening
-- personal data to anon was never part of what was asked, and stays
-- scoped to `auth.uid()` regardless of this migration.

grant select on
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
to anon;

alter policy "categories are readable by authenticated users" on public.categories to anon, authenticated;
alter policy "countries are readable by authenticated users" on public.countries to anon, authenticated;
alter policy "cities are readable by authenticated users" on public.cities to anon, authenticated;
alter policy "tags are readable by authenticated users" on public.tags to anon, authenticated;
alter policy "sources are readable by authenticated users" on public.sources to anon, authenticated;
alter policy "organizations are readable by authenticated users" on public.organizations to anon, authenticated;
alter policy "people are readable by authenticated users" on public.people to anon, authenticated;
alter policy "normalized_events are readable by authenticated users" on public.normalized_events to anon, authenticated;
alter policy "raw_events are readable by authenticated users" on public.raw_events to anon, authenticated;
alter policy "connector_runs are readable by authenticated users" on public.connector_runs to anon, authenticated;
alter policy "event_updates are readable by authenticated users" on public.event_updates to anon, authenticated;
alter policy "event_relationships are readable by authenticated users" on public.event_relationships to anon, authenticated;
alter policy "event_organizations are readable by authenticated users" on public.event_organizations to anon, authenticated;
alter policy "event_people are readable by authenticated users" on public.event_people to anon, authenticated;
alter policy "event_tags are readable by authenticated users" on public.event_tags to anon, authenticated;
alter policy "ai_summaries are readable by authenticated users" on public.ai_summaries to anon, authenticated;
alter policy "embeddings are readable by authenticated users" on public.embeddings to anon, authenticated;
alter policy "event_confirming_sources are readable by authenticated users" on public.event_confirming_sources to anon, authenticated;

comment on schema public is
  'InsightWire: reference/intelligence tables are anon-readable as of migration 20260807190000 (a deliberate, explicit choice for local frontend preview — see that migration''s header comment). User-owned tables remain auth.uid()-scoped.';
