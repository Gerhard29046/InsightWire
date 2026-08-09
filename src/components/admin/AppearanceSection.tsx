import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Check, RotateCcw } from 'lucide-react'
import type { AppearanceConfig, ConfigKey, SiteConfigStatus } from '../../lib/siteConfig'
import { ACCENT_NAMES, resolveAccent, type AccentName } from '../../lib/accentColors'

const THEMES = ['system', 'light', 'dark'] as const
const DENSITIES = ['comfortable', 'compact'] as const

interface AppearanceSectionProps {
  appearance: AppearanceConfig
  status: SiteConfigStatus
  updateConfig: (key: ConfigKey, value: Record<string, unknown>) => Promise<void>
}

function AppearancePreview({ draft }: { draft: AppearanceConfig }) {
  const palette = resolveAccent(draft.accentColor)
  const isDark =
    draft.defaultTheme === 'dark' ||
    (draft.defaultTheme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const compact = draft.density === 'compact'
  const surface = isDark ? '#0f172a' : '#ffffff'
  const border = isDark ? '#1e293b' : '#e2e8f0'
  const ink = isDark ? '#f1f5f9' : '#0f172a'
  const muted = isDark ? '#94a3b8' : '#64748b'
  const pad = compact ? '6px 10px' : '10px 16px'
  const gap = compact ? 8 : 14

  return (
    <div
      className="rounded-xl border p-4 transition-colors"
      style={{ background: surface, borderColor: border, color: ink }}
    >
      <p className="mb-3 text-[11px] font-semibold tracking-wide uppercase" style={{ color: muted }}>
        Preview
      </p>
      <div className="flex flex-wrap items-center" style={{ gap }}>
        <span
          className="inline-flex items-center rounded-lg text-sm font-medium"
          style={{ padding: pad, background: palette.accent, color: palette.foreground }}
        >
          Primary Button
        </span>
        <span
          className="inline-flex items-center rounded-lg border-b-2 text-sm font-medium"
          style={{ padding: pad, borderColor: palette.accent, color: palette.accent }}
        >
          Active Tab
        </span>
        <span className="inline-flex items-center gap-2 text-sm" style={{ color: ink }}>
          Toggle
          <span
            className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full"
            style={{ background: palette.accent }}
          >
            <span className="absolute top-1 left-6 h-5 w-5 rounded-full bg-white shadow-md" />
          </span>
        </span>
      </div>
      <p className="mt-3 text-sm" style={{ color: muted, padding: compact ? '2px 0' : '6px 0' }}>
        Example text at {compact ? 'compact' : 'comfortable'} density, {isDark ? 'dark' : 'light'} mode.
      </p>
    </div>
  )
}

export function AppearanceSection({ appearance, status, updateConfig }: AppearanceSectionProps) {
  const [draft, setDraft] = useState<AppearanceConfig>(appearance)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Reseeds whenever the committed config identity changes (initial load, or
  // right after a successful Apply elsewhere) — never fires mid-edit, since
  // nothing else writes to `appearance` while this form is open.
  useEffect(() => {
    setDraft(appearance)
  }, [appearance])

  const disabled = status !== 'ready'
  const dirty =
    draft.defaultTheme !== appearance.defaultTheme ||
    draft.accentColor !== appearance.accentColor ||
    draft.density !== appearance.density

  const apply = async () => {
    setSaving(true)
    try {
      await updateConfig('appearance', { ...draft })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => setDraft(appearance)

  return (
    <section id="appearance" className="scroll-mt-20 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h2>
        <div className="flex items-center gap-2 text-xs">
          {justSaved ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Changes saved
            </span>
          ) : (
            <span className={dirty ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}>
              {dirty ? 'Unsaved changes' : 'No unsaved changes'}
            </span>
          )}
          <button
            type="button"
            onClick={reset}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Reset
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!dirty || saving || disabled}
            aria-live="polite"
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Default theme
          <select
            value={draft.defaultTheme}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, defaultTheme: e.target.value as AppearanceConfig['defaultTheme'] }))}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Accent color
          <div className="flex flex-wrap gap-2 pt-0.5">
            {ACCENT_NAMES.map((name) => (
              <AccentSwatch
                key={name}
                name={name}
                selected={draft.accentColor === name}
                disabled={disabled}
                onSelect={() => setDraft((d) => ({ ...d, accentColor: name }))}
              />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Density
          <select
            value={draft.density}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, density: e.target.value as AppearanceConfig['density'] }))}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {DENSITIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <AppearancePreview draft={draft} />
      </div>

      <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
        Sets the site-wide default. Individual users can still override the theme locally from their Profile page —
        a personal override always wins over this setting.
      </p>
    </section>
  )
}

function AccentSwatch({ name, selected, disabled, onSelect }: { name: AccentName; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const palette = resolveAccent(name)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={name}
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        'h-7 w-7 rounded-full ring-offset-2 ring-offset-white transition-shadow disabled:opacity-40 dark:ring-offset-slate-900',
        selected ? 'ring-2 ring-slate-900 dark:ring-white' : 'hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600',
      )}
      style={{ background: palette.accent }}
    />
  )
}
