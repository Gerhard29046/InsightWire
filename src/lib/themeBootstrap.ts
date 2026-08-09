/**
 * Shared constants between the React app (siteConfig.tsx, theme.tsx) and the
 * zero-flash inline bootstrap script in index.html. The bootstrap script
 * can't import this file (it runs before any bundle loads), so its copies of
 * these key names are literal strings — keep them in sync by hand if you
 * rename anything here.
 */
export const THEME_OVERRIDE_KEY = 'insightwire-theme-override'
export const SITE_APPEARANCE_CACHE_KEY = 'insightwire-site-appearance'

export interface CachedAppearance {
  defaultTheme: 'light' | 'dark' | 'system'
  accentColor: string
  density: 'comfortable' | 'compact'
}

/** User override (if any) takes priority; otherwise resolves the site default, falling through to the OS preference for 'system'. Same order the inline bootstrap script and ThemeProvider both apply. */
export function resolveIsDark(override: 'light' | 'dark' | null, siteDefault: 'light' | 'dark' | 'system', prefersDark: boolean): boolean {
  if (override === 'light') return false
  if (override === 'dark') return true
  if (siteDefault === 'light') return false
  if (siteDefault === 'dark') return true
  return prefersDark
}
