import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bell, Check, CheckCheck, Flame, Inbox, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { EmptyState } from '../feed/EmptyState'
import { LoadingSkeleton } from '../feed/LoadingSkeleton'
import type { AlertRecord, NotificationRecord } from '../../lib/api/workspace'
import type { AlertsStatus } from '../../hooks/useAlerts'
import type { NotificationsStatus } from '../../hooks/useNotifications'

function timeAgo(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

interface NotificationRowProps {
  unread: boolean
  icon: typeof Bell
  colorVar: string
  title: string
  description: string
  timestamp: string
  href?: string
  onMarkRead?: () => void
}

/**
 * Read state is purely a "have you seen this" marker on the notification
 * row itself — it never removes the row (there is no delete route for
 * alerts/notifications; see workspaceApi.ts's own doc comment) and it never
 * touches the underlying event (the Global Events Feed reads `normalized_events`
 * directly and has no concept of "read" at all). A read row stays in this
 * list, with an explicit "Read" checkmark rather than just quietly losing
 * its unread styling — the two states should both read as deliberate, not
 * "present" vs. "gone."
 */
function NotificationRow({ unread, icon: Icon, colorVar, title, description, timestamp, href, onMarkRead }: NotificationRowProps) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-lg border p-3',
        unread ? 'border-[var(--accent)]/25 bg-[var(--accent)]/40 dark:border-[var(--accent-hover)]/15 dark:bg-[var(--accent-hover)]/15' : 'border-slate-100 dark:border-slate-800',
      )}
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, var(${colorVar}) 16%, transparent)` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: `var(${colorVar})` }} aria-hidden />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className={clsx('text-sm', unread ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>{title}</p>
          {unread ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-hover)] dark:bg-[var(--accent-hover)]/15 dark:text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
              New
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
              <Check className="h-3 w-3" aria-hidden />
              Read
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
          <span>{timeAgo(timestamp)}</span>
          {href && (
            <Link to={href} onClick={onMarkRead} className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
              Open
            </Link>
          )}
          {unread && onMarkRead && (
            <button type="button" onClick={onMarkRead} className="font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface NotificationsPanelProps {
  alerts: AlertRecord[]
  alertsStatus: AlertsStatus
  notifications: NotificationRecord[]
  notificationsStatus: NotificationsStatus
  onMarkAlertRead: (id: string) => void
  onMarkAllAlertsRead: () => void
  onMarkNotificationRead: (id: string) => void
  onMarkAllNotificationsRead: () => void
}

export function NotificationsPanel({
  alerts,
  alertsStatus,
  notifications,
  notificationsStatus,
  onMarkAlertRead,
  onMarkAllAlertsRead,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
}: NotificationsPanelProps) {
  const loading = alertsStatus === 'loading' || notificationsStatus === 'loading'
  const notConfigured = alertsStatus === 'not-configured' || notificationsStatus === 'not-configured'

  if (loading) return <LoadingSkeleton count={3} />
  if (notConfigured) return <EmptyState variant="not-configured" />

  const breaking = alerts.filter((a) => a.breaking)
  const savedSearch = alerts.filter((a) => !a.breaking)
  const unreadAlerts = alerts.filter((a) => !a.read).length
  const unreadNotifications = notifications.filter((n) => !n.read).length

  if (breaking.length === 0 && savedSearch.length === 0 && notifications.length === 0) {
    return (
      <div className="flex min-h-[16vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Inbox className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No notifications yet.</p>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          Create a saved search to start getting notified about new matches — real matches only, nothing simulated.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {(unreadAlerts > 0 || unreadNotifications > 0) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (unreadAlerts > 0) onMarkAllAlertsRead()
              if (unreadNotifications > 0) onMarkAllNotificationsRead()
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
            Mark all read
          </button>
        </div>
      )}

      {breaking.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Breaking</h3>
          <div className="flex flex-col gap-2">
            {breaking.map((alert, i) => (
              <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }}>
                <NotificationRow
                  unread={!alert.read}
                  icon={Flame}
                  colorVar="--status-critical"
                  title={alert.event.title}
                  description={`Matches "${alert.watchlistName}" — ${alert.event.source}`}
                  timestamp={alert.triggeredAt}
                  href={`/feed/${encodeURIComponent(alert.event.id)}`}
                  onMarkRead={() => onMarkAlertRead(alert.id)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {savedSearch.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Saved Search</h3>
          <div className="flex flex-col gap-2">
            {savedSearch.map((alert, i) => (
              <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }}>
                <NotificationRow
                  unread={!alert.read}
                  icon={Search}
                  colorVar="--cat-government"
                  title={alert.event.title}
                  description={`Matches "${alert.watchlistName}" — ${alert.event.source}`}
                  timestamp={alert.triggeredAt}
                  href={`/feed/${encodeURIComponent(alert.event.id)}`}
                  onMarkRead={() => onMarkAlertRead(alert.id)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">System</h3>
        {notifications.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No system notifications right now.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n, i) => (
              <motion.div key={n.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }}>
                <NotificationRow
                  unread={!n.read}
                  icon={Bell}
                  colorVar="--status-warning"
                  title={typeof n.payload.message === 'string' ? n.payload.message : n.type}
                  description={n.type}
                  timestamp={n.createdAt}
                  onMarkRead={() => onMarkNotificationRead(n.id)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
