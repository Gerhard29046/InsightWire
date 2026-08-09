import type { EventUpdate, NormalizedEvent } from '@insightwire/shared'

/**
 * SHA-256 over normalized (lowercased, whitespace-collapsed) title +
 * description. Catches the same real-world story arriving under a
 * *different* deterministic id (two sources covering one event, or a feed
 * re-issuing an item with a new guid) — the deterministic `NormalizedEvent.id`
 * alone only catches the *same* source re-sending the *same* item.
 */
export async function computeContentHash(event: NormalizedEvent): Promise<string> {
  const normalized = `${event.title}\n${event.description}`.toLowerCase().trim().replace(/\s+/g, ' ')
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ExistingRecord {
  id: string
  contentHash: string
  title: string
  description: string
  status: string
  importance: string
  category: string
  country: string
  publishedAt: string
  source: string
}

/**
 * "Have we seen this before?" lookup. In-memory for this phase — no live
 * Supabase connection exists yet — swapped for a real `normalized_events`
 * existence query once Phase 6's schema is applied to a real database.
 * Resets on Worker restart, the same accepted limitation as Phase 2's
 * `InMemoryMetricsStore`, for the same reason.
 */
export interface DuplicateIndex {
  findById(id: string): Promise<ExistingRecord | undefined>
  findByContentHash(contentHash: string): Promise<ExistingRecord | undefined>
  /**
   * Near-duplicate lookup for the realistic "20 independent sources, 20
   * different headlines, one real event" case that `findByContentHash`
   * (exact-hash) structurally cannot catch — confirmed live: independent
   * newsrooms never produce byte-identical title+description for the same
   * story. See `computeTitleDescriptionSimilarity`'s own doc comment for
   * the matching heuristic and why it's gated the way it is.
   */
  findSimilar(candidate: SimilarityCandidate): Promise<ExistingRecord | undefined>
  remember(record: ExistingRecord): Promise<void>
}

export interface SimilarityCandidate {
  title: string
  description: string
  category: string
  country: string
  publishedAt: string
  source: string
}

export class InMemoryDuplicateIndex implements DuplicateIndex {
  private readonly byId = new Map<string, ExistingRecord>()
  private readonly byContentHash = new Map<string, ExistingRecord>()

  async findById(id: string): Promise<ExistingRecord | undefined> {
    return this.byId.get(id)
  }

  async findByContentHash(contentHash: string): Promise<ExistingRecord | undefined> {
    return this.byContentHash.get(contentHash)
  }

  async findSimilar(candidate: SimilarityCandidate): Promise<ExistingRecord | undefined> {
    let best: ExistingRecord | undefined
    let bestScore = 0
    for (const record of this.byId.values()) {
      const score = nearDuplicateScore(candidate, record)
      if (score !== null && score > bestScore) {
        best = record
        bestScore = score
      }
    }
    return best
  }

  async remember(record: ExistingRecord): Promise<void> {
    this.byId.set(record.id, record)
    this.byContentHash.set(record.contentHash, record)
  }
}

export type DedupeOutcome =
  | { kind: 'new' }
  | { kind: 'unchanged'; existingId: string }
  | { kind: 'updated'; existingId: string; changes: EventUpdate[] }
  | { kind: 'duplicate'; existingId: string }

function diffEvent(existing: ExistingRecord, incoming: NormalizedEvent, at: string): EventUpdate[] {
  const changes: EventUpdate[] = []
  if (existing.title !== incoming.title) {
    changes.push({ at, label: `Title changed from "${existing.title}" to "${incoming.title}"` })
  }
  if (existing.description !== incoming.description) {
    changes.push({ at, label: 'Description updated' })
  }
  if (existing.status !== incoming.status) {
    changes.push({ at, label: `Status changed from "${existing.status}" to "${incoming.status}"` })
  }
  if (existing.importance !== incoming.importance) {
    changes.push({ at, label: `Importance changed from "${existing.importance}" to "${incoming.importance}"` })
  }
  // Needed for the weather→natural_disasters cleanup: an already-stored
  // significant GDACS event whose category is being corrected has identical
  // title/description/status/importance, so without this check dedupe would
  // report "unchanged" and the correction would never be re-persisted.
  if (existing.category !== incoming.category) {
    changes.push({ at, label: `Category changed from "${existing.category}" to "${incoming.category}"` })
  }
  return changes
}

/**
 * Words too common to signal "same story" on their own — pure function
 * words and a handful of wire-copy filler terms observed across this
 * codebase's real connector fixtures (government/news boilerplate like
 * "said", "after", "over"). Deliberately not exhaustive; the goal is
 * removing noise from the Jaccard denominator, not linguistic correctness.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been',
  'by', 'with', 'from', 'that', 'this', 'it', 'as', 'has', 'have', 'had', 'will', 'said', 'after', 'over', 'its',
  'their', 'than', 'but', 'not', 'new', 'into', 'about', 'more', 'up', 'out', 'who', 'what', 'when', 'which',
])

function normalizeWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  return new Set(words)
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const word of a) {
    if (b.has(word)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Real events reported hours apart by independent outlets covering the same story; wide enough for "breaking overnight, follow-up filed the next morning" but tight enough that it can't span unrelated events that happen to share a category+country combination over weeks. */
const NEAR_DUPLICATE_TIME_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * Genuine cross-source paraphrases of the same event share real vocabulary
 * (the affected name/place/entity) but rarely share the majority of their
 * words — journalists rewrite, not copy. Thresholds are calibrated against
 * two measured real-shaped examples (see dedupe.test.ts): two wire services'
 * independent headlines for the same real flood ("Cape Town floods leave
 * three dead..." vs "Three killed in Cape Town flooding...") score ~0.286
 * title / ~0.231 description — deliberately kept just inside the bar — while
 * two unrelated same-category/country stories ("Cabinet approves new
 * education policy..." vs "...new water infrastructure...") score ~0.222,
 * just outside it. This is a genuinely narrow margin, reflecting how hard
 * this problem is without embeddings — not a false sense of precision.
 *
 * The same-source exclusion below is a separate, non-negotiable gate: this
 * codebase's own real Federal Reserve fixture has back-to-back
 * genuinely-different bank approvals (e.g. "...application by FS Bancorp,
 * Inc." vs "...by Coastal Bend Bancshares, Inc.") sharing ~58% of title
 * words purely from the press-release template — far above these
 * thresholds. Near-duplicate matching only makes sense *across* independent
 * sources in the first place (the goal is "N independent sources, one
 * event," never "collapse one source's own distinct releases").
 */
const TITLE_SIMILARITY_THRESHOLD = 0.25
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.2
/** Guards against a coincidental match at very low word counts inflating the ratio (e.g. two 3-word titles sharing 1 word is already 1/5 = 0.2). */
const MIN_SHARED_TITLE_WORDS = 2

/**
 * Returns a similarity score in (0, 1] if `candidate` and `record` are
 * plausibly independent reports of the same real-world event, or `null` if
 * they're gated out before similarity is even computed — cheaper, and each
 * gate is a real, deliberate constraint, not just an optimization:
 * - same source: never true-duplicate territory (see thresholds' own doc
 *   comment) — that's what the exact-id/exact-hash checks above already own.
 * - different category/country, or too far apart in time: avoids ever
 *   comparing text where shared vocabulary would be meaningless coincidence.
 */
function nearDuplicateScore(candidate: SimilarityCandidate, record: ExistingRecord): number | null {
  if (candidate.source === record.source) return null
  if (candidate.category !== record.category) return null
  if (candidate.country !== record.country) return null
  const timeDiff = Math.abs(new Date(candidate.publishedAt).getTime() - new Date(record.publishedAt).getTime())
  if (!Number.isFinite(timeDiff) || timeDiff > NEAR_DUPLICATE_TIME_WINDOW_MS) return null

  const candidateTitleWords = normalizeWords(candidate.title)
  const recordTitleWords = normalizeWords(record.title)
  const sharedTitleWords = [...candidateTitleWords].filter((w) => recordTitleWords.has(w)).length
  if (sharedTitleWords < MIN_SHARED_TITLE_WORDS) return null

  const titleSim = jaccardSimilarity(candidateTitleWords, recordTitleWords)
  if (titleSim < TITLE_SIMILARITY_THRESHOLD) return null
  const descriptionSim = jaccardSimilarity(normalizeWords(candidate.description), normalizeWords(record.description))
  if (descriptionSim < DESCRIPTION_SIMILARITY_THRESHOLD) return null

  return titleSim * 0.5 + descriptionSim * 0.5
}

/**
 * Deterministic id first (same source re-sending the same item — most
 * common case, cheapest check), then exact content hash (a different id,
 * byte-identical text — e.g. one connector's item re-issued with a new
 * guid), then near-duplicate similarity (a *different* source's own
 * independently-worded report of the same real-world event — the case
 * exact-hash matching cannot catch; see `nearDuplicateScore`'s own doc
 * comment). Order matters: an id match with no real change should be a
 * no-op, not a "duplicate" — those are different outcomes downstream
 * (unchanged: skip entirely; duplicate: reject and count against the
 * pipeline's `duplicatesRejected` metric).
 */
export async function checkForDuplicate(event: NormalizedEvent, index: DuplicateIndex): Promise<DedupeOutcome> {
  const contentHash = await computeContentHash(event)

  const byId = await index.findById(event.id)
  if (byId) {
    const changes = diffEvent(byId, event, event.updatedAt)
    return changes.length > 0
      ? { kind: 'updated', existingId: event.id, changes }
      : { kind: 'unchanged', existingId: event.id }
  }

  const byHash = await index.findByContentHash(contentHash)
  if (byHash) {
    return { kind: 'duplicate', existingId: byHash.id }
  }

  const bySimilarity = await index.findSimilar({
    title: event.title,
    description: event.description,
    category: event.category,
    country: event.country,
    publishedAt: event.publishedAt,
    source: event.source,
  })
  if (bySimilarity) {
    return { kind: 'duplicate', existingId: bySimilarity.id }
  }

  return { kind: 'new' }
}
