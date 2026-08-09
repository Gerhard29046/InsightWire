import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, XCircle } from 'lucide-react'
import { useAdminSources } from '../../hooks/useAdminSources'
import type { SourceRecord, SourceTestResult, UpdateSourcePatch } from '../../lib/api/admin'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'
import { EmptyState } from '../feed/EmptyState'
import { Switch } from '../ui/Switch'

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

interface EditFormState {
  country: string
  category: string
  language: string
  notes: string
}

function EditForm({ source, onSave, onCancel }: { source: SourceRecord; onSave: (patch: UpdateSourcePatch) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<EditFormState>({
    country: source.country ?? '',
    category: source.category ?? '',
    language: source.language,
    notes: source.notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onSave({
        country: form.country.trim() || null,
        category: form.category.trim() || null,
        language: form.language.trim() || 'en',
        notes: form.notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Country
        <input
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="e.g. ZA, US, EU"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Category
        <input
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Language
        <input
          value={form.language}
          onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:col-span-2">
        Notes
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}

export function SourcesTab() {
  const { sources, status, error, refresh, updateSource, testSource } = useAdminSources()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'loading' | SourceTestResult | { error: string }>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)

  if (status === 'loading' && sources.length === 0) return <LoadingSkeleton count={5} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />
  if (status === 'error') return <ErrorState error={error} onRetry={refresh} title="Couldn't load sources." />
  if (status === 'empty') {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
        <p className="text-sm text-slate-500 dark:text-slate-400">No sources are registered.</p>
      </div>
    )
  }

  const runTest = async (id: string) => {
    setTestResults((r) => ({ ...r, [id]: 'loading' }))
    try {
      const result = await testSource(id)
      setTestResults((r) => ({ ...r, [id]: result }))
    } catch (err) {
      setTestResults((r) => ({ ...r, [id]: { error: err instanceof Error ? err.message : 'Test failed' } }))
    }
  }

  const toggleEnabled = async (source: SourceRecord) => {
    setTogglingId(source.id)
    try {
      await updateSource(source.id, { enabled: !source.enabled })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Disabling a source here stops it from being polled on the next scheduled ingestion tick — this is a real
        control, not a cosmetic flag (see <code>ConnectorManager.collectDue</code>).
      </p>
      {sources.map((source) => {
        const test = testResults[source.id]
        const isEditing = editingId === source.id
        const isExpanded = expandedId === source.id
        return (
          <div key={source.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{source.name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {source.trustCategory} · {(source.trustScore * 100).toFixed(0)}%
                  </span>
                  {!source.enabled && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{source.description}</p>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {source.country ?? 'No country'} · {source.category ?? 'Uncategorized'} · {source.eventCount.toLocaleString()} events ·
                  {' '}last run {formatRelative(source.lastSuccessAt ?? source.lastFailureAt)}
                  {source.lastStatus === 'failed' && ' (failed)'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Switch
                  checked={source.enabled}
                  disabled={togglingId === source.id}
                  onChange={() => toggleEnabled(source)}
                  aria-label={`${source.enabled ? 'Disable' : 'Enable'} ${source.name}`}
                />
                <button
                  type="button"
                  onClick={() => runTest(source.id)}
                  disabled={test === 'loading'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {test === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Test'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(isEditing ? null : source.id)
                    setExpandedId(source.id)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={isExpanded ? 'Collapse' : 'Inspect'}
                  onClick={() => setExpandedId(isExpanded ? null : source.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {test && test !== 'loading' && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                {'error' in test ? (
                  <>
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
                    <span className="text-red-600 dark:text-red-400">{test.error}</span>
                  </>
                ) : test.healthy ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                    <span className="text-slate-600 dark:text-slate-300">Healthy{test.message ? ` — ${test.message}` : ''}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
                    <span className="text-red-600 dark:text-red-400">Unhealthy{test.message ? ` — ${test.message}` : ''}</span>
                  </>
                )}
              </div>
            )}

            {isExpanded && !isEditing && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:grid-cols-4">
                <p>Type: {source.type}</p>
                <p>Version: {source.version}</p>
                <p>Refresh: {Math.round(source.refreshIntervalMs / 60_000)}m</p>
                <p>Language: {source.language}</p>
                {source.feedUrl && <p className="col-span-2 truncate sm:col-span-4">Feed: {source.feedUrl}</p>}
                {source.lastError && <p className="col-span-2 text-red-500 sm:col-span-4">Last error: {source.lastError}</p>}
                {source.notes && <p className="col-span-2 sm:col-span-4">Notes: {source.notes}</p>}
              </div>
            )}

            {isEditing && (
              <EditForm
                source={source}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await updateSource(source.id, patch)
                  setEditingId(null)
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
