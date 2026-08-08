import { useCallback, useEffect, useState } from 'react'
import { EntityBriefNotFoundError, fetchLatestEntityBrief, generateEntityBrief, type EntityBrief } from '../lib/api/entityBrief'

export type EntityBriefStatus = 'checking' | 'none' | 'generating' | 'ready' | 'error'

export interface UseEntityBriefResult {
  brief: EntityBrief | undefined
  status: EntityBriefStatus
  error: unknown
  generate: () => void
}

/** Checks for a cached brief on mount (no API cost); generating a new one is always an explicit user action, never automatic — same pattern as useJournalistBrief. */
export function useEntityBrief(entityId: string | undefined): UseEntityBriefResult {
  const [brief, setBrief] = useState<EntityBrief | undefined>(undefined)
  const [status, setStatus] = useState<EntityBriefStatus>('checking')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    setStatus('checking')
    fetchLatestEntityBrief(entityId)
      .then((res) => {
        if (cancelled) return
        setBrief(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof EntityBriefNotFoundError) {
          setStatus('none')
        } else {
          setError(err)
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [entityId])

  const generate = useCallback(() => {
    if (!entityId) return
    setStatus('generating')
    setError(null)
    generateEntityBrief(entityId)
      .then((res) => {
        setBrief(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus('error')
      })
  }, [entityId])

  return { brief, status, error, generate }
}
