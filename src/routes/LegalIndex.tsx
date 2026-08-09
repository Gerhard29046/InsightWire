import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { EmptyState } from '../components/feed/EmptyState'
import { useLegalDocuments } from '../hooks/useLegalDocuments'

export default function LegalIndex() {
  const { documents, status } = useLegalDocuments()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Legal &amp; Compliance</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every published policy governing this service, with real version numbers and effective dates.
        </p>
      </div>

      {status === 'loading' && <LoadingSkeleton count={4} />}
      {status === 'not-configured' && <EmptyState variant="not-configured" />}
      {status === 'ready' && documents.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">No policies have been published yet.</p>
        </div>
      )}

      {status === 'ready' && documents.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <Link
              key={doc.slug}
              to={`/legal/${doc.slug}`}
              className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-[var(--accent)]/40 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{doc.title}</p>
                {doc.summary && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{doc.summary}</p>}
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Version {doc.version} · Effective {new Date(doc.effectiveDate).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
