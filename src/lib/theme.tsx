import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme, type ThemeOverride } from './ThemeContext'
import { useSiteConfig } from './useSiteConfig'
import { THEME_OVERRIDE_KEY, resolveIsDark } from './themeBootstrap'

function getStoredOverride(): ThemeOverride {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(THEME_OVERRIDE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

/**
 * Resolves the real three-tier theme hierarchy: a personal override (set
 * from the Profile page or the topbar's quick toggle, persisted in
 * localStorage) beats Administration's site-wide default
 * (`appearance.defaultTheme`, from `useSiteConfig()`), which itself falls
 * back to the OS preference when set to 'system'. The `.dark` class this
 * applies is also set synchronously by index.html's inline bootstrap script
 * on first paint (before this provider mounts) using the same priority
 * order, so there is no flash — this effect only ever reconciles the class
 * for subsequent, in-session changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { appearance } = useSiteConfig()
  const [override, setOverrideState] = useState<ThemeOverride>(getStoredOverride)
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const isDark = resolveIsDark(override, appearance.defaultTheme, prefersDark)
  const theme: Theme = isDark ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const setOverride = useCallback((next: ThemeOverride) => {
    setOverrideState(next)
    try {
      if (next) window.localStorage.setItem(THEME_OVERRIDE_KEY, next)
      else window.localStorage.removeItem(THEME_OVERRIDE_KEY)
    } catch {
      // Private browsing / storage disabled — the in-memory override still applies for this session.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setOverride(isDark ? 'light' : 'dark')
  }, [isDark, setOverride])

  const value = useMemo(
    () => ({ theme, override, setOverride, toggleTheme }),
    [theme, override, setOverride, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
