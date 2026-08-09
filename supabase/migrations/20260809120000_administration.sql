-- Phase 16: Administration control centre.
-- New tables backing: site configuration (single source of truth), the
-- future user/profile framework (empty until Supabase Auth is connected),
-- versioned legal/compliance documents, the content-moderation workflow,
-- and the admin audit log. Also extends `sources` with real, admin-editable
-- metadata that the connector code currently only holds in TypeScript
-- (country/category/language/url) — see the comment on that ALTER for why
-- this is necessary for "Edit" to be a real feature, not a fake one.

-- ---------------------------------------------------------------------------
-- Site configuration — single source of truth for Appearance/Navigation/
-- Notification-default settings. One row per config domain (not one giant
-- blob) so a partial update never risks clobbering unrelated settings.
-- ---------------------------------------------------------------------------

create table public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Single source of truth for site configuration (Appearance/Navigation/Notifications). Read by the frontend once via GET /admin/config and provided through a React context — never scattered across component state.';

insert into public.app_config (key, value, description) values
  ('appearance', '{"defaultTheme": "system", "accentColor": "sky", "density": "comfortable"}', 'Default theme, accent colour, and information density for the app shell.'),
  ('navigation', '{"visibleItems": ["dashboard","feed","calendar","alerts","entities","timeline","map","workspace","assistant","admin"]}', 'Which top-level navigation items are shown. Removing an id hides that nav entry app-wide.'),
  ('notifications', '{"breakingAlerts": true, "savedSearchAlerts": true, "entityAlerts": false, "systemAlerts": true, "frequency": "immediate", "browserNotifications": false}', 'Default notification preferences, applied until a per-user preference system exists (see profiles.preferences).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Profiles — the future 1:1 companion to auth.users. Deliberately empty:
-- no auth flow exists yet (see docs/decisions/0015-workspace-single-user.md),
-- so this table has zero rows by design, not a bug. When Supabase Auth is
-- connected, a row here is created per real signed-up user; `role`/`status`
-- are what the Roles & Permissions framework will actually check
-- server-side once that's wired up.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'journalist' check (role in ('administrator', 'editor', 'journalist', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended', 'invited')),
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Future 1:1 companion to auth.users — role/status/preferences. Empty until real Supabase Auth exists; the app must render "No registered users yet" for a genuinely empty table, never a fabricated user.';

-- ---------------------------------------------------------------------------
-- Legal & compliance documents — versioned. Only one row per (slug, status
-- = active) is meant to be live at a time (enforced in the API layer, not a
-- DB constraint, so a draft can exist alongside an active version).
-- ---------------------------------------------------------------------------

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  version text not null,
  effective_date date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'superseded')),
  summary text,
  content text not null,
  created_at timestamptz not null default now(),
  unique (slug, version)
);

comment on table public.legal_documents is
  'Versioned legal/compliance policy documents (Terms, Privacy, POPIA notice, etc.). Superseding a document sets the old row''s status to superseded rather than deleting it, so prior versions remain available for audit/consent-history purposes once authentication exists.';

create index legal_documents_slug_status_idx on public.legal_documents (slug, status);

-- ---------------------------------------------------------------------------
-- Content moderation / removal requests.
-- ---------------------------------------------------------------------------

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in (
      'inaccurate_information', 'privacy_violation', 'personal_information', 'copyright_complaint',
      'unlawful_content', 'harmful_content', 'source_correction', 'impersonation', 'other'
    )
  ),
  target_type text not null check (target_type in ('event', 'entity', 'source', 'other')),
  target_id text,
  description text not null,
  reporter_contact text,
  status text not null default 'open' check (status in ('open', 'in_review', 'actioned', 'dismissed')),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.content_reports is
  'Report -> Review -> Restrict/Remove/Correct/Restore workflow. Empty table renders "No active reports" honestly — never fabricated.';

create index content_reports_status_idx on public.content_reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Admin audit log.
-- ---------------------------------------------------------------------------

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Text, not a FK to auth.users/profiles: there is no real auth yet, so the
  -- actor is WORKSPACE_USER_ID (see workspaceApi.ts) or 'system' until a
  -- real authenticated actor exists to record instead.
  actor text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Real admin actions only (source enable/disable, config changes, moderation decisions) — never backfilled with fabricated history. Empty renders "No audit activity" honestly.';

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Extend `sources` with real, admin-editable metadata. Country/category/
-- language currently only exist as static TypeScript properties on each
-- connector class (supportedCountries/supportedCategories) — there was no
-- DB column an admin "Edit" action could actually change. Adding them here,
-- backfilled from each connector's real current config, makes "Edit" a real
-- feature rather than a form that writes nowhere.
-- ---------------------------------------------------------------------------

