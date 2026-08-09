import { useSiteConfig } from '../../lib/useSiteConfig'
import { CORE_NAV_ITEM_IDS, navGroups } from '../../lib/navigation'
import { NOTIFICATION_TOGGLES } from '../../lib/notificationConfigFields'
import { EmptyState } from '../feed/EmptyState'
import { Switch } from '../ui/Switch'
import { AppearanceSection } from './AppearanceSection'

export function SettingsTab() {
  const { appearance, navigation, notifications, status, updateConfig } = useSiteConfig()

  if (status === 'not-configured') return <EmptyState variant="not-configured" />

  const allItems = navGroups.flatMap((g) => g.items)
  const disabled = status !== 'ready'

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        These settings are the single source of truth (<code>app_config</code>) — every page reads from{' '}
        <code>useSiteConfig()</code> rather than keeping its own copy, so changes here propagate app-wide immediately.
      </p>

      <AppearanceSection appearance={appearance} status={status} updateConfig={updateConfig} />

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Navigation</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Hide a section from the sidebar for every user of this workspace. Dashboard and Global Events Feed are core
          pages and always stay visible.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {allItems.map((item) => {
            const isCore = CORE_NAV_ITEM_IDS.includes(item.id)
            const visible = isCore || navigation.visibleItems.includes(item.id)
            return (
              <label
                key={item.id}
                title={isCore ? 'Core navigation — always visible' : undefined}
                className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200 ${isCore ? 'opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={disabled || isCore}
                  onChange={() =>
                    void updateConfig('navigation', {
                      visibleItems: visible
                        ? navigation.visibleItems.filter((id) => id !== item.id)
                        : [...navigation.visibleItems, item.id],
                    })
                  }
                />
                {item.label}
              </label>
            )
          })}
        </div>
      </section>

      <section id="notifications" className="scroll-mt-20 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h2>
        <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {NOTIFICATION_TOGGLES.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
              </div>
              <Switch
                checked={Boolean(notifications[item.key])}
                disabled={disabled}
                onChange={() => void updateConfig('notifications', { ...notifications, [item.key]: !notifications[item.key] })}
                aria-label={item.label}
              />
            </div>
          ))}
          <label className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Delivery frequency</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">How often digest-style notifications are batched.</p>
            </div>
            <select
              value={notifications.frequency}
              disabled={disabled}
              onChange={(e) => void updateConfig('notifications', { ...notifications, frequency: e.target.value })}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="immediate">Immediate</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  )
}
