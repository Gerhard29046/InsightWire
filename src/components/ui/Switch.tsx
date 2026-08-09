import { clsx } from 'clsx'

interface SwitchProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  /** Only needed when the switch has no adjacent visible label — every current call site has one, so this stays optional. */
  'aria-label'?: string
}

/**
 * The one switch/toggle control for the whole app — every boolean setting
 * (source enable/disable, notification prefs, appearance toggles) renders
 * this rather than a bespoke `role="switch"` button, so a visual change here
 * propagates everywhere. Reads `--accent`/`--accent-hover` (index.css),
 * which Administration > Appearance writes at runtime — the active state
 * follows the site's configured accent colour automatically.
 */
export function Switch({ checked, onChange, disabled, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked
          ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
          : 'bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600',
      )}
    >
      <span
        className={clsx(
          'absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}
