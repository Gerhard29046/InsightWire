import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { ApiNotConfiguredError, ApiServerError } from '../lib/api/client'
import { fetchHistoricalMomentDetail, type HistoricalMoment } from '../lib/api/historicalMoments'
import { categoryById } from '../lib/categories'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to Dashboard
    </Link>
  )
}

/**
 * "Broader context" detail for a single curated historical moment — a real,
 * editorially-significant span (see historical_moments migration), never an
 * ordinary ingested event. This page renders whatever real fields a
 * curated row actually has; it does not synthesize additional narrative.
 */
export default function HistoryDetail() {
  const { id } = useParams<{ id: string }>()
  const [moment, setMoment] = useState<HistoricalMoment | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not-configured' | 'not-found'>('loading')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setStatus('loading')
    fetchHistoricalMomentDetail(id)
      .then((res) => {
        if (cancelled) return
        setMoment(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err)
        if (err instanceof ApiNotConfiguredError) setStatus('not-configured')
        else if (err instanceof ApiServerError && err.status === 404) setStatus('not-found')
        else setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <LoadingSkeleton count={1} />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState error={error} onRetry={() => window.location.reload()} title="Unable to load this historical moment." />
      </div>
    )
  }

  if (status === 'not-found' || !moment) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-sm text-slate-500 dark:text-slate-400">This historical moment could not be found.</p>
      </div>
    )
  }

  const cat = moment.category ? categoryById[moment.category] : undefined

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
              moment.significance === 'major'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
            )}
          >
            {moment.significance}
          </span>
          {cat && <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{cat.label}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{moment.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {formatDate(moment.startDate)}
          {moment.endDate ? ` – ${formatDate(moment.endDate)}` : ''}
          {moment.region ? ` · ${moment.region}` : ''}
        </p>
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-slate-700 dark:text-slate-200">{moment.summary}</p>

      {moment.countries.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Countries</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{moment.countries.join(', ')}</p>
        </div>
      )}

      {moment.sourceUrls.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Sources</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {moment.sourceUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline"
                >
                  {url}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
