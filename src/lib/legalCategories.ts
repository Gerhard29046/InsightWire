import type { LegalDocumentCategory } from './api/admin'

export const LEGAL_CATEGORIES: { id: LegalDocumentCategory; label: string; shortLabel: string }[] = [
  { id: 'core', label: 'Core Legal Documents', shortLabel: 'Core Legal' },
  { id: 'content', label: 'Content & Research', shortLabel: 'Content & Research' },
  { id: 'platform', label: 'Platform Policies', shortLabel: 'Platform' },
]

/**
 * The real, curated reading order for the 13 documents this platform has
 * actually published — deliberately not alphabetical (e.g. Terms before
 * Privacy). A slug not in this list (a future policy) sorts after all of
 * these, alphabetically by title, within its own category.
 */
const KNOWN_SLUG_ORDER = [
  'terms-and-conditions',
  'privacy-policy',
  'popia-notice',
  'paia-manual',
  'research-disclaimer',
  'copyright-policy',
  'source-attribution-policy',
  'country-jurisdiction-policy',
  'acceptable-use-policy',
  'cookie-policy',
  'data-retention-policy',
  'security-policy',
  'removal-correction-policy',
]

export function sortLegalDocuments<T extends { slug: string; title: string; category: LegalDocumentCategory }>(docs: T[]): T[] {
  const categoryRank = (category: LegalDocumentCategory) => {
    const i = LEGAL_CATEGORIES.findIndex((c) => c.id === category)
    return i === -1 ? LEGAL_CATEGORIES.length : i
  }
  const slugRank = (slug: string) => {
    const i = KNOWN_SLUG_ORDER.indexOf(slug)
    return i === -1 ? KNOWN_SLUG_ORDER.length : i
  }
  return [...docs].sort((a, b) => {
    const catDiff = categoryRank(a.category) - categoryRank(b.category)
    if (catDiff !== 0) return catDiff
    const slugDiff = slugRank(a.slug) - slugRank(b.slug)
    if (slugDiff !== 0) return slugDiff
    return a.title.localeCompare(b.title)
  })
}
