import { AlertTriangle, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import type { ConfidenceLevel, EditorialPriority, GovernmentStatementNature, JournalistBrief } from '../../lib/api/brief'

const priorityMeta: Record<EditorialPriority, { label: string; className: string }> = {
  breaking: { label: 'Breaking', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  emerging: { label: 'Emerging', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  significant: { label: 'Significant', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  monitor: { label: 'Monitor', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  background: { label: 'Background', className: 'bg-slate-500/10 text-slate-500 dark:text-slate-400' },
}

const confidenceMeta: Record<ConfidenceLevel, string> = {
  very_low: 'Very low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very high',
}

const statementNatureMeta: Record<GovernmentStatementNature, string> = {
  government_announcement: 'Government announcement',
  government_claim: 'Government claim',
  confirmed_external_fact: 'Confirmed external fact',
  proposed_policy: 'Proposed policy',
  scheduled_event: 'Scheduled event',
  completed_event: 'Completed event',
  not_applicable: 'Not a government statement',
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</h4>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/**
 * Renders exactly what the Gemini-backed provider returned — see
 * worker/src/pipeline/ai/geminiJournalistBriefProvider.ts's editorial rules
 * (never fabricate, separate confirmed/reported/unverified, known vs.
 * potential impact). This component adds no interpretation of its own; an
 * empty array/string from the model is rendered as absent, not filled in.
 */
export function JournalistBriefPanel({ brief }: { brief: JournalistBrief }) {
  const priority = priorityMeta[brief.editorialPriority]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          AI Journalist Brief
        </span>
        <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', priority.className)}>{priority.label}</span>
        {brief.statementNature !== 'not_applicable' && (
          <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {statementNatureMeta[brief.statementNature]}
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Confidence: {confidenceMeta[brief.confidence]}
        </span>
      </div>

      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{brief.summary}</p>

      {brief.suggestedHeadline && (
        <SubSection title="Suggested headline">
          <p className="text-sm text-slate-700 dark:text-slate-200">{brief.suggestedHeadline}</p>
        </SubSection>
      )}

      <SubSection title="What happened">
        <p className="text-sm text-slate-600 dark:text-slate-300">{brief.whatHappened}</p>
      </SubSection>

      {(brief.whyItMattersKnown || brief.whyItMattersPotential) && (
        <SubSection title="Why it matters">
          {brief.whyItMattersKnown && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Known: </span>
              {brief.whyItMattersKnown}
            </p>
          )}
          {brief.whyItMattersPotential && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-600 dark:text-slate-300">Potential: </span>
              {brief.whyItMattersPotential}
            </p>
          )}
        </SubSection>
      )}

      {brief.keyFacts.length > 0 && (
        <SubSection title="Key facts">
          <List items={brief.keyFacts} />
        </SubSection>
      )}

      {brief.contradictions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Conflicting reports detected
          </div>
          <List items={brief.contradictions} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {brief.confirmedFacts.length > 0 && (
          <SubSection title="Confirmed">
            <List items={brief.confirmedFacts} />
          </SubSection>
        )}
        {brief.reportedClaims.length > 0 && (
          <SubSection title="Reported (not independently confirmed)">
            <List items={brief.reportedClaims} />
          </SubSection>
        )}
        {brief.unverifiedClaims.length > 0 && (
          <SubSection title="Unverified">
            <List items={brief.unverifiedClaims} />
          </SubSection>
        )}
      </div>

      {(brief.entities.people.length > 0 || brief.entities.organizations.length > 0 || brief.locations.length > 0) && (
        <SubSection title="Entities">
          <div className="flex flex-wrap gap-1.5">
            {[...brief.entities.people, ...brief.entities.organizations, ...brief.locations].map((entity, i) => (
              <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {entity}
              </span>
            ))}
          </div>
        </SubSection>
      )}

      {brief.storyAngles.length > 0 && (
        <SubSection title="Story angles">
          <List items={brief.storyAngles} />
        </SubSection>
      )}

      {brief.followUpQuestions.length > 0 && (
        <SubSection title="Suggested questions">
          <List items={brief.followUpQuestions} />
        </SubSection>
      )}

      {brief.whatToWatch.length > 0 && (
        <SubSection title="What to watch next">
          <List items={brief.whatToWatch} />
        </SubSection>
      )}

      <SubSection title="Source assessment">
        <p className="text-sm text-slate-600 dark:text-slate-300">{brief.sourceAssessment}</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Confidence reason: {brief.confidenceReason}</p>
      </SubSection>

      <p className="border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Generated by {brief.model} · {new Date(brief.generatedAt).toLocaleString()} — an AI assistant, not a substitute for editorial judgment.
      </p>
    </div>
  )
}
