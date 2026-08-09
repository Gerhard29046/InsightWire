import type { NotificationsConfig } from './siteConfig'

/** Shared between the personal Profile > Preferences panel and Admin > Settings — both edit the same `app_config.notifications` row, so the field list must not drift between them. */
export const NOTIFICATION_TOGGLES: { key: keyof NotificationsConfig; label: string; description: string }[] = [
  { key: 'breakingAlerts', label: 'Breaking alerts', description: 'High-importance, developing events.' },
  { key: 'savedSearchAlerts', label: 'Saved search matches', description: 'New results for saved watchlists.' },
  { key: 'entityAlerts', label: 'Entity activity', description: 'Reserved for a future entity-follow feature.' },
  { key: 'systemAlerts', label: 'System notices', description: 'Platform and data-pipeline notices.' },
  { key: 'browserNotifications', label: 'Browser push', description: "Requires the browser's own permission (not yet wired to the OS notification API)." },
]
