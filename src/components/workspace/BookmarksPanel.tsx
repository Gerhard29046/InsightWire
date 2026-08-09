import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bookmark, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { EmptyState } from '../feed/EmptyState'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { TagInput } from '../feed/TagInput'
import type { BookmarkPriority, BookmarkRecord, UpdateBookmarkPatch } from '../../lib/api/bookmarks'
import type { BookmarksStatus } from '../../hooks/useBookmarks'

const PRIORITY_META: Record<BookmarkPriority, { label: string; className: string }> = {
  low: { label: 'Low priority', className: 'text-slate-400 dark:text-slate-500' },
  medium: { label: 'Medium priority', className: 'text-[var(--accent)]' },
  high: { label: 'High priority', className: 'text-red-500' },
}

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

interface BookmarkEditFormProps {
  bookmark: BookmarkRecord
  collections: string[]
  onSave: (patch: UpdateBookmarkPatch) => Promise<unknown>
  onCancel: () => void
}

function BookmarkEditForm({ bookmark, collections, onSave, onCancel }: BookmarkEditFormProps) {
  const [notes, setNotes] = useState(bookmark.notes ?? '')
  const [tags, setTags] = useState(bookmark.tags)
  const [priority, setPriority] = useState<BookmarkPriority>(bookmark.priority)
  const [collection, setCollection] = useState(bookmark.collection ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ notes: notes.trim() || null, tags, priority, collection: collection.trim() || null })
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Why did you save this?</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Add a note for future you…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>
      <TagInput label="Tags" placeholder="Add a tag…" values={tags} onChange={setTags} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Priority</label>
          <div className="flex gap-1.5">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  priority === p
                    ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent-hover)] dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]'
                    : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bookmark-collection" className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Collection
          </label>
          <input
            id="bookmark-collection"
            type="text"
            list="workspace-collections"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="e.g. Investigations"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <datalist id="workspace-collections">
            {collections.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

interface BookmarksPanelProps {
  bookmarks: BookmarkRecord[]
  status: BookmarksStatus
  onUpdate: (id: string, patch: UpdateBookmarkPatch) => Promise<unknown>
  onRemove: (id: string) => Promise<unknown>
}

export function BookmarksPanel({ bookmarks, status, onUpdate, onRemove }: BookmarksPanelProps) {
  const [activeCollection, setActiveCollection] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const collections = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of bookmarks) {
      if (b.collection) counts.set(b.collection, (counts.get(b.collection) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [bookmarks])

  const visible = activeCollection ? bookmarks.filter((b) => b.collection === activeCollection) : bookmarks

  if (status === 'loading') return <LoadingSkeleton count={3} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />

  if (status === 'empty' || bookmarks.length === 0) {
    return (
      <div className="flex min-h-[16vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Bookmark className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No bookmarks yet.</p>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          Bookmark any real event from the Feed, Dashboard, or Entity pages — it'll show up here as part of your research library.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {collections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCollection(null)}
            className={clsx(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              activeCollection === null
                ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent-hover)] dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300',
            )}
          >
            All ({bookmarks.length})
          </button>
          {collections.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveCollection(name)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                activeCollection === name
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--accent-hover)] dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300',
              )}
            >
              {name} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((b, i) => {
          const priorityMeta = PRIORITY_META[b.priority]
          const isEditing = editingId === b.id
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03, ease: 'easeOut' }}
              className={clsx(
                'flex flex-col rounded-xl border p-4 dark:border-slate-800',
                b.read ? 'border-slate-200' : 'border-[var(--accent)]/25 bg-[var(--accent)]/30 dark:border-[var(--accent-hover)]/15 dark:bg-[var(--accent-hover)]/10',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{b.event.title}</h3>
                {!b.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label="Unread" />}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Source: {b.event.source} · Saved {timeAgo(b.createdAt)}
              </p>

              {b.notes && <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">"{b.notes}"</p>}

              {(b.tags.length > 0 || b.collection) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {b.collection && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      {b.collection}
                    </span>
                  )}
                  {b.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className={clsx('mt-2 text-[11px] font-medium', priorityMeta.className)}>{priorityMeta.label}</p>

              {isEditing ? (
                <BookmarkEditForm
                  bookmark={b}
                  collections={collections.map(([name]) => name)}
                  onSave={(patch) => onUpdate(b.id, patch)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <Link
                    to={`/feed/${encodeURIComponent(b.event.id)}`}
                    onClick={() => {
                      if (!b.read) void onUpdate(b.id, { read: true })
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditingId(b.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(b.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
