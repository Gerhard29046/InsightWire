import { useAdminAuditLog } from '../../hooks/useAdminAuditLog'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'

export function AuditTab() {
  const { entries, status, error, refresh } = useAdminAuditLog()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Every admin write (source edits, config changes, legal publishing, moderation decisions) records a real entry
        here — actor, action, resource, and timestamp. Nothing on this list is fabricated or backfilled.
      </p>
      {status === 'loading' && <LoadingSkeleton count={4} />}
      {status === 'error' && <ErrorState error={error} onRetry={refresh} title="Couldn't load the audit log." />}
      {status === 'empty' && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">No administrative actions have been recorded yet.</p>
        </div>
      )}
      {status === 'ready' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Resource</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{entry.actor}</td>
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200">{entry.action}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {entry.resourceType}
                    {entry.resourceId ? ` · ${entry.resourceId}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
