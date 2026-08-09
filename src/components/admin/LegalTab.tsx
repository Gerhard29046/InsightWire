import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { FileText, History, Plus, ScrollText, Search, ShieldCheck } from 'lucide-react'
import {
  createLegalDocumentVersion,
  fetchLegalDocumentHistory,
  fetchLegalDocuments,
  type LegalDocument,
  type LegalDocumentCategory,
} from '../../lib/api/admin'
import { ApiNotConfiguredError } from '../../lib/api/client'
import { LEGAL_CATEGORIES, sortLegalDocuments } from '../../lib/legalCategories'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'
import { EmptyState } from '../feed/EmptyState'

type Status = 'loading' | 'ready' | 'error' | 'not-configured'

function NewVersionForm({ existing, onCreated, onCancel }: { existing: LegalDocument[]; onCreated: () => void; onCancel: () => void }) {
  const [slug, setSlug] = useState(existing[0]?.slug ?? '')
  const [title, setTitle] = useState(existing[0]?.title ?? '')
  const [version, setVersion] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState<LegalDocumentCategory>(existing[0]?.category ?? 'platform')
  const [content, setContent] = useState(existing.find((d) => d.slug === slug)?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applySlug = (nextSlug: string) => {
    setSlug(nextSlug)
    const doc = existing.find((d) => d.slug === nextSlug)
    if (doc) {
      setTitle(doc.title)
      setContent(doc.content)
      setSummary(doc.summary ?? '')
      setCategory(doc.category)
    }
  }

  const submit = async () => {
    if (!slug.trim() || !title.trim() || !version.trim() || !content.trim()) {
      setError('Slug, title, version, and content are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createLegalDocumentVersion({ slug: slug.trim(), title: title.trim(), version: version.trim(), effectiveDate, summary: summary.trim() || undefined, content, category })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/40 p-4 dark:border-[var(--accent-hover)]/50 dark:bg-[var(--accent-hover)]/20">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Publish a new version</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Publishing supersedes the current active version for this slug — the prior version is kept, never deleted.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Slug
          <input
            list="existing-slugs"
            value={slug}
            onChange={(e) => applySlug(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <datalist id="existing-slugs">
            {existing.map((d) => (
              <option key={d.slug} value={d.slug} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Version
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.1" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Effective date
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Section
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as LegalDocumentCategory)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {LEGAL_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Summary
          <input value={summary} onChange={(e) => setSummary(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:col-span-2">
          Content (Markdown)
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </label>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {saving ? 'Publishing…' : 'Publish'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}

function HistoryPanel({ slug }: { slug: string }) {
  const [versions, setVersions] = useState<LegalDocument[] | null>(null)
  useEffect(() => {
    fetchLegalDocumentHistory(slug).then(setVersions).catch(() => setVersions([]))
  }, [slug])

  if (!versions) return <p className="px-4 pb-3 text-xs text-slate-400">Loading history…</p>
  return (
    <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 px-4 dark:divide-slate-800 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
      {versions.map((v) => (
        <div key={v.id} className="flex items-center justify-between py-2 text-xs">
          <span className="text-slate-600 dark:text-slate-300">
            v{v.version} · {new Date(v.effectiveDate).toLocaleDateString()}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${v.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200/60 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            {v.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function DocumentCard({ doc, expanded, onToggleHistory, adminSearch }: { doc: LegalDocument; expanded: boolean; onToggleHistory: () => void; adminSearch: string }) {
  const navigate = useNavigate()
  const open = () => navigate(`/legal/${doc.slug}`, { state: { from: 'admin', adminSearch } })

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`View ${doc.title}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open()
      }}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white transition-colors hover:border-[var(--accent)]/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[var(--accent-hover)]/50"
    >
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
          <FileText className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{doc.title}</p>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {doc.status === 'active' ? 'Active' : doc.status}
            </span>
          </div>
          {doc.summary && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{doc.summary}</p>}
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            v{doc.version} · Effective {new Date(doc.effectiveDate).toLocaleDateString()}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-600">/legal/{doc.slug}</p>

          <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
              View document →
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleHistory()
              }}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <History className="h-3 w-3" aria-hidden />
              History
            </button>
          </div>
        </div>
      </div>
      {expanded && <HistoryPanel slug={doc.slug} />}
    </div>
  )
}

export function LegalTab() {
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<unknown>(null)
  const [showForm, setShowForm] = useState(false)
  const [historySlug, setHistorySlug] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const query = searchParams.get('q') ?? ''
  const categoryFilter = searchParams.get('cat') ?? 'all'

  const setFilter = (patch: { q?: string; cat?: string }) => {
    const next = new URLSearchParams(searchParams)
    if (patch.q !== undefined) {
      if (patch.q) next.set('q', patch.q)
      else next.delete('q')
    }
    if (patch.cat !== undefined) {
      if (patch.cat && patch.cat !== 'all') next.set('cat', patch.cat)
      else next.delete('cat')
    }
    setSearchParams(next, { replace: true })
  }

  const load = useCallback(() => {
    setStatus('loading')
    fetchLegalDocuments()
      .then((docs) => {
        setDocuments(docs)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (status === 'loading' && documents.length === 0) return <LoadingSkeleton count={4} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />
  if (status === 'error') return <ErrorState error={error} onRetry={load} title="Couldn't load legal documents." />

  const sorted = sortLegalDocuments(documents)
  const q = query.trim().toLowerCase()
  const filtered = sorted.filter((doc) => {
    if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false
    if (!q) return true
    return doc.title.toLowerCase().includes(q) || (doc.summary ?? '').toLowerCase().includes(q) || doc.slug.includes(q)
  })
  const groups = LEGAL_CATEGORIES.map((c) => ({ ...c, docs: filtered.filter((d) => d.category === c.id) })).filter((g) => g.docs.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Legal &amp; Compliance</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Every published policy governing this service, with real version numbers and effective dates.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
          <ScrollText className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span className="font-semibold text-slate-700 dark:text-slate-200">{documents.length}</span>
          <span className="text-slate-500 dark:text-slate-400">Published {documents.length === 1 ? 'Policy' : 'Policies'}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          <span className="font-semibold text-slate-700 dark:text-slate-200">{documents.length}</span>
          <span className="text-slate-500 dark:text-slate-400">Active</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <History className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          Version controlled
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setFilter({ q: e.target.value })}
            placeholder="Search policies…"
            className="w-full rounded-lg border border-slate-200 py-1.5 pr-3 pl-8 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {[{ id: 'all', shortLabel: 'All' }, ...LEGAL_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter({ cat: c.id })}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                categoryFilter === c.id
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {c.shortLabel}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New version
        </button>
      </div>

      {showForm && (
        <NewVersionForm
          existing={documents}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">No policies match this search or filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.id}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">{group.label}</h3>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {group.docs.map((doc) => (
                  <DocumentCard
                    key={doc.slug}
                    doc={doc}
                    expanded={historySlug === doc.slug}
                    onToggleHistory={() => setHistorySlug(historySlug === doc.slug ? null : doc.slug)}
                    adminSearch={searchParams.toString()}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
