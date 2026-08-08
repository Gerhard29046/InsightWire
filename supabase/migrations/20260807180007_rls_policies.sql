-- Phase 6: Database Schema
-- RLS for every table created in this migration set, plus the explicit
-- GRANTs current Supabase projects need alongside policies (new projects no
-- longer auto-expose tables to anon/authenticated — see supabase/config.toml's
-- `auto_expose_new_tables` comment).
--
-- Two shapes, applied uniformly:
--   1. Reference/intelligence tables: readable by `authenticated` only (not
--      `anon` — "AI-powered newsroom intelligence platform," not a public
--      news website, per the README's Vision section). Writes only happen
--      via the Worker's service_role key, which bypasses RLS by design in
--      Supabase and never reaches the frontend — no policy is needed or
--      given for authenticated/anon writes on these tables.
--   2. User-owned tables: full CRUD scoped to auth.uid() = user_id (or, for
--      `alerts`, ownership via the parent watchlist).
--
-- Whether intelligence data should ever be anon-readable (e.g. a public
-- teaser feed) is a business/subscription-tiering question nobody has
-- answered yet — this is the more conservative default, not a final answer.

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Reference/intelligence tables: authenticated-read only.
-- ---------------------------------------------------------------------------

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
  public.embeddings
to authenticated;

alter table public.categories enable row level security;
create policy "categories are readable by authenticated users"
  on public.categories for select to authenticated using (true);

alter table public.countries enable row level security;
create policy "countries are readable by authenticated users"
  on public.countries for select to authenticated using (true);

alter table public.cities enable row level security;
create policy "cities are readable by authenticated users"
  on public.cities for select to authenticated using (true);

alter table public.tags enable row level security;
create policy "tags are readable by authenticated users"
  on public.tags for select to authenticated using (true);

alter table public.sources enable row level security;
create policy "sources are readable by authenticated users"
  on public.sources for select to authenticated using (true);

alter table public.organizations enable row level security;
create policy "organizations are readable by authenticated users"
  on public.organizations for select to authenticated using (true);

alter table public.people enable row level security;
create policy "people are readable by authenticated users"
  on public.people for select to authenticated using (true);

alter table public.normalized_events enable row level security;
create policy "normalized_events are readable by authenticated users"
  on public.normalized_events for select to authenticated using (true);

alter table public.raw_events enable row level security;
create policy "raw_events are readable by authenticated users"
  on public.raw_events for select to authenticated using (true);

alter table public.connector_runs enable row level security;
create policy "connector_runs are readable by authenticated users"
  on public.connector_runs for select to authenticated using (true);

alter table public.event_updates enable row level security;
create policy "event_updates are readable by authenticated users"
  on public.event_updates for select to authenticated using (true);

alter table public.event_relationships enable row level security;
create policy "event_relationships are readable by authenticated users"
  on public.event_relationships for select to authenticated using (true);

alter table public.event_organizations enable row level security;
create policy "event_organizations are readable by authenticated users"
  on public.event_organizations for select to authenticated using (true);

alter table public.event_people enable row level security;
create policy "event_people are readable by authenticated users"
  on public.event_people for select to authenticated using (true);

alter table public.event_tags enable row level security;
create policy "event_tags are readable by authenticated users"
  on public.event_tags for select to authenticated using (true);

alter table public.ai_summaries enable row level security;
create policy "ai_summaries are readable by authenticated users"
  on public.ai_summaries for select to authenticated using (true);

alter table public.embeddings enable row level security;
create policy "embeddings are readable by authenticated users"
  on public.embeddings for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- User-owned tables: full CRUD scoped to the owning user.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.watchlists,
  public.notifications,
  public.bookmarks
to authenticated;

grant select, update on public.alerts to authenticated;

alter table public.watchlists enable row level security;

create policy "users can view their own watchlists"
  on public.watchlists for select to authenticated
  using (auth.uid() = user_id);

create policy "users can create their own watchlists"
  on public.watchlists for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own watchlists"
  on public.watchlists for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own watchlists"
  on public.watchlists for delete to authenticated
  using (auth.uid() = user_id);

alter table public.bookmarks enable row level security;

create policy "users can view their own bookmarks"
  on public.bookmarks for select to authenticated
  using (auth.uid() = user_id);

create policy "users can create their own bookmarks"
  on public.bookmarks for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can delete their own bookmarks"
  on public.bookmarks for delete to authenticated
  using (auth.uid() = user_id);

alter table public.notifications enable row level security;

create policy "users can view their own notifications"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "users can update their own notifications"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- `alerts` has no direct user_id — ownership is via its parent watchlist.
-- Read/mark-as-read only for now; alerts are meant to be system-generated
-- (a future matching job, run as service_role) rather than user-authored,
-- so no insert/delete policy is given here. Revisit if a "dismiss" feature
-- needs users to delete their own alert rows.
alter table public.alerts enable row level security;

create policy "users can view alerts for their own watchlists"
  on public.alerts for select to authenticated
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = alerts.watchlist_id
        and w.user_id = auth.uid()
    )
  );

create policy "users can mark their own alerts read"
  on public.alerts for update to authenticated
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = alerts.watchlist_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.watchlists w
      where w.id = alerts.watchlist_id
        and w.user_id = auth.uid()
    )
  );
