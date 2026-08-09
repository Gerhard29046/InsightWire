# ADR 0015: Journalist Workspace — Single Synthetic User, No New Auth

**Status:** Accepted (implemented)
**Date:** 2026-08-09

## Context

The Journalist Workspace (saved searches, bookmarks, notifications) is built
on three real tables added in Phase 6 (`watchlists`, `bookmarks`,
`notifications`, plus `alerts`) that were designed against Supabase's
built-in `auth.users` and RLS policies scoped to `auth.uid() = user_id` — but
no auth flow was ever built. There is no Supabase Auth client anywhere in
the frontend bundle, no login/signup UI, and the Worker never checks or
forwards a JWT; every existing route already runs entirely on the
service-role key, which bypasses RLS by design (`worker/src/api/router.ts`'s
own doc comment states this explicitly). The whole app is, today,
effectively single-tenant: every visitor sees the same Intelligence API
output.

Building real multi-user auth (login/signup UI, session management, JWT
verification and forwarding through the Worker) is a substantial, separate
feature that the Workspace brief did not ask for. Blocking the Workspace on
that would mean shipping nothing.

## Decision

Introduce one fixed constant, `WORKSPACE_USER_ID`, defined server-side in
`worker/src/api/workspaceApi.ts` and `worker/src/api/bookmarksApi.ts`. Every
read/write against `watchlists`, `bookmarks`, `notifications`, and `alerts`
is scoped to this single UUID. This is a pure application-level convention,
not a security boundary — the service-role key already bypasses RLS for
every route in this app, so `auth.uid()`-scoped policies are inert either
way today. Using a stable constant (rather than, say, a random UUID per
request) means the same "user's" data persists across sessions/reloads,
which is the only property that actually matters for a single-tenant tool.

Nothing about the existing RLS policies changes: they remain correct and
ready to become load-bearing the moment real Supabase Auth is added — at
that point, `WORKSPACE_USER_ID` is deleted and replaced with the real
`auth.uid()` (or an equivalent forwarded from the frontend's session), and
every existing query/write in `workspaceApi.ts`/`bookmarksApi.ts` continues
to work unchanged, since they already filter by a `user_id` variable rather
than assuming any particular value.

## Consequences

- The Workspace is real and persists data correctly for exactly one
  implicit user — consistent with how the rest of the app already behaves.
- Multi-user support (per-journalist saved searches/bookmarks) requires a
  future, explicitly-scoped auth phase — not silently implied to exist by
  this change.
- No RLS policy or migration changes were needed for this decision itself;
  Phase 6's policies were already written correctly for the day auth
  exists.
