import { useCallback, useEffect, useState } from 'react'
import { ApiNotConfiguredError } from '../lib/api/client'
import { fetchAdminProfiles, type ProfileRecord } from '../lib/api/admin'

export type AdminProfilesStatus = 'loading' | 'ready' | 'empty' | 'error' | 'not-configured'

export interface UseAdminProfilesResult {
  profiles: ProfileRecord[]
  status: AdminProfilesStatus
  error: unknown
  refresh: () => void
}

export function useAdminProfiles(): UseAdminProfilesResult {
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [status, setStatus] = useState<AdminProfilesStatus>('loading')
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchAdminProfiles()
      .then((res) => {
        setProfiles(res)
        setError(null)
        setStatus(res.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        setError(err)
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { profiles, status, error, refresh: load }
}
