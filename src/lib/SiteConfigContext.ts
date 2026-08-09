import { createContext } from 'react'
import type { AppearanceConfig, ConfigKey, NavigationConfig, NotificationsConfig, SiteConfigStatus } from './siteConfig'

export interface SiteConfigContextValue {
  appearance: AppearanceConfig
  navigation: NavigationConfig
  notifications: NotificationsConfig
  status: SiteConfigStatus
  updateConfig: (key: ConfigKey, value: Record<string, unknown>) => Promise<void>
  refresh: () => void
}

export const SiteConfigContext = createContext<SiteConfigContextValue | undefined>(undefined)
