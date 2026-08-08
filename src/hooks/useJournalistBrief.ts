import { useCallback, useEffect, useState } from 'react'
import { BriefNotFoundError, fetchLatestBrief, generateBrief, type JournalistBrief } from '../lib/api/brief'

export type JournalistBriefStatus = 'checking' | 'none' | 'generating' | 'ready' | 'error'

export interface UseJournalistBriefResult {
  brief: JournalistBrief | undefined
  status: JournalistBriefStatus
  error: unknown
  generate: () => void
}

/** Checks for a cached brief on mount (no API cost); generating a new one is always an explicit user action ("Summarize this event"), never automatic. */
export function useJournalistBrief(eventId: string | undefined): UseJournalistBriefResult {
  const [brief, setBrief] = useState<JournalistBrief | undefined>(undefined)
  const [status, setStatus] = useState<JournalistBriefStatus>('checking')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    setStatus('checking')
    fetchLatestBrief(eventId)
      .then((res) => {
        if (cancelled) return
        setBrief(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof BriefNotFoundError) {
          setStatus('none')
        } else {
          setError(err)
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const generate = useCallback(() => {
    if (!eventId) return
    setStatus('generating')
    setError(null)
    generateBrief(eventId)
      .then((res) => {
        setBrief(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus('error')
      })
  }, [eventId])

  return { brief, status, error, generate }
}
