import { Search, X } from 'lucide-react'

interface WorkspaceFilterBarProps {
  query: string
  onQueryChange: (query: string) => void
}

/** One real, fast filter across saved searches and bookmarks — not five separate scoped search boxes nobody will use. */
export function WorkspaceFilterBar({ query, onQueryChange }: WorkspaceFilterBarProps) {
  return (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filter saved searches and bookmarks…"
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label="Clear filter"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
