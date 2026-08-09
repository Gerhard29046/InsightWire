import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { LoadingSkeleton } from '../components/feed/LoadingSkeleton'
import { ErrorState } from '../components/feed/ErrorState'
import { EmptyState } from '../components/feed/EmptyState'
import { useLegalDocument, useLegalDocuments } from '../hooks/useLegalDocuments'
import { sortLegalDocuments } from '../lib/legalCategories'

interface LegalNavState {
  from?: 'admin'
  adminSearch?: string
}

/**
 * Renders markdown with the same restrained conventions every hand-written
 * doc in this repo uses (## section headings, bold, tables, lists) — no
 * markdown library dependency for a handful of real, server-authored
 * documents; a small, deliberately narrow renderer covering exactly what
 * the legal-drafting content actually uses.
 */
function renderMarkdown(markdown: string): string {
  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)

  const lines = html.split('\n')
  const out: string[] = []
  let inTable = false
  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      if (!inTable) {
        out.push('<table>')
        inTable = true
      }
      const cells = line.split('|').filter((c) => c.trim() !== '')
      if (cells.every((c) => /^[-\s]+$/.test(c))) continue
      out.push(`<tr>${cells.map((c) => `<td>${c.trim()}</td>`).join('')}</tr>`)
    } else {
      if (inTable) {
        out.push('</table>')
        inTable = false
      }
      out.push(line)
    }
  }
  if (inTable) out.push('</table>')
  html = out.join('\n')

  html = html
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed || /^<(h1|h2|h3|ul|table|blockquote)/.test(trimmed)) return block
      return `<p>${trimmed}</p>`
    })
    .join('\n')

  return html
}

export default function LegalDocument() {
  const { slug } = useParams<{ slug: string }>()
  const { document, status, error, refresh } = useLegalDocument(slug)
  const { documents: allDocuments } = useLegalDocuments()
  const location = useLocation()
  const navigate = useNavigate()

  const navState = (location.state as LegalNavState | null) ?? {}
  const fromAdmin = navState.from === 'admin'
  const backTo = fromAdmin ? `/admin?${navState.adminSearch || 'tab=legal'}` : '/legal'

  const ordered = sortLegalDocuments(allDocuments)
  const currentIndex = slug ? ordered.findIndex((d) => d.slug === slug) : -1
  const prevDoc = currentIndex > 0 ? ordered[currentIndex - 1] : undefined
  const nextDoc = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined

  const goTo = (targetSlug: string) => navigate(`/legal/${targetSlug}`, { state: navState })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          {fromAdmin ? (
            <>
              <Link to="/admin" className="hover:text-slate-600 dark:hover:text-slate-300">Administration</Link>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <Link to={backTo} className="hover:text-slate-600 dark:hover:text-slate-300">Legal &amp; Compliance</Link>
            </>
          ) : (
            <Link to="/legal" className="hover:text-slate-600 dark:hover:text-slate-300">Legal &amp; Compliance</Link>
          )}
          {document && (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="text-slate-600 dark:text-slate-300">{document.title}</span>
            </>
          )}
        </nav>

        <Link
          to={backTo}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Legal &amp; Compliance
        </Link>
      </div>

      {status === 'loading' && <LoadingSkeleton count={1} />}
      {status === 'not-configured' && <EmptyState variant="not-configured" />}
      {status === 'error' && <ErrorState error={error} onRetry={refresh} title="Couldn't load this document." />}
      {status === 'not-found' && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">This policy hasn't been published yet.</p>
        </div>
      )}

      {status === 'ready' && document && (
        <>
          <article className="flex flex-col gap-4">
            <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{document.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Version {document.version}</span>
                <span aria-hidden>·</span>
                <span>Effective {new Date(document.effectiveDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                  {document.status === 'active' ? 'Active' : document.status}
                </span>
              </div>
              {document.summary && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{document.summary}</p>}
            </header>
            <div
              className="legal-document prose prose-slate max-w-none text-sm leading-relaxed text-slate-700 dark:prose-invert dark:text-slate-300 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)]/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:dark:text-white [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_td]:dark:border-slate-800"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(document.content) }}
            />
          </article>

          {(prevDoc || nextDoc) && (
            <div className="flex items-stretch gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              {prevDoc ? (
                <button
                  type="button"
                  onClick={() => goTo(prevDoc.slug)}
                  className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-[var(--accent)]/40 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Previous</p>
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{prevDoc.title}</p>
                  </div>
                </button>
              ) : (
                <div className="flex-1" />
              )}
              {nextDoc ? (
                <button
                  type="button"
                  onClick={() => goTo(nextDoc.slug)}
                  className="flex flex-1 items-center justify-end gap-2 rounded-xl border border-slate-200 p-3 text-right transition-colors hover:border-[var(--accent)]/40 dark:border-slate-800 dark:hover:border-[var(--accent-hover)]/50"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Next</p>
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{nextDoc.title}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
