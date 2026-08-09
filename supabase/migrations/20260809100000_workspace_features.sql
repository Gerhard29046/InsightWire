-- Phase 14: Journalist Workspace
-- Extends the three real, RLS-protected user-data tables added in Phase 6
-- (watchlists, bookmarks, alerts) with the columns the Workspace page
-- actually needs. No new tables — the schema already modeled the right
-- concepts (see docs/decisions/0015-workspace-single-user.md for the
-- companion decision on how these rows are scoped without live auth).

alter table public.watchlists
  add column active boolean not null default true,
  add column notify boolean not null default true,
  add column last_checked_at timestamptz;

comment on column public.watchlists.active is
  'Pause/resume monitoring — a paused watchlist is never included in refreshWatchlist''s live matching pass.';
comment on column public.watchlists.last_checked_at is
  'Set by workspaceApi.refreshWatchlist each time it runs the stored filters live against normalized_events. Null until the first refresh.';

create index watchlists_active_idx on public.watchlists (active);

alter table public.bookmarks
  add column notes text,
  add column tags text[] not null default '{}',
  add column priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  add column collection text,
  add column read boolean not null default false,
  add column updated_at timestamptz not null default now();

comment on column public.bookmarks.collection is
  'Free-text folder name (e.g. "Investigations", "Cape Town") — no separate collections table; distinct values + counts are computed on read from real rows.';
comment on column public.bookmarks.updated_at is
  'Bumped whenever the journalist edits notes/tags/collection, or explicitly marks a bookmark as "seen" after an event_updates-driven attention item. Compared against event_updates.created_at to detect "this bookmarked story changed since I looked at it."';

create index bookmarks_collection_idx on public.bookmarks (collection);

create index alerts_watchlist_triggered_idx on public.alerts (watchlist_id, triggered_at desc);
