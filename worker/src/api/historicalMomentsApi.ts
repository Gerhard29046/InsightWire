import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CategoryId } from '@insightwire/shared'

export interface HistoricalMomentsApiConfig {
  url: string
  serviceRoleKey: string
}

function client({ url, serviceRoleKey }: HistoricalMomentsApiConfig): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type Significance = 'major' | 'notable'

export interface HistoricalMoment {
  id: string
  title: string
  summary: string
  startDate: string
  endDate: string | null
  significance: Significance
  category: CategoryId | null
  region: string | null
  countries: string[]
  sourceUrls: string[]
  createdAt: string
}

interface HistoricalMomentRow {
  id: string
  title: string
  summary: string
  start_date: string
  end_date: string | null
  significance: Significance
  category: CategoryId | null
  region: string | null
  countries: string[]
  source_urls: string[]
  created_at: string
}

const SELECT_COLUMNS = 'id, title, summary, start_date, end_date, significance, category, region, countries, source_urls, created_at'

function fromRow(row: HistoricalMomentRow): HistoricalMoment {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    startDate: row.start_date,
    endDate: row.end_date,
    significance: row.significance,
    category: row.category,
    region: row.region,
    countries: row.countries ?? [],
    sourceUrls: row.source_urls ?? [],
    createdAt: row.created_at,
  }
}

/**
 * Real rows only, oldest first (a timeline reads chronologically) — this
 * table is expected to be genuinely empty until a real curation process
 * exists (see 20260808090000_historical_moments.sql's own comment); an
 * empty array here is the honest, correct result, not a bug to work around
 * with placeholder content.
 */
export async function listHistoricalMoments(config: HistoricalMomentsApiConfig): Promise<HistoricalMoment[]> {
  const supabase = client(config)
  const { data, error } = await supabase.from('historical_moments').select(SELECT_COLUMNS).order('start_date', { ascending: true })
  if (error) throw new Error(`listHistoricalMoments query failed: ${error.message}`)
  return ((data ?? []) as HistoricalMomentRow[]).map(fromRow)
}

export async function getHistoricalMomentDetail(config: HistoricalMomentsApiConfig, id: string): Promise<HistoricalMoment | undefined> {
  const supabase = client(config)
  const { data, error } = await supabase.from('historical_moments').select(SELECT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`getHistoricalMomentDetail query failed: ${error.message}`)
  return data ? fromRow(data as HistoricalMomentRow) : undefined
}
