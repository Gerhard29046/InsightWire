import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, LayoutGrid, List as ListIcon, RefreshCw, Search, TrendingUp } from 'lucide-react'
import { clsx } from 'clsx'
import { TagInput } from '../components/feed/TagInput'
import { ErrorState } from '../components/feed/ErrorState'
import { EmptyState } from '../components/feed/EmptyState'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { EntityNameDisplay } from '../components/entities/EntityNameDisplay'
import { entityTypeById, entityTypes } from '../lib/entityTypes'
import { useEntitySearch } from '../hooks/useEntitySearch'
import { useEntityIntelligenceSummary } from '../hooks/useEntityIntelligenceSummary'
import type { EntityRecord, EntitySortMode, EntityType } from '../lib/api/entities'

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

const SEARCH_DEBOUNCE_MS = 300

type ViewMode = 'list' | 'card'

const SORT_OPTIONS: { id: EntitySortMode; label: string }[] = [
  { id: 'recent', label: 'Most Recent' },
  { id: 'active', label: 'Most Active' },
  { id: 'name', label: 'Name A–Z' },
]

const ACTIVITY_WINDOWS: { id: string; label: string; hours: number | null }[] = [
  { id: 'any', label: 'Any time', hours: null },
  { id: '24h', label: 'Active in 24h', hours: 24 },
  { id: '7d', label: 'Active in 7 days', hours: 24 * 7 },
  { id: '30d', label: 'Active in 30 days', hours: 24 * 30 },
]

/**
 * Three real, absolute tiers rather than a per-page relative scale (which
 * would make the same entity look "high activity" on a quiet page and "low
 * activity" on a busy one) — a subtle, honest signal, not a fabricated
 * ranking. Thresholds are a judgment call, not derived from any statistical
 * baseline; documented here rather than presented as scientifically tuned.
 */
function activityTier(mentionCount: number | undefined): 'high' | 'medium' | 'low' | 'none' {
  const n = mentionCount ?? 0
  if (n >= 10) return 'high'
  if (n >= 3) return 'medium'
  if (n >= 1) return 'low'
  return 'none'
}

