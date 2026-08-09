export type AccentName = 'sky' | 'indigo' | 'emerald' | 'amber' | 'rose'

export interface AccentPalette {
  accent: string
  hover: string
  /** Text/icon colour placed ON TOP of a solid `accent` fill — white fails contrast on amber, so this is computed per accent rather than assumed. */
  foreground: string
}

/**
 * The only place accent hex values are defined. `siteConfig.tsx` applies
 * these as `--accent`/`--accent-hover`/`--accent-foreground` CSS custom
 * properties at runtime (see index.css) — every accent-following control in
 * the app reads those variables rather than a hardcoded Tailwind colour
 * class, so changing the selection here repaints the whole app. The values
 * mirror Tailwind's own 500/600 shades for each named colour.
 */
export const ACCENT_PALETTE: Record<AccentName, AccentPalette> = {
  sky: { accent: '#0ea5e9', hover: '#0284c7', foreground: '#ffffff' },
  indigo: { accent: '#6366f1', hover: '#4f46e5', foreground: '#ffffff' },
  emerald: { accent: '#10b981', hover: '#059669', foreground: '#ffffff' },
  amber: { accent: '#f59e0b', hover: '#d97706', foreground: '#0f172a' },
  rose: { accent: '#f43f5e', hover: '#e11d48', foreground: '#ffffff' },
}

export const ACCENT_NAMES = Object.keys(ACCENT_PALETTE) as AccentName[]

export function resolveAccent(name: string): AccentPalette {
  return ACCENT_PALETTE[name as AccentName] ?? ACCENT_PALETTE.sky
}

/** Applies the three accent CSS variables to the document root — the one function that makes an accent selection visible. */
export function applyAccentColor(name: string) {
  const palette = resolveAccent(name)
  const root = document.documentElement
  root.style.setProperty('--accent', palette.accent)
  root.style.setProperty('--accent-hover', palette.hover)
  root.style.setProperty('--accent-foreground', palette.foreground)
}
