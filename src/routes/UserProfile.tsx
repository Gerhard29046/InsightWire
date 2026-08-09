import { useId } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { ShieldAlert, Moon, Sun, SunMoon } from 'lucide-react'
import { useTheme } from '../lib/useTheme'
import { useSiteConfig } from '../lib/useSiteConfig'
import type { ThemeOverride } from '../lib/ThemeContext'
import type { NotificationsConfig } from '../lib/siteConfig'
import { NOTIFICATION_TOGGLES } from '../lib/notificationConfigFields'
import { Switch } from '../components/ui/Switch'

const THEME_OPTIONS: { value: ThemeOverride; label: string; icon: typeof Sun }[] = [
  { value: null, label: 'Use site default', icon: SunMoon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export default function UserProfile() {
  const { override, setOverride } = useTheme()
  const { notifications, status, updateConfig } = useSiteConfig()
  const headingId = useId()

  const toggle = (key: keyof NotificationsConfig) => {
    if (typeof notifications[key] !== 'boolean') return
    void updateConfig('notifications', { ...notifications, [key]: !notifications[key] })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your account and preferences.</p>
      </div>

      <section className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="text-amber-900 dark:text-amber-200">
          <p className="font-medium">Authentication not configured</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">
            InsightWire does not yet have user accounts or sign-in. Every session currently shares one workspace
            identity server-side. There is no personal profile, avatar, or password to manage yet — this page is the
            framework for when Supabase Auth is enabled. See{' '}
            <Link to="/admin" className="underline hover:no-underline">Administration → Users</Link> for the account
            framework status.
          </p>
        </div>
      </section>

      <section id="preferences" className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Theme</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Overrides Administration's site-wide default for this device only. Stored locally, not in your account.
            </p>
          </div>
          <div role="radiogroup" aria-label="Theme" className="inline-flex shrink-0 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={override === opt.value}
                onClick={() => setOverride(opt.value)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  override === opt.value
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )}
              >
                <opt.icon className="h-3.5 w-3.5" aria-hidden />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Applies to this workspace via the shared site configuration.
          {status === 'not-configured' && ' The config API is not reachable, so this can\'t be edited right now.'}
        </p>
        <div className="mt-4 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {NOTIFICATION_TOGGLES.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
              </div>
              <Switch
                checked={Boolean(notifications[item.key])}
                disabled={status !== 'ready'}
                onChange={() => toggle(item.key)}
                aria-label={item.label}
              />
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Manage saved searches and bookmark alerts in{' '}
        <Link to="/workspace" className="underline hover:no-underline">Workspace</Link>. Review platform policies in{' '}
        <Link to="/legal" className="underline hover:no-underline">Legal &amp; Compliance</Link>.
      </p>
    </div>
  )
}
