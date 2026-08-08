import { clsx } from 'clsx'
import { Search } from 'lucide-react'
import { categories } from '../../lib/categories'
import { severityMeta, severityOrder } from '../../lib/severity'
import { languages, regions, timeRangeOptions } from '../../lib/api/taxonomy'
import type { EventFiltersState, EventTimeRange } from '../../lib/api/types'
import { TagInput } from './TagInput'

interface EventFiltersProps {
  filters: EventFiltersState
  onChange: (filters: EventFiltersState) => void
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const chipBase = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'
const chipInactive =
  'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
const chipActiveNeutral =
  'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300'

export function EventFilters({ filters, onChange }: EventFiltersProps) {
  const set = <K extends keyof EventFiltersState>(key: K, value: EventFiltersState[K]) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="text"
          aria-label="Search events"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search headlines, entities, tags…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TagInput
          label="Country"
          placeholder="Add a country…"
          values={filters.countries}
          onChange={(v) => set('countries', v)}
        />
        <TagInput
          label="Source"
          placeholder="Add a source…"
          values={filters.sources}
          onChange={(v) => set('sources', v)}
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Region</p>
        <div className="flex flex-wrap gap-1.5">
          {regions.map((region) => (
            <button
              key={region}
              type="button"
              onClick={() => set('regions', toggleValue(filters.regions, region))}
              className={clsx(chipBase, filters.regions.includes(region) ? chipActiveNeutral : chipInactive)}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const active = filters.categories.includes(cat.id)
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => set('categories', toggleValue(filters.categories, cat.id))}
                className={clsx(
                  'inline-flex items-center gap-1',
                  chipBase,
                  active ? 'border-transparent text-white' : chipInactive,
                )}
                style={active ? { backgroundColor: `var(${cat.colorVar})` } : undefined}
              >
                <cat.icon className="h-3 w-3" aria-hidden />
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Importance</p>
        <div className="flex flex-wrap gap-1.5">
          {severityOrder.map((sev) => {
            const meta = severityMeta[sev]
            const active = filters.importance.includes(sev)
            return (
              <button
                key={sev}
                type="button"
                onClick={() => set('importance', toggleValue(filters.importance, sev))}
                className={clsx(
                  'inline-flex items-center gap-1',
                  chipBase,
                  active ? 'border-transparent text-white' : chipInactive,
                )}
                style={active ? { backgroundColor: `var(${meta.colorVar})` } : undefined}
              >
                <meta.icon className="h-3 w-3" aria-hidden />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Language</p>
        <div className="flex flex-wrap gap-1.5">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => set('languages', toggleValue(filters.languages, lang.code))}
              className={clsx(chipBase, filters.languages.includes(lang.code) ? chipActiveNeutral : chipInactive)}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="feed-date-from">
            From date
          </label>
          <input
            id="feed-date-from"
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => set('dateFrom', e.target.value || null)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="feed-date-to">
            To date
          </label>
          <input
            id="feed-date-to"
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => set('dateTo', e.target.value || null)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="feed-time-range">
            Time range
          </label>
          <select
            id="feed-time-range"
            value={filters.timeRange}
            onChange={(e) => set('timeRange', e.target.value as EventTimeRange)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {timeRangeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => set('verifiedOnly', e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
          />
          Verified only
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={filters.liveOnly}
            onChange={(e) => set('liveOnly', e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
          />
          Live events
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={filters.futureOnly}
            onChange={(e) => set('futureOnly', e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
          />
          Future events
        </label>
      </div>
    </div>
  )
}
