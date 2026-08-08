import type { LucideIcon } from 'lucide-react'
import { AlertOctagon, RefreshCw, ShieldAlert, TimerOff, WifiOff } from 'lucide-react'
import { ApiAuthError, ApiOfflineError, ApiServerError, ApiTimeoutError } from '../../lib/api/client'

interface Description {
  Icon: LucideIcon
  title: string
  description: string
}

function describe(error: unknown): Description {
  if (error instanceof ApiOfflineError) {
    return {
      Icon: WifiOff,
      title: "You're offline",
      description: 'Check your network connection and try again.',
    }
  }
  if (error instanceof ApiAuthError) {
    return {
      Icon: ShieldAlert,
      title: 'Authentication failed',
      description: 'Your session may have expired. Sign in again to keep watching live events.',
    }
  }
  if (error instanceof ApiTimeoutError) {
    return {
      Icon: TimerOff,
      title: 'The backend took too long to respond',
      description: 'The request timed out. It may be under load — try again in a moment.',
    }
  }
  if (error instanceof ApiServerError) {
    return {
      Icon: AlertOctagon,
      title: 'Events API is unavailable',
      description: `The backend returned an error (status ${error.status}). Try again shortly.`,
    }
  }
  return {
    Icon: AlertOctagon,
    title: 'Something went wrong',
    description: 'Could not load live events. Try again.',
  }
}

interface ErrorStateProps {
  error: unknown
  onRetry: () => void
  /** Overrides the generic per-error-type title (e.g. "Something went wrong") with page-specific copy — the underlying diagnostic description (offline/timeout/auth/server) is still shown, just not this headline. */
  title?: string
}

export function ErrorState({ error, onRetry, title: titleOverride }: ErrorStateProps) {
  const { Icon, title, description } = describe(error)
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/40 p-12 text-center dark:border-red-900/50 dark:bg-red-950/20">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{titleOverride ?? title}</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Try again
      </button>
    </div>
  )
}
