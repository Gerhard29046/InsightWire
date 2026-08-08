import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Sparkles } from 'lucide-react'
import { EventCard } from '../components/feed/EventCard'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { EmptyState } from '../components/feed/EmptyState'
import { EntityBriefPanel } from '../components/entities/EntityBriefPanel'
import { EntityNameDisplay } from '../components/entities/EntityNameDisplay'
import { entityTypeById } from '../lib/entityTypes'
import { useEntityDetail } from '../hooks/useEntityDetail'
import { useEntityBrief } from '../hooks/useEntityBrief'
import type { ConnectedEntity, EntityType } from '../lib/api/entities'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  works_for: 'works for',
  member_of: 'member of',
  represents: 'represents',
  affiliated_with: 'affiliated with',
  located_in: 'located in',
  associated_with: 'associated with',
  related_to: 'related to',
  mentioned_with: 'appeared together with',
}

/** Groups the real, event-co-occurrence-derived connectedEntities by type for the "Related people/organizations/countries/locations" sections. Topic entities never appear here — excluded server-side (see entitiesApi.ts's DEFAULT_EXCLUDED_TYPE), consistent with v1's decision that topics aren't a "who/what" Entity Explorer investigates. */
function groupConnected(connectedEntities: ConnectedEntity[], types: EntityType[]): ConnectedEntity[] {
  return connectedEntities.filter((c) => types.includes(c.entity.type))
}

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>()
  const { detail, status, error, refresh } = useEntityDetail(id)
  const entityBrief = useEntityBrief(detail?.entity.id)

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <LoadingSkeleton count={1} />
      </div>
    )
  }

  if (status === 'not-configured') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <EmptyState variant="not-configured" />
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <EmptyState variant="no-events" title="Entity not found." description="This entity may have been merged, or the link is stale." />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState error={error} onRetry={refresh} title="Unable to load this entity." />
      </div>
    )
  }

  if (!detail) return null

  const { entity, stats, recentEvents, breakingEvents, upcomingEvents, connectedEntities, relationships, countries, sources } = detail
  const meta = entityTypeById[entity.type]

  const relatedPeople = groupConnected(connectedEntities, ['person'])
  const relatedOrganizations = groupConnected(connectedEntities, ['organization', 'government', 'company', 'agency', 'international_organization', 'political_party'])
  const relatedCountries = groupConnected(connectedEntities, ['country'])
  const relatedLocations = groupConnected(connectedEntities, ['location'])

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 dark:text-slate-500">
          <meta.icon className="h-4 w-4" aria-hidden />
          {meta.label}
        </div>
        <EntityNameDisplay name={entity.name} className="mt-1 block text-xl font-semibold text-slate-900 dark:text-white" />
        <h1 className="sr-only">{entity.name}</h1>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm dark:border-slate-800 sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Country</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{entity.country ?? 'Insufficient verified information'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">First seen</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{formatTime(entity.firstSeenAt)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Last seen</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{formatTime(entity.lastSeenAt)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Events (non-scheduled)</div>
            <div className="font-medium text-slate-700 dark:text-slate-200">{stats.totalEvents}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Last 24 hours" value={stats.eventsLast24h} />
        <StatCard label="Last 7 days" value={stats.eventsLast7d} />
        <StatCard label="Last 30 days" value={stats.eventsLast30d} />
        <StatCard label="Total tracked" value={stats.totalEvents} />
      </div>

      <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        {entityBrief.status === 'checking' && <p className="text-xs text-slate-400 dark:text-slate-500">Checking for an existing AI intelligence summary…</p>}

        {entityBrief.status === 'none' && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI Intelligence Summary</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Generate a summary from this entity's real tracked events and relationships — never a freely-invented biography.
              </p>
            </div>
            <button
              type="button"
              onClick={entityBrief.generate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Summarize this entity
            </button>
          </div>
        )}

        {entityBrief.status === 'generating' && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            Generating summary from real tracked evidence — this calls the live Gemini API and may take a few seconds…
          </div>
        )}

        {entityBrief.status === 'error' && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              Couldn't generate a summary: {entityBrief.error instanceof Error ? entityBrief.error.message : 'Unknown error'}
            </p>
            <button
              type="button"
              onClick={entityBrief.generate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        )}

        {entityBrief.status === 'ready' && entityBrief.brief && (
          <>
            <EntityBriefPanel brief={entityBrief.brief} />
            <button
              type="button"
              onClick={entityBrief.generate}
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
          {breakingEvents.length > 0 && (
            <Section title="Breaking now">
              <div className="flex flex-col gap-3">
                {breakingEvents.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            </Section>
          )}

          <Section title="Recent events">
            {recentEvents.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No real events found for this entity yet (scheduled/future events are excluded from this view — see below for those).
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {recentEvents.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Upcoming">
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No upcoming scheduled events found for this entity.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {upcomingEvents.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            )}
          </Section>

          {relationships.length > 0 && (
            <Section title="Evidence-backed relationships">
              <ul className="flex flex-col gap-3">
                {relationships.map((r, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="text-sm text-slate-700 dark:text-slate-200">
                      {r.direction === 'outgoing' ? (
                        <>
                          <span className="font-medium">{entity.name}</span> {RELATIONSHIP_LABELS[r.relationshipType] ?? r.relationshipType}{' '}
                          <Link to={`/entities/${encodeURIComponent(r.relatedEntity.id)}`} className="font-medium text-sky-500 hover:text-sky-600">
                            {r.relatedEntity.name}
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link to={`/entities/${encodeURIComponent(r.relatedEntity.id)}`} className="font-medium text-sky-500 hover:text-sky-600">
                            {r.relatedEntity.name}
                          </Link>{' '}
                          {RELATIONSHIP_LABELS[r.relationshipType] ?? r.relationshipType} <span className="font-medium">{entity.name}</span>
                        </>
                      )}
                    </div>
                    <blockquote className="mt-1.5 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      "{r.evidenceSnippet}"
                    </blockquote>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                      <span>Confidence: {Math.round(r.confidence * 100)}%</span>
                      <span>·</span>
                      <Link to={`/feed/${encodeURIComponent(r.evidenceEvent.id)}`} className="text-sky-500 hover:text-sky-600">
                        {r.evidenceEvent.title}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Related people">
            <RelatedList items={relatedPeople} empty="No related people identified yet." />
          </Section>

          <Section title="Related organizations">
            <RelatedList items={relatedOrganizations} empty="No related organizations identified yet." />
          </Section>

          <Section title="Related countries">
            <RelatedList items={relatedCountries} empty="No related countries identified yet." />
          </Section>

          <Section title="Related locations">
            <RelatedList items={relatedLocations} empty="No related locations identified yet." />
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
              "Related" here means InsightWire has observed both entities in the same real tracked event(s) — not a claimed formal relationship
              (e.g. "works for," "member of") unless separately confirmed under Evidence-backed relationships above.
            </p>
          </Section>

          <Section title="Countries">
            {countries.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No country data yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {countries.map((c) => (
                  <li key={c.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{c.label}</span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{c.count} event{c.count === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Sources">
            {sources.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No source data yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sources.map((s) => (
                  <li key={s.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{s.label}</span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{s.count} event{s.count === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <button
        type="button"
        onClick={refresh}
        className="mx-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Refresh
      </button>
    </div>
  )
}

function RelatedList({ items, empty }: { items: ConnectedEntity[]; empty: string }) {
  if (items.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">{empty}</p>
  return (
    <ul className="flex flex-col gap-3">
      {items.map((connected) => {
        const connectedMeta = entityTypeById[connected.entity.type]
        return (
          <li key={connected.entity.id}>
            <Link
              to={`/entities/${encodeURIComponent(connected.entity.id)}`}
              className="flex flex-col gap-1 rounded-lg border border-slate-100 p-3 transition-colors hover:border-sky-300 dark:border-slate-800 dark:hover:border-sky-800"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
                <connectedMeta.icon className="h-3.5 w-3.5" aria-hidden />
                {connectedMeta.label}
              </div>
              <EntityNameDisplay name={connected.entity.name} className="block text-sm font-medium text-slate-800 dark:text-slate-100" />
              <div className="text-xs text-slate-400 dark:text-slate-500">
                Appeared together in {connected.sharedEventCount} tracked event{connected.sharedEventCount === 1 ? '' : 's'} · last {timeAgo(connected.lastSeenAt)}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/entities"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to Entity Explorer
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
