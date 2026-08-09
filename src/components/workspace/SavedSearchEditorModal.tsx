import { useState } from 'react'
import { EventFilters } from '../feed/EventFilters'
import { createEmptyFilters, type EventFiltersState } from '../../lib/api/types'
import { fromWatchlistFilters, toWatchlistFilters, type WatchlistFilters, type WatchlistRecord } from '../../lib/api/workspace'
import { WorkspaceModal } from './WorkspaceModal'

interface SavedSearchEditorModalProps {
  watchlist?: WatchlistRecord
  onClose: () => void
  onSave: (input: { name: string; filters: WatchlistFilters }) => Promise<unknown>
}

export function SavedSearchEditorModal({ watchlist, onClose, onSave }: SavedSearchEditorModalProps) {
  const [name, setName] = useState(watchlist?.name ?? '')
  const [filters, setFilters] = useState<EventFiltersState>(() =>
    watchlist ? fromWatchlistFilters(watchlist.filters) : createEmptyFilters(),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Give this saved search a name.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ name: name.trim(), filters: toWatchlistFilters(filters) })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this search.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkspaceModal
      title={watchlist ? 'Edit saved search' : 'New saved search'}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : watchlist ? 'Save changes' : 'Create saved search'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="watchlist-name" className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Name
          </label>
          <input
            id="watchlist-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Western Cape infrastructure"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Criteria — this monitors the same real Intelligence API the Global Events Feed uses.
          </p>
          <EventFilters filters={filters} onChange={setFilters} />
        </div>

        {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
      </div>
    </WorkspaceModal>
  )
}
