import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'

export interface AdminTabDef {
  id: string
  label: string
  icon: LucideIcon
}

interface AdminTabsProps {
  tabs: AdminTabDef[]
  active: string
  onChange: (id: string) => void
}

export function AdminTabs({ tabs, active, onChange }: AdminTabsProps) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 pb-px dark:border-slate-800" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === tab.id
              ? 'border-[var(--accent)] text-[var(--accent-hover)] dark:text-[var(--accent)]'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          <tab.icon className="h-4 w-4" aria-hidden />
          {tab.label}
        </button>
      ))}
    </div>
  )
}
