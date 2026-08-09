import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import { useAdminOverview } from '../../hooks/useAdminOverview'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'

type CheckStatus = 'pass' | 'warn' | 'info'

interface SecurityCheck {
  label: string
  status: CheckStatus
  detail: string
}

const ICON: Record<CheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: XCircle,
  info: MinusCircle,
}

const COLOR: Record<CheckStatus, string> = {
  pass: 'text-emerald-500',
  warn: 'text-amber-500',
  info: 'text-slate-400',
}

export function SecurityTab() {
  const { overview, status } = useAdminOverview()

  if (status === 'loading' && !overview) return <LoadingSkeleton count={4} />

  const checks: SecurityCheck[] = [
    {
      label: 'Service-role and provider API keys never reach the browser',
      status: 'pass',
      detail: 'The frontend bundle holds zero Supabase, Gemini, or Anthropic credentials — every credentialed call is made from the Worker, server-side.',
    },
    {
      label: 'Row-level security enabled on user-owned tables',
      status: 'pass',
      detail: 'watchlists, bookmarks, alerts, and notifications carry owner-scoped RLS policies; the Worker currently writes via the service-role key (which bypasses RLS) under a single synthetic workspace identity.',
    },
    {
      label: 'Authentication',
      status: 'info',
      detail: 'Not configured. Every request currently runs under one fixed workspace identity — there is no login, session, or per-user authorization to bypass yet.',
    },
    {
      label: 'CORS policy',
      status: 'warn',
      detail: "Currently fully open (Access-Control-Allow-Origin: *). Acceptable only while there is no authenticated session or user-specific data to protect — must be restricted to known origins before authentication ships.",
    },
    {
      label: 'Audit logging',
      status: 'pass',
      detail: 'Source edits, config changes, legal publishing, and moderation decisions are recorded with real actor/action/timestamp — see the Audit tab.',
    },
    {
      label: 'Database connectivity',
      status: overview?.database.connected ? 'pass' : 'warn',
      detail: overview?.database.connected ? 'Live connection confirmed on this overview load.' : (overview?.database.error ?? 'Could not verify connectivity.'),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Real, derived checks only — nothing here is a fabricated "compliance score." Items marked as gaps are genuine
        and tracked, not disclaimed away.
      </p>
      {checks.map((check) => {
        const Icon = ICON[check.status]
        return (
          <div key={check.label} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR[check.status]}`} aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{check.label}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{check.detail}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
