import { useContext } from 'react'
import { SiteConfigContext, type SiteConfigContextValue } from './SiteConfigContext'

export function useSiteConfig(): SiteConfigContextValue {
  const ctx = useContext(SiteConfigContext)
  if (!ctx) throw new Error('useSiteConfig must be used within a SiteConfigProvider')
  return ctx
}
