import { createContext } from 'react'

export type Theme = 'light' | 'dark'
/** null = no personal override; the site default (Administration > Appearance) applies. */
export type ThemeOverride = Theme | null

export interface ThemeContextValue {
  /** The theme actually applied right now, after resolving override → site default → system preference. */
  theme: Theme
  /** The user's personal override, if any — set from the Profile page (or the quick topbar toggle). */
  override: ThemeOverride
  setOverride: (value: ThemeOverride) => void
  /** Quick light/dark flip used by the topbar icon button — always sets an explicit personal override. */
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
)
