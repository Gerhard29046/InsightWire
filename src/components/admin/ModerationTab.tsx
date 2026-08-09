import { useState } from 'react'
import { clsx } from 'clsx'
import { useAdminReports } from '../../hooks/useAdminReports'
import type { ReportStatus } from '../../lib/api/admin'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'

const FILTERS: { id: ReportStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In review' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
]

const CATEGORY_LABEL: Record<string, string> = {
  inaccurate_information: 'Inaccurate information',
  privacy_violation: 'Privacy violation',
  personal_information: 'Personal information exposed',
  copyright_complaint: 'Copyright complaint',
  unlawful_content: 'Unlawful content',
  harmful_content: 'Harmful content',
  source_correction: 'Source correction request',
  impersonation: 'Impersonation',
  other: 'Other',
}

function ReportRow({ report, onUpdate }: { report: ReturnType<typeof useAdminReports>['reports'][number]; onUpdate: (status: ReportStatus, notes?: string) => Promise<void> }) {
  const [notes, setNotes] = useState(report.resolutionNotes ?? '')
  const [busy, setBusy] = useState<ReportStatus | null>(null)

  const act = async (status: ReportStatus) => {
    setBusy(status)
    try {
      await onUpdate(status, notes.trim() || undefined)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {CATEGORY_LABEL[report.category] ?? report.category}
        </span>
        <span className="text-[11px] text-slate-400">{new Date(report.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{report.description}</p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Target: {report.targetType}{report.targetId ? ` (${report.targetId})` : ''}
        {report.reporterContact ? ` · Contact: ${report.reporterContact}` : ''}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Resolution notes (internal)"
          rows={2}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <div className="flex flex-wrap gap-2">
          {(['in_review', 'actioned', 'dismissed'] as ReportStatus[])
            .filter((s) => s !== report.status)
            .map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy !== null}
                onClick={() => act(s)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {busy === s ? 'Saving…' : `Mark ${s.replace('_', ' ')}`}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

export function ModerationTab() {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open')
  const { reports, status, error, refresh, updateReport } = useAdminReports(filter === 'all' ? undefined : filter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.id ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {status === 'loading' && <LoadingSkeleton count={3} />}
      {status === 'error' && <ErrorState error={error} onRetry={refresh} title="Couldn't load reports." />}
      {status === 'empty' && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">No {filter === 'all' ? '' : filter.replace('_', ' ')} reports.</p>
        </div>
      )}
      {status === 'ready' && (
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} onUpdate={(s, notes) => updateReport(report.id, s, notes).then(() => undefined)} />
          ))}
        </div>
      )}
    </div>
  )
}
