import type { CategoryId } from './categories'
import { severityOrder, type Severity } from './severity'

/**
 * Mock intelligence data.
 *
 * There is no backend yet (see docs/decisions/0001-mcp-server-setup.md —
 * Cloudflare/Supabase are still deferred), so this module stands in for the
 * eventual crawler + AI-scoring pipeline. Shapes here are meant to be the
 * real API contract, not throwaway fixtures — swap the exports for fetch
 * calls once the data layer lands, the component layer shouldn't need to
 * change.
 */

export interface IntelEvent {
  id: string
  headline: string
  summary: string
  category: CategoryId
  severity: Severity
  region: string
  source: string
  sourceUrl: string
  /** AI-assigned signal/impact score, 0-100. */
  score: number
  entities: string[]
  publishedAt: string
}

export interface StorySuggestion {
  id: string
  title: string
  angle: string
  category: CategoryId
  /** AI confidence this is a real, followable story, 0-1. */
  confidence: number
  relatedEventIds: string[]
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export const mockEvents: IntelEvent[] = [
  {
    id: 'ev-1',
    headline: 'Treasury quietly reshuffles debt-issuance schedule ahead of Q3',
    summary:
      'A procedural notice buried in the daily register moves $40B of bond auctions two weeks earlier than prior guidance — three trading desks flagged it as inconsistent with public messaging within the hour.',
    category: 'government',
    severity: 'high',
    region: 'United States',
    source: 'Federal Register',
    sourceUrl: '#',
    score: 82,
    entities: ['U.S. Treasury', 'Federal Reserve'],
    publishedAt: minutesAgo(18),
  },
  {
    id: 'ev-2',
    headline: 'Ceasefire talks collapse; evacuation orders issued within hours',
    summary:
      'Negotiators walked back from a near-final draft after an unreported personnel change on one delegation — border-region evacuation orders followed less than six hours later.',
    category: 'conflicts',
    severity: 'critical',
    region: 'Eastern border region',
    source: 'Satellite imagery + wire',
    sourceUrl: '#',
    score: 94,
    entities: ['Delegation A', 'Delegation B', 'UN Observer Mission'],
    publishedAt: minutesAgo(7),
  },
  {
    id: 'ev-3',
    headline: 'Unusual options volume builds hours before earnings blackout',
    summary:
      "Out-of-the-money volume on a mid-cap industrial spiked 14x its 30-day average less than a day before the company's self-imposed blackout window — no scheduled catalyst on record.",
    category: 'markets',
    severity: 'critical',
    region: 'NYSE',
    source: 'SEC EDGAR + exchange tape',
    sourceUrl: '#',
    score: 91,
    entities: ['Meridian Industrial Corp'],
    publishedAt: minutesAgo(24),
  },
  {
    id: 'ev-4',
    headline: 'Storm track revision puts refinery corridor inside the cone',
    summary:
      'The latest advisory shifts the projected landfall 60 miles east, placing a major refining corridor inside the cone for the first time — it currently sits outside every mandatory evacuation zone.',
    category: 'weather',
    severity: 'critical',
    region: 'Gulf Coast, US',
    source: 'NOAA National Hurricane Center',
    sourceUrl: '#',
    score: 88,
    entities: ['NOAA', 'Gulf Coast Refining Corridor'],
    publishedAt: minutesAgo(35),
  },
  {
    id: 'ev-5',
    headline: 'Swing-county voter roll shows anomaly pattern distinct from past errors',
    summary:
      'A batch of ~1,200 address changes doesn\'t match the signature of prior clerical-error incidents in the same county clerk\'s office — flagged for follow-up, not yet characterized.',
    category: 'elections',
    severity: 'high',
    region: 'Midwest, US',
    source: 'County clerk public records',
    sourceUrl: '#',
    score: 76,
    entities: ['County Clerk Office'],
    publishedAt: minutesAgo(51),
  },
  {
    id: 'ev-6',
    headline: 'Regional court grants emergency injunction against port operator',
    summary:
      'A lightly-covered filing halts cargo operations at a mid-size Gulf port pending environmental review — logistics chatter points to supply-chain effects within days.',
    category: 'courts',
    severity: 'medium',
    region: 'Gulf Coast, US',
    source: 'PACER filings',
    sourceUrl: '#',
    score: 61,
    entities: ['Port Authority', '5th Circuit Court'],
    publishedAt: minutesAgo(66),
  },
  {
    id: 'ev-7',
    headline: 'Inspector general report on agency contracting leaked ahead of release',
    summary:
      'A draft copy circulating among staffers describes contracting irregularities the agency has not yet publicly acknowledged; official release isn\'t scheduled for another two weeks.',
    category: 'government',
    severity: 'medium',
    region: 'United States',
    source: 'Leaked draft document',
    sourceUrl: '#',
    score: 63,
    entities: ['Office of Inspector General'],
    publishedAt: minutesAgo(89),
  },
  {
    id: 'ev-8',
    headline: 'CEO resignation rumor spreads faster than any official statement',
    summary:
      'Internal-comms screenshots (unverified) suggest a leadership change is imminent; the company\'s official channels have been silent for 36 hours, itself unusual for the firm.',
    category: 'business',
    severity: 'medium',
    region: 'United States',
    source: 'Employee forums + wire',
    sourceUrl: '#',
    score: 58,
    entities: ['Northbridge Holdings'],
    publishedAt: minutesAgo(112),
  },
  {
    id: 'ev-9',
    headline: 'Central bank official\'s offhand remark moves long-end yields',
    summary:
      'A single line from a Q&A session — not the prepared remarks — was enough to move the 10-year seven basis points intraday; transcript wording under scrutiny.',
    category: 'markets',
    severity: 'medium',
    region: 'Eurozone',
    source: 'Central bank transcript',
    sourceUrl: '#',
    score: 55,
    entities: ['European Central Bank'],
    publishedAt: minutesAgo(140),
  },
  {
    id: 'ev-10',
    headline: 'High-profile preprint quietly retracted, no public statement yet',
    summary:
      'A widely-cited preprint from a major lab was pulled from the server overnight with no retraction notice; co-authors\' institutional pages have already scrubbed the reference.',
    category: 'science',
    severity: 'low',
    region: 'Global',
    source: 'Preprint server logs',
    sourceUrl: '#',
    score: 44,
    entities: ['Whitfield Neuroscience Lab'],
    publishedAt: minutesAgo(175),
  },
  {
    id: 'ev-11',
    headline: 'Patent filing hints at product category the company has denied pursuing',
    summary:
      'A newly public patent application overlaps closely with a product line executives explicitly denied developing on the last earnings call.',
    category: 'business',
    severity: 'low',
    region: 'United States',
    source: 'USPTO filings',
    sourceUrl: '#',
    score: 39,
    entities: ['Northbridge Holdings'],
    publishedAt: minutesAgo(210),
  },
  {
    id: 'ev-12',
    headline: 'Satellite imagery shows troop movement near contested border',
    summary:
      'Commercial satellite passes show vehicle staging consistent with a logistics build-up rather than a routine rotation — pattern last seen ahead of prior escalations.',
    category: 'conflicts',
    severity: 'high',
    region: 'Contested border region',
    source: 'Commercial satellite imagery',
    sourceUrl: '#',
    score: 79,
    entities: ['Border Defense Forces'],
    publishedAt: minutesAgo(240),
  },
]

export const mockStorySuggestions: StorySuggestion[] = [
  {
    id: 'story-1',
    title: 'Treasury\'s quiet reshuffle and the desks that noticed first',
    angle:
      'Three independent trading desks flagged the debt-schedule change within an hour of each other — worth asking who told them, and why the public guidance didn\'t match.',
    category: 'government',
    confidence: 0.81,
    relatedEventIds: ['ev-1'],
  },
  {
    id: 'story-2',
    title: 'The evacuation zone that didn\'t move with the storm',
    angle:
      'The refinery corridor sits inside the revised storm cone but outside every current mandatory-evacuation boundary — a gap worth mapping before landfall, not after.',
    category: 'weather',
    confidence: 0.74,
    relatedEventIds: ['ev-4'],
  },
  {
    id: 'story-3',
    title: 'A ceasefire that collapsed in under six hours',
    angle:
      'The public narrative blames a disputed treaty clause; the timeline suggests the actual trigger was an unreported personnel change nobody has asked about yet.',
    category: 'conflicts',
    confidence: 0.68,
    relatedEventIds: ['ev-2', 'ev-12'],
  },
  {
    id: 'story-4',
    title: 'Swing-county voter rolls: clerical error, or something else?',
    angle:
      'The anomaly pattern doesn\'t match this office\'s past clerical-error incidents — a comparative records request could settle it either way before it becomes a bigger story.',
    category: 'elections',
    confidence: 0.57,
    relatedEventIds: ['ev-5'],
  },
]

export const mockSources = [
  'Federal Register',
  'PACER court filings',
  'SEC EDGAR',
  'USPTO filings',
  'NOAA National Hurricane Center',
  'Commercial satellite imagery',
  'County clerk public records',
  'Central bank transcripts',
  'Preprint servers',
]

export interface SavedSearch {
  id: string
  name: string
  /** Empty means "any category". */
  categories: CategoryId[]
  minSeverity: Severity
}

export const mockSavedSearches: SavedSearch[] = [
  { id: 'ss-1', name: 'Critical — any category', categories: [], minSeverity: 'critical' },
  { id: 'ss-2', name: 'Markets & business shocks', categories: ['markets', 'business'], minSeverity: 'high' },
  { id: 'ss-3', name: 'Conflict escalation', categories: ['conflicts'], minSeverity: 'medium' },
  { id: 'ss-4', name: 'Election integrity', categories: ['elections'], minSeverity: 'medium' },
]

export function matchesSavedSearch(event: IntelEvent, search: SavedSearch): boolean {
  const categoryMatch =
    search.categories.length === 0 || search.categories.includes(event.category)
  const severeEnough =
    severityOrder.indexOf(event.severity) <= severityOrder.indexOf(search.minSeverity)
  return categoryMatch && severeEnough
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}
