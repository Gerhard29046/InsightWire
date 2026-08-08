import type { LucideIcon } from 'lucide-react'
import {
  Landmark,
  Siren,
  Cpu,
  Briefcase,
  Leaf,
  CloudLightning,
  Swords,
  Trophy,
  Clapperboard,
} from 'lucide-react'

/**
 * Calendar-scoped category taxonomy.
 *
 * Deliberately separate from `categories.ts` (the government/business/courts/
 * markets/elections/weather/conflicts/science set used by Dashboard, Feed,
 * and Alerts). This page's filters were specified against a different,
 * broader list — keeping them apart avoids a colorblind-safety re-validation
 * of the shared dataviz palette for a page-local concern.
 */
export type CalendarCategoryId =
  | 'politics'
  | 'crime'
  | 'technology'
  | 'business'
  | 'environment'
  | 'weather'
  | 'conflict'
  | 'sports'
  | 'entertainment'

export interface CalendarCategoryMeta {
  id: CalendarCategoryId
  label: string
  icon: LucideIcon
  dot: string
  text: string
  bg: string
}

export const calendarCategories: CalendarCategoryMeta[] = [
  { id: 'politics', label: 'Politics', icon: Landmark, dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'crime', label: 'Crime', icon: Siren, dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' },
  { id: 'technology', label: 'Technology', icon: Cpu, dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
  { id: 'business', label: 'Business', icon: Briefcase, dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'environment', label: 'Environment', icon: Leaf, dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  { id: 'weather', label: 'Weather', icon: CloudLightning, dot: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/10' },
  { id: 'conflict', label: 'Conflict', icon: Swords, dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'sports', label: 'Sports', icon: Trophy, dot: 'bg-lime-500', text: 'text-lime-600 dark:text-lime-400', bg: 'bg-lime-500/10' },
  { id: 'entertainment', label: 'Entertainment', icon: Clapperboard, dot: 'bg-pink-500', text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-500/10' },
]

export const calendarCategoryById = Object.fromEntries(
  calendarCategories.map((c) => [c.id, c]),
) as Record<CalendarCategoryId, CalendarCategoryMeta>

export const countries = [
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Ukraine',
  'Israel',
  'China',
  'Japan',
  'Brazil',
  'Global',
]

export const industries = [
  'Finance',
  'Energy',
  'Technology',
  'Government',
  'Defense',
  'Media',
  'Healthcare',
  'Agriculture',
  'Retail',
]

export interface CalendarEvent {
  id: string
  title: string
  category: CalendarCategoryId
  country: string
  industry: string
  /** ISO date, yyyy-mm-dd. */
  date: string
  time: string
  type: string
}

const pad = (n: number): string => n.toString().padStart(2, '0')

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const today = new Date()
const dayKey = (offset: number): string => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return toDateKey(d)
}

export const mockCalendarEvents: CalendarEvent[] = [
  { id: 'cal-1', title: 'Fed Chair testimony before Senate Banking Committee', category: 'politics', country: 'United States', industry: 'Finance', date: dayKey(1), time: '10:00', type: 'Hearing' },
  { id: 'cal-2', title: 'UK Parliament: Prime Minister\'s Questions', category: 'politics', country: 'United Kingdom', industry: 'Government', date: dayKey(2), time: '12:00', type: 'Parliament session' },
  { id: 'cal-3', title: 'Trial verdict expected: State v. Whitfield fraud case', category: 'crime', country: 'United States', industry: 'Government', date: dayKey(3), time: '09:30', type: 'Court date' },
  { id: 'cal-4', title: 'Apple Q3 earnings call', category: 'business', country: 'United States', industry: 'Technology', date: dayKey(3), time: '17:00', type: 'Earnings call' },
  { id: 'cal-5', title: 'OPEC+ ministerial meeting', category: 'business', country: 'Global', industry: 'Energy', date: dayKey(5), time: '08:00', type: 'Summit' },
  { id: 'cal-6', title: 'COP climate finance summit opens', category: 'environment', country: 'Global', industry: 'Government', date: dayKey(5), time: '09:00', type: 'Summit' },
  { id: 'cal-7', title: 'NOAA tropical storm advisory update', category: 'weather', country: 'United States', industry: 'Government', date: dayKey(0), time: '14:00', type: 'Advisory' },
  { id: 'cal-8', title: 'Ceasefire talks resume, second round', category: 'conflict', country: 'Ukraine', industry: 'Government', date: dayKey(4), time: '11:00', type: 'Negotiation' },
  { id: 'cal-9', title: 'World Athletics Championships opening ceremony', category: 'sports', country: 'Global', industry: 'Media', date: dayKey(8), time: '19:00', type: 'Ceremony' },
  { id: 'cal-10', title: 'Cannes-adjacent film festival awards night', category: 'entertainment', country: 'France', industry: 'Media', date: dayKey(7), time: '20:00', type: 'Awards' },
  { id: 'cal-11', title: 'German Bundestag budget debate', category: 'politics', country: 'Germany', industry: 'Government', date: dayKey(-2), time: '10:00', type: 'Parliament session' },
  { id: 'cal-12', title: 'Tokyo District Court antitrust ruling', category: 'crime', country: 'Japan', industry: 'Technology', date: dayKey(-1), time: '10:00', type: 'Court date' },
  { id: 'cal-13', title: 'Brazil central bank rate decision', category: 'business', country: 'Brazil', industry: 'Finance', date: dayKey(6), time: '18:00', type: 'Rate decision' },
  { id: 'cal-14', title: 'SpaceX launch window opens', category: 'technology', country: 'United States', industry: 'Technology', date: dayKey(9), time: '13:15', type: 'Launch' },
  { id: 'cal-15', title: 'Knesset special session', category: 'politics', country: 'Israel', industry: 'Government', date: dayKey(-3), time: '11:00', type: 'Parliament session' },
  { id: 'cal-16', title: 'China manufacturing PMI release', category: 'business', country: 'China', industry: 'Finance', date: dayKey(10), time: '01:45', type: 'Data release' },
  { id: 'cal-17', title: 'Grain corridor review meeting', category: 'conflict', country: 'Ukraine', industry: 'Agriculture', date: dayKey(12), time: '09:00', type: 'Negotiation' },
  { id: 'cal-18', title: 'Wildfire containment briefing', category: 'environment', country: 'United States', industry: 'Government', date: dayKey(0), time: '16:00', type: 'Briefing' },
]

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}
