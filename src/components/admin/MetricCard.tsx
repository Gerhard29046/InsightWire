import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warning' | 'bad'
  detail?: string
}

const TONE_CLASS: Record<NonNullable<MetricCardProps['tone']>, string> = {
  neutral: 'bg-[var(--accent)]/10 text-[var(--accent)]',
  good: 'bg-emerald-500/10 text-emerald-500',
  warning: 'bg-amber-500/10 text-amber-500',
  bad: 'bg-red-500/10 text-red-500',
}

export function MetricCard({ icon: Icon, label, value, tone = 'neutral', detail }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <span className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', TONE_CLASS[tone])}>
        <Icon className="h-4.5 w-4.5" aria-hidden />
      </span>
      <p className="mt-3 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {detail && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{detail}</p>}
    </div>
  )
}
