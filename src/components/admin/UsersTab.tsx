import { ShieldAlert, UserCircle } from 'lucide-react'
import { useAdminProfiles } from '../../hooks/useAdminProfiles'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'
import { EmptyState } from '../feed/EmptyState'

const ROLES: { name: string; description: string }[] = [
  { name: 'Administrator', description: 'Full access to Administration, source management, and legal/compliance tooling.' },
  { name: 'Editor', description: 'Manage saved searches, bookmarks, and moderation queues across the newsroom.' },
  { name: 'Journalist', description: 'Standard research access: Feed, Entities, Timeline, Workspace.' },
  { name: 'Viewer', description: 'Read-only access to the intelligence surfaces.' },
]

export function UsersTab() {
  const { profiles, status, error, refresh } = useAdminProfiles()

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="text-amber-900 dark:text-amber-200">
          No authentication is configured. The <code>profiles</code> table exists and is schema-ready for a future
          Supabase Auth integration (1:1 with <code>auth.users</code>), but it is never seeded with placeholder
          accounts. Roles below are a framework only — nothing currently enforces them, and no route in this app is
          access-controlled by role.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Registered users</h2>
        {status === 'loading' && <LoadingSkeleton count={2} />}
        {status === 'not-configured' && <EmptyState variant="not-configured" />}
        {status === 'error' && <ErrorState error={error} onRetry={refresh} title="Couldn't load user profiles." />}
        {status === 'empty' && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-800">
            <UserCircle className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" aria-hidden />
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">No registered users yet.</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              This is accurate, not a placeholder — the platform has no sign-in flow yet.
            </p>
          </div>
        )}
        {status === 'ready' && (
          <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{profile.displayName ?? profile.id}</span>
                <span className="text-xs text-slate-400 capitalize">{profile.role} · {profile.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Roles &amp; permissions framework</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <div key={role.name} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{role.name}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{role.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          When authentication ships, authorization must be enforced server-side (in the Worker, against the
          authenticated user's role) — never by hiding buttons in the client, and never by trusting a client-supplied
          user ID.
        </p>
      </section>
    </div>
  )
}
