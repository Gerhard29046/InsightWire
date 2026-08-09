import { Activity, AlertTriangle, Database, Radio, Rss, Sparkles } from 'lucide-react'
import { useAdminOverview } from '../../hooks/useAdminOverview'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'
import { EmptyState } from '../feed/EmptyState'
import { MetricCard } from './MetricCard'

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const STAGE_TONE: Record<string, 'good' | 'warning' | 'bad' | 'neutral'> = {
  healthy: 'good',
  warning: 'warning',
  error: 'bad',
  not_monitored: 'neutral',
}

export function OverviewTab() {
  const { overview, status, error, refresh } = useAdminOverview()

  if (status === 'loading' && !overview) return <LoadingSkeleton count={4} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />
  if (status === 'error' || !overview) return <ErrorState error={error} onRetry={refresh} title="Couldn't load system overview." />

  const { database, ingestion, services, pipeline } = overview

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">System health</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            icon={Database}
            label="Database"
            value={database.connected ? 'Connected' : 'Unreachable'}
            tone={database.connected ? 'good' : 'bad'}
            detail={database.error}
          />
          <MetricCard
            icon={Rss}
            label="Active sources"
            value={`${ingestion.activeSources} / ${ingestion.totalSources}`}
            detail={`${ingestion.connectorsRegistered} connectors registered`}
          />
          <MetricCard
            icon={Radio}
            label="Last successful run"
            value={formatRelative(ingestion.lastSuccessfulRunAt)}
            tone={ingestion.lastSuccessfulRunAt ? 'good' : 'neutral'}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Failed runs (24h)"
            value={String(ingestion.failedRunsLast24h)}
            tone={ingestion.failedRunsLast24h > 0 ? 'warning' : 'good'}
            detail={ingestion.lastError ?? undefined}
          />
          <MetricCard icon={Activity} label="Events ingested (24h)" value={ingestion.eventsIngestedLast24h.toLocaleString()} />
          <MetricCard icon={Activity} label="Events ingested (total)" value={ingestion.eventsIngestedTotal.toLocaleString()} />
          <MetricCard
            icon={Sparkles}
            label="Gemini enrichment"
            value={services.geminiConfigured ? 'Configured' : 'Not configured'}
            tone={services.geminiConfigured ? 'good' : 'neutral'}
          />
          <MetricCard
            icon={Sparkles}
            label="Claude assistant"
            value={services.anthropicConfigured ? 'Configured' : 'Not configured'}
            tone={services.anthropicConfigured ? 'good' : 'neutral'}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Data pipeline health</h2>
        <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {pipeline.map((stage) => (
            <div key={stage.stage} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{stage.stage}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{stage.detail}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  {
                    good: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    bad: 'bg-red-500/10 text-red-600 dark:text-red-400',
                    neutral: 'bg-slate-200/60 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                  }[STAGE_TONE[stage.status] ?? 'neutral']
                }`}
              >
                {stage.status === 'not_monitored' ? 'Not monitored' : stage.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
