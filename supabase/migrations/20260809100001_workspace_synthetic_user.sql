-- Phase 14 follow-up: `watchlists`/`bookmarks`/`notifications` all have a
-- real `user_id uuid references auth.users(id)` foreign key — the
-- service-role key bypasses RLS, but never bypasses a foreign key
-- constraint. WORKSPACE_USER_ID (worker/src/api/workspaceApi.ts) needs an
-- actual `auth.users` row to reference, found missing only by a live insert
-- against the real linked project actually failing
-- ("violates foreign key constraint watchlists_user_id_fkey") — auth.users
-- was, as expected, completely empty (no auth flow has ever run against
-- this project). See docs/decisions/0015-workspace-single-user.md.
--
-- Every column on auth.users other than `id` is nullable or has a default,
-- so this is the minimal valid row — not a real account, no email/password,
-- never intended to authenticate.
insert into auth.users (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
