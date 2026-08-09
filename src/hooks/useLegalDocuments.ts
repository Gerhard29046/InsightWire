import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchLegalDocument, fetchLegalDocuments, type LegalDocument } from '../lib/api/admin'

export type LegalStatus = 'loading' | 'ready' | 'error' | 'not-configured' | 'not-found'

export function useLegalDocuments(): { documents: LegalDocument[]; status: LegalStatus; error: unknown } {
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [status, setStatus] = useState<LegalStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    setStatus('loading')
    fetchLegalDocuments()
      .then((res) => {
        setDocuments(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  return { documents, status, error }
}

export function useLegalDocument(slug: string | undefined): { document: LegalDocument | null; status: LegalStatus; error: unknown; refresh: () => void } {
  const [document, setDocument] = useState<LegalDocument | null>(null)
  const [status, setStatus] = useState<LegalStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    if (!slug) return
    setStatus('loading')
    fetchLegalDocument(slug)
      .then((res) => {
        setDocument(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err)
        if (err instanceof ApiNotConfiguredError) setStatus('not-configured')
        else if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) setStatus('not-found')
        else setStatus('error')
      })
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  return { document, status, error, refresh: load }
}
