import { Table2 } from 'lucide-react'
import { useAdminDatabase } from '../../hooks/useAdminDatabase'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import { ErrorState } from '../feed/ErrorState'
import { EmptyState } from '../feed/EmptyState'
import { MetricCard } from './MetricCard'

export function DatabaseTab() {
  const { metrics, status, error, refresh } = useAdminDatabase()

  if (status === 'loading' && metrics.length === 0) return <LoadingSkeleton count={4} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />
  if (status === 'error') return <ErrorState error={error} onRetry={refresh} title="Couldn't load database counts." />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Real row counts, queried live. A metric reads "Not configured" when its table doesn't exist yet — never a
        guessed or cached number.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            icon={Table2}
            label={metric.label}
            value={metric.unavailable || metric.count === null ? 'Not configured' : metric.count.toLocaleString()}
            tone={metric.unavailable || metric.count === null ? 'neutral' : 'good'}
          />
        ))}
      </div>
    </div>
  )
}