alter table public.sources
  add column country text,
  add column category text,
  add column language text not null default 'en',
  add column feed_url text,
  add column notes text;

update public.sources set country = 'Global', category = 'science', feed_url = 'https://www.nasa.gov/feed/' where id = 'nasa-news';
update public.sources set country = 'Global', category = 'government', feed_url = 'https://www.who.int/rss-feeds/news-english.xml' where id = 'who-news';
update public.sources set country = 'Global', category = 'government', feed_url = 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' where id = 'un-news';
update public.sources set country = 'Global', category = 'natural_disasters', feed_url = 'https://www.gdacs.org/xml/rss.xml' where id = 'gdacs-alerts';
update public.sources set country = 'South Africa', category = 'government', feed_url = 'https://www.gov.za/rss/speeches-feed' where id = 'south-africa-gov';
update public.sources set country = 'Namibia', category = 'government', feed_url = 'https://neweralive.na/feed/' where id = 'namibia-newera';
update public.sources set country = 'Zimbabwe', category = 'government', feed_url = 'https://www.zbcnews.co.zw/feed/' where id = 'zimbabwe-zbc';
update public.sources set country = 'South Africa', category = 'government', feed_url = 'https://www.sanews.gov.za/rss.xml' where id = 'sanews';
update public.sources set country = 'South Africa', category = 'government' where id = 'sanews-features';
update public.sources set country = 'South Africa', category = 'government' where id = 'south-africa-gov-events';
update public.sources set country = 'South Africa', category = 'government' where id = 'south-africa-presidency-events';
update public.sources set country = 'United States', category = 'markets', feed_url = 'https://www.federalreserve.gov/feeds/press_all.xml' where id = 'us-federal-reserve';
update public.sources set country = 'United States', category = 'government', feed_url = 'https://www.whitehouse.gov/presidential-actions/feed/' where id = 'us-white-house';
update public.sources set country = 'United Kingdom', category = 'government', feed_url = 'https://www.gov.uk/search/news-and-communications.atom' where id = 'uk-government';
update public.sources set country = 'United Kingdom', category = 'markets', feed_url = 'https://www.bankofengland.co.uk/rss/news' where id = 'bank-of-england';
update public.sources set country = 'European Union', category = 'government', feed_url = 'https://ec.europa.eu/commission/presscorner/api/rss?language=en' where id = 'eu-commission';
update public.sources set country = 'European Union', category = 'markets', feed_url = 'https://www.ecb.europa.eu/rss/press.html' where id = 'ecb';
update public.sources set country = 'United States', category = 'natural_disasters', feed_url = 'https://api.weather.gov/alerts/active.atom' where id = 'nws-alerts';

-- ---------------------------------------------------------------------------
-- RLS + grants. Same two shapes this project already uses (see
-- 20260807180007_rls_policies.sql): reference-style tables get
-- authenticated-read-only; user-owned tables get owner-scoped CRUD. Note
-- these are inert for the app's actual live traffic today, same as every
-- other table — the Worker always reads/writes via the service-role key,
-- which bypasses RLS by design (see docs/decisions/0015). This is framework
-- readiness for when a real Supabase Auth session exists, not what
-- currently gates anything.
-- ---------------------------------------------------------------------------

grant select on public.app_config, public.legal_documents to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert on public.content_reports to authenticated;
grant update on public.content_reports to authenticated;
grant select on public.admin_audit_log to authenticated;

alter table public.app_config enable row level security;
create policy "app_config is readable by authenticated users"
  on public.app_config for select to authenticated using (true);

alter table public.legal_documents enable row level security;
create policy "legal_documents are readable by authenticated users"
  on public.legal_documents for select to authenticated using (true);

alter table public.profiles enable row level security;
create policy "users can view their own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users can update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

alter table public.content_reports enable row level security;
create policy "authenticated users can file a content report"
  on public.content_reports for insert to authenticated with check (true);
create policy "authenticated users can view content reports"
  on public.content_reports for select to authenticated using (true);
create policy "authenticated users can update content report status"
  on public.content_reports for update to authenticated using (true) with check (true);

alter table public.admin_audit_log enable row level security;
create policy "admin_audit_log is readable by authenticated users"
  on public.admin_audit_log for select to authenticated using (true);
