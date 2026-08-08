import { Sparkles } from 'lucide-react'
import type { StorySuggestion } from '../../lib/mockData'
import { categoryById } from '../../lib/categories'

export function StorySuggestions({ suggestions }: { suggestions: StorySuggestion[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-sky-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          AI story suggestions
        </h2>
      </div>
      <ul className="mt-4 flex flex-col gap-4">
        {suggestions.map((s) => {
          const cat = categoryById[s.category]
          return (
            <li key={s.id}>
              <div className="flex items-start gap-2">
                <cat.icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: `var(${cat.colorVar})` }}
                  aria-hidden
                />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {s.title}
                </p>
              </div>
              <p className="mt-1 pl-6 text-xs text-slate-500 dark:text-slate-400">{s.angle}</p>
              <div className="mt-2 flex items-center gap-2 pl-6">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#cde2fb] dark:bg-[#184f95]">
                  <span
                    className="block h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
                    style={{ width: `${Math.round(s.confidence * 100)}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {Math.round(s.confidence * 100)}%
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
