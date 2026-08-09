import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Rss,
  CalendarDays,
  Bell,
  Network,
  Waypoints,
  Map,
  Briefcase,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'

export interface NavItem {
  /** Stable id, independent of `path`/`label` — this is what Administration's Navigation settings (app_config's `navigation.visibleItems`) actually reference, so renaming a label or path never silently breaks a saved config. */
  id: string
  label: string
  path: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Ids that stay in the sidebar no matter what `app_config.navigation`
 * says — a real regression on 2026-08-09 (a single Administration >
 * Settings > Navigation checkbox toggle wrote `visibleItems` without
 * `'feed'`, silently removing Global Events Feed from the sidebar for
 * every user) showed the old "visibleItems is a pure allowlist" design had
 * no floor: one accidental uncheck could hide a core page app-wide with no
 * warning. Dashboard and Feed are the two pages a user needs to always be
 * able to reach — see Sidebar.tsx and SettingsTab.tsx, both of which
 * consult this constant.
 */
export const CORE_NAV_ITEM_IDS: readonly string[] = ['dashboard', 'feed']

export const navGroups: NavGroup[] = [
  {
    label: 'Intelligence',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { id: 'feed', label: 'Global Events Feed', path: '/feed', icon: Rss },
      { id: 'calendar', label: 'Calendars', path: '/calendar', icon: CalendarDays },
      { id: 'alerts', label: 'Live Alerts', path: '/alerts', icon: Bell },
    ],
  },
  {
    label: 'Research',
    items: [
      { id: 'entities', label: 'Entity Explorer', path: '/entities', icon: Network },
      { id: 'timeline', label: 'Timeline Builder', path: '/timeline', icon: Waypoints },
      { id: 'map', label: 'World Map', path: '/map', icon: Map },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { id: 'workspace', label: 'Journalist Workspace', path: '/workspace', icon: Briefcase },
      { id: 'assistant', label: 'AI Chat Assistant', path: '/assistant', icon: MessageSquare },
    ],
  },
  {
    label: 'System',
    items: [{ id: 'admin', label: 'Administration', path: '/admin', icon: ShieldCheck }],
  },
]