function ActivityIndicator({ mentionCount }: { mentionCount: number | undefined }) {
  const tier = activityTier(mentionCount)
  const bars = { high: 3, medium: 2, low: 1, none: 0 }[tier]
  return (
    <div className="flex items-center gap-0.5" aria-hidden title={`Activity: ${tier}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={clsx('h-2.5 w-1 rounded-full', i < bars ? 'bg-sky-500 dark:bg-sky-400' : 'bg-slate-200 dark:bg-slate-700')}
        />
      ))}
    </div>
  )
}

/** A real, valid EntityType (see lib/entityTypes.ts) — used to honor an optional `?type=` deep link (e.g. the Dashboard's "Countries reporting" stat) without affecting the default, param-less experience at all. */
function initialTypeFromSearchParams(params: URLSearchParams): EntityType | 'all' {
  const requested = params.get('type')
  return requested && entityTypeById[requested as EntityType] ? (requested as EntityType) : 'all'
}

export default function EntityExplorer() {
  const [searchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState<EntityType | 'all'>(() => initialTypeFromSearchParams(searchParams))
  const [countries, setCountries] = useState<string[]>([])
  const [sort, setSort] = useState<EntitySortMode>('recent')
  const [activityWindow, setActivityWindow] = useState('any')
  const [view, setView] = useState<ViewMode>('list')
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [searchInput])

  const activeSince = useMemo(() => {
    const window = ACTIVITY_WINDOWS.find((w) => w.id === activityWindow)
    if (!window?.hours) return undefined
    return new Date(Date.now() - window.hours * 60 * 60 * 1000).toISOString()
  }, [activityWindow])

  const types = useMemo<EntityType[]>(() => (selectedType === 'all' ? [] : [selectedType]), [selectedType])

  const { entities, status, error, totalCount, hasMore, loadMore, refresh } = useEntitySearch({ search, types, countries, sort, activeSince })
  const { summary, status: summaryStatus } = useEntityIntelligenceSummary(summaryRefreshKey)

  const hasActiveFilters = search !== '' || selectedType !== 'all' || countries.length > 0 || activityWindow !== 'any'

  const handleRefresh = () => {
    refresh()
    setSummaryRefreshKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Entity Explorer</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          People, organizations, governments, and countries extracted from real tracked events — every
          entry, count, and connection here traces back to a real event in the Intelligence API.
        </p>
      </div>

      <IntelligenceSummary summary={summary} status={summaryStatus} />

      {summary && summary.recentlyActive.length > 0 && <RecentlyActive entities={summary.recentlyActive} />}

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search people, organizations, countries, locations…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-sky-800 dark:focus:bg-slate-900 dark:focus:ring-sky-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <TypeTab label="All" active={selectedType === 'all'} onClick={() => setSelectedType('all')} />
          {entityTypes.map((t) => (
            <TypeTab key={t.id} label={t.label} icon={t.icon} active={selectedType === t.id} onClick={() => setSelectedType(t.id)} />
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <LabeledControl label="Sort by">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as EntitySortMode)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </LabeledControl>

          <LabeledControl label="Activity">
            <select
              value={activityWindow}
              onChange={(e) => setActivityWindow(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {ACTIVITY_WINDOWS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </LabeledControl>

          <div className="min-w-[12rem] flex-1">
            <TagInput label="Country" placeholder="e.g. South Africa" values={countries} onChange={setCountries} />
          </div>

          <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            <ViewToggleButton icon={ListIcon} active={view === 'list'} label="List view" onClick={() => setView('list')} />
            <ViewToggleButton icon={LayoutGrid} active={view === 'card'} label="Card view" onClick={() => setView('card')} />
          </div>
        </div>
      </div>

      {status === 'not-configured' && <EmptyState variant="not-configured" />}

      {status === 'error' && <ErrorState error={error} onRetry={refresh} title="Unable to load entities." />}

      {status === 'loading' && entities.length === 0 && <LoadingSkeleton count={6} />}

      {status === 'empty' &&
        (hasActiveFilters ? (
          <EmptyState variant="no-events" onRefresh={handleRefresh} title="No entities match these filters." description="Try a different search term, type, country, or activity window." />
        ) : (
          <EmptyState
            variant="no-events"
            onRefresh={handleRefresh}
            title="No entities have been extracted from tracked intelligence yet."
            description="This reflects the actual data — nothing is fabricated to fill this page. Entities appear automatically as real events are ingested."
          />
        ))}

      {(status === 'ready' || (status === 'loading' && entities.length > 0)) && (
        <>
          <div className="flex items-center justify-between">
            {totalCount != null && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {totalCount} {totalCount === 1 ? 'entity' : 'entities'} match{hasActiveFilters ? 'ing filters' : ''}
              </p>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <RefreshCw className={status === 'loading' ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} aria-hidden />
              Refresh
            </button>
          </div>

          {view === 'list' ? <EntityListView entities={entities} /> : <EntityCardView entities={entities} />}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={status === 'loading'}
              className="mx-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={status === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
              Load more
            </button>
          )}
        </>
      )}
    </div>
  )
}

function TypeTab({ label, icon: Icon, active, onClick }: { label: string; icon?: (typeof entityTypes)[number]['icon']; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  )
}

function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      {children}
    </div>
  )
}

function ViewToggleButton({
  icon: Icon,
  active,
  label,
  onClick,
}: {
  icon: typeof ListIcon
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center justify-center rounded-md p-1.5 transition-colors',
        active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

function IntelligenceSummary({ summary, status }: { summary: ReturnType<typeof useEntityIntelligenceSummary>['summary']; status: string }) {
  if (status === 'error') return null
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-slate-900 dark:text-white">{summary ? summary.totalCount : '—'}</span>
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Entities</span>
      </div>
      {summary?.typeCounts.map((c) => {
        const meta = entityTypeById[c.type]
        return (
          <div key={c.type} className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{c.count}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{meta.label}</span>
          </div>
        )
      })}
      {status === 'loading' && !summary && <span className="text-xs text-slate-400 dark:text-slate-500">Calculating…</span>}
    </div>
  )
}

function RecentlyActive({ entities }: { entities: EntityRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        Recently Active
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {entities.map((entity) => {
          const meta = entityTypeById[entity.type]
          return (
            <li key={entity.id}>
              <Link
                to={`/entities/${encodeURIComponent(entity.id)}`}
                className="flex items-center gap-3 py-2.5 transition-colors hover:text-sky-600 dark:hover:text-sky-400"
              >
                <ActivityIndicator mentionCount={entity.mentionCount} />
                <EntityNameDisplay name={entity.name} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100" />
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <meta.icon className="h-3 w-3" aria-hidden />
                  {meta.label}
                </span>
                {entity.mentionCount != null && (
                  <span className="w-20 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                    {entity.mentionCount} event{entity.mentionCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="flex w-20 shrink-0 items-center justify-end gap-1 text-right text-xs text-slate-400 dark:text-slate-500">
                  <Clock className="h-3 w-3" aria-hidden />
                  {timeAgo(entity.lastSeenAt)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EntityListView({ entities }: { entities: EntityRecord[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="hidden items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 sm:flex">
        <span className="w-6" />
        <span className="min-w-0 flex-1">Entity</span>
        <span className="w-28 shrink-0">Type</span>
        <span className="w-20 shrink-0 text-right">Events</span>
        <span className="w-20 shrink-0 text-right">Last seen</span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {entities.map((entity) => {
          const meta = entityTypeById[entity.type]
          const tier = activityTier(entity.mentionCount)
          return (
            <li key={entity.id}>
              <Link
                to={`/entities/${encodeURIComponent(entity.id)}`}
                className="flex items-center gap-3 bg-white px-4 py-3 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60"
              >
                <ActivityIndicator mentionCount={entity.mentionCount} />
                <div className="min-w-0 flex-1">
                  <EntityNameDisplay
                    name={entity.name}
                    className={clsx('block truncate text-sm', tier === 'high' ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200')}
                  />
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 sm:hidden">
                    <meta.icon className="h-3 w-3" aria-hidden />
                    {meta.label}
                  </span>
                </div>
                <span className="hidden w-28 shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:flex">
                  <meta.icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden />
                  {meta.label}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                  {entity.mentionCount != null ? entity.mentionCount : '—'}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">{timeAgo(entity.lastSeenAt)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EntityCardView({ entities }: { entities: EntityRecord[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entities.map((entity) => {
        const meta = entityTypeById[entity.type]
        const tier = activityTier(entity.mentionCount)
        return (
          <Link
            key={entity.id}
            to={`/entities/${encodeURIComponent(entity.id)}`}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 transition-colors hover:border-sky-300 dark:border-slate-800 dark:hover:border-sky-800"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <meta.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden />
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{meta.label}</span>
              </div>
              <ActivityIndicator mentionCount={entity.mentionCount} />
            </div>
            <EntityNameDisplay
              name={entity.name}
              className={clsx('text-sm', tier === 'high' ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-800 dark:text-slate-100')}
            />
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>{entity.mentionCount != null ? `${entity.mentionCount} event${entity.mentionCount === 1 ? '' : 's'}` : entity.country ?? '—'}</span>
              <span>Last seen {timeAgo(entity.lastSeenAt)}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
