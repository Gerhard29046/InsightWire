import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink, HelpCircle, MapPin, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { CategoryBadge } from '../components/dashboard/CategoryBadge'
import { EventImportance } from '../components/feed/EventImportance'
import { EventStatus } from '../components/feed/EventStatus'
import { EventTimeline } from '../components/feed/EventTimeline'
import { JournalistBriefPanel } from '../components/feed/JournalistBriefPanel'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { useEventDetail } from '../hooks/useEventDetail'
import { useJournalistBrief } from '../hooks/useJournalistBrief'
import type { VerificationStatus } from '../lib/api/types'

const verificationMeta: Record<VerificationStatus, { label: string; icon: LucideIcon; className: string }> = {
  verified: { label: 'Verified', icon: Check, className: 'text-emerald-600 dark:text-emerald-400' },
  unverified: { label: 'Unverified', icon: HelpCircle, className: 'text-slate-400 dark:text-slate-500' },
  disputed: { label: 'Disputed', icon: ShieldAlert, className: 'text-amber-600 dark:text-amber-400' },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const { detail, status, error, refresh } = useEventDetail(id)
  const journalistBrief = useJournalistBrief(detail?.event.id)

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
        <ErrorState error={error} onRetry={refresh} />
      </div>
    )
  }

  if (!detail) return null

  const { event, timeline, sources, relatedEvents } = detail
  const verification = verificationMeta[event.verificationStatus]

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={event.category} />
          <EventImportance importance={event.importance} />
          <EventStatus status={event.status} />
          <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', verification.className)}>
            <verification.icon className="h-3 w-3" aria-hidden />
            {verification.label}
          </span>
        </div>

        <h1 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">{event.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {event.city ? `${event.city}, ${event.country}` : event.country}
          </span>
          <span>Source: {event.source}</span>
          {event.sourceUrl && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-sky-500 hover:text-sky-600"
            >
              Read original source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm dark:border-slate-800 sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">First detected</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{formatTime(event.publishedAt)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Last updated</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{formatTime(event.updatedAt)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Confidence</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{Math.round(event.confidence * 100)}%</div>
          </div>
          {event.priorityScore != null && (
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Priority score</div>
              <div className="font-medium text-slate-700 dark:text-slate-200">{event.priorityScore}/100</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        {journalistBrief.status === 'checking' && <p className="text-xs text-slate-400 dark:text-slate-500">Checking for an existing AI brief…</p>}

        {journalistBrief.status === 'none' && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI Journalist Brief</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Generate a structured brief from this event's real source material — never fabricated.
              </p>
            </div>
            <button
              type="button"
              onClick={journalistBrief.generate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Summarize this event
            </button>
          </div>
        )}

        {journalistBrief.status === 'generating' && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            Generating brief from real source material — this calls the live Gemini API and may take a few seconds…
          </div>
        )}

        {journalistBrief.status === 'error' && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              Couldn't generate a brief: {journalistBrief.error instanceof Error ? journalistBrief.error.message : 'Unknown error'}
            </p>
            <button
              type="button"
              onClick={journalistBrief.generate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        )}

        {journalistBrief.status === 'ready' && journalistBrief.brief && (
          <>
            <JournalistBriefPanel brief={journalistBrief.brief} />
            <button
              type="button"
              onClick={journalistBrief.generate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Regenerate
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="What's happening">
            {/* Honest labeling: `summary` only exists once an AI provider actually
                generates one (NullAiProvider today produces none — see
                docs/decisions/0005-intelligence-engine.md). Falling back to the
                untouched source `description` rather than fabricating "why it
                matters" narrative copy that doesn't exist yet. */}
            <p className="text-sm text-slate-600 dark:text-slate-300">{event.summary ?? event.description}</p>
            {!event.summary && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Showing the original source description — AI summarization isn't configured yet.
              </p>
            )}
          </Section>

          <Section title="Timeline">
            <EventTimeline updates={timeline} />
          </Section>

          <Section title="Related events">
            {relatedEvents.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No related events found yet (same category and country, most recent first).
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {relatedEvents.map((related) => (
                  <Link
                    key={related.id}
                    to={`/feed/${encodeURIComponent(related.id)}`}
                    className="rounded-lg border border-slate-100 p-3 text-sm transition-colors hover:border-sky-300 dark:border-slate-800 dark:hover:border-sky-800"
                  >
                    <div className="font-medium text-slate-800 dark:text-slate-100">{related.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {related.source} · {formatTime(related.publishedAt)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Sources">
            {!sources || sources.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No independent confirmations recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sources.map((s) => (
                  <li key={s.connectorId} className="text-sm text-slate-600 dark:text-slate-300">
                    <div className="font-medium">{s.connectorId}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">Reported {formatTime(s.reportedAt)}</div>
                    {s.sourceUrl && (
                      <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600">
                        Open <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {event.sourceTrustScore != null && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
                Source trust score: {Math.round(event.sourceTrustScore * 100)}%
              </p>
            )}
          </Section>

          {event.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {event.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/feed"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to feed
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  )
}
