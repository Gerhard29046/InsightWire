import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchConfig, updateConfigEntry } from './api/admin'
import { ApiNotConfiguredError } from './api/client'
import { SiteConfigContext } from './SiteConfigContext'
import { applyAccentColor } from './accentColors'
import { SITE_APPEARANCE_CACHE_KEY } from './themeBootstrap'

/**
 * The single source of truth for site configuration — Administration writes
 * here (via `updateConfigEntry`, real `PATCH /admin/config/:key`), every
 * component reads from this one context (`useSiteConfig`, in its own file
 * so this one stays component-only for Fast Refresh). No component keeps
 * its own copy of a setting. See
 * supabase/migrations/20260809120000_administration.sql's own doc comment
 * on `app_config`.
 */
export interface AppearanceConfig {
  defaultTheme: 'light' | 'dark' | 'system'
  accentColor: string
  density: 'comfortable' | 'compact'
}

export interface NavigationConfig {
  visibleItems: string[]
}

export interface NotificationsConfig {
  breakingAlerts: boolean
  savedSearchAlerts: boolean
  entityAlerts: boolean
  systemAlerts: boolean
  frequency: 'immediate' | 'hourly' | 'daily'
  browserNotifications: boolean
}

export type ConfigKey = 'appearance' | 'navigation' | 'notifications'
export type SiteConfigStatus = 'loading' | 'ready' | 'error' | 'not-configured'

const DEFAULTS: { appearance: AppearanceConfig; navigation: NavigationConfig; notifications: NotificationsConfig } = {
  appearance: { defaultTheme: 'system', accentColor: 'sky', density: 'comfortable' },
  navigation: { visibleItems: ['dashboard', 'feed', 'calendar', 'alerts', 'entities', 'timeline', 'map', 'workspace', 'assistant', 'admin'] },
  notifications: { breakingAlerts: true, savedSearchAlerts: true, entityAlerts: false, systemAlerts: true, frequency: 'immediate', browserNotifications: false },
}

/** An empty/missing/malformed `visibleItems` (a corrupt config row, a bad manual edit) must never resolve to an empty or broken sidebar — falls back to the full canonical list rather than trusting a shape that looks invalid. Real per-item hiding still works normally; this only guards the degenerate cases. Core items are additionally protected at render time regardless of this (see CORE_NAV_ITEM_IDS in navigation.ts). */
function sanitizeNavigationConfig(value: Partial<NavigationConfig> | undefined): NavigationConfig {
  if (!value || !Array.isArray(value.visibleItems) || value.visibleItems.length === 0) {
    return DEFAULTS.navigation
  }
  return { visibleItems: value.visibleItems }
}

/** Applies appearance to the live DOM (CSS vars + density attribute) and caches it for the zero-flash bootstrap script in index.html to read synchronously on the next page load, before React or any network fetch runs. */
function applyAppearance(appearance: AppearanceConfig) {
  applyAccentColor(appearance.accentColor)
  document.documentElement.setAttribute('data-density', appearance.density)
  try {
    localStorage.setItem(SITE_APPEARANCE_CACHE_KEY, JSON.stringify(appearance))
  } catch {
    // Private browsing / storage disabled — the live DOM update above already succeeded, only the next-load cache is skipped.
  }
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceConfig>(DEFAULTS.appearance)
  const [navigation, setNavigation] = useState<NavigationConfig>(DEFAULTS.navigation)
  const [notifications, setNotifications] = useState<NotificationsConfig>(DEFAULTS.notifications)
  const [status, setStatus] = useState<SiteConfigStatus>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    fetchConfig()
      .then((entries) => {
        for (const entry of entries) {
          if (entry.key === 'appearance') setAppearance({ ...DEFAULTS.appearance, ...(entry.value as Partial<AppearanceConfig>) })
          if (entry.key === 'navigation') setNavigation(sanitizeNavigationConfig(entry.value as Partial<NavigationConfig>))
          if (entry.key === 'notifications') setNotifications({ ...DEFAULTS.notifications, ...(entry.value as Partial<NotificationsConfig>) })
        }
        setStatus('ready')
      })
      .catch((err: unknown) => {
        // Falls back to real, honest defaults — never a fabricated config
        // state; the admin UI itself will show "not configured" for editing.
        setStatus(err instanceof ApiNotConfiguredError ? 'not-configured' : 'error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    applyAppearance(appearance)
  }, [appearance])

  const updateConfig = useCallback(async (key: ConfigKey, value: Record<string, unknown>) => {
    const entry = await updateConfigEntry(key, value)
    if (key === 'appearance') setAppearance({ ...DEFAULTS.appearance, ...(entry.value as Partial<AppearanceConfig>) })
    if (key === 'navigation') setNavigation(sanitizeNavigationConfig(entry.value as Partial<NavigationConfig>))
    if (key === 'notifications') setNotifications({ ...DEFAULTS.notifications, ...(entry.value as Partial<NotificationsConfig>) })
  }, [])

  const value = useMemo(
    () => ({ appearance, navigation, notifications, status, updateConfig, refresh: load }),
    [appearance, navigation, notifications, status, updateConfig, load],
  )

  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>
}
