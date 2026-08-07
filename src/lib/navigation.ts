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
  label: string
  path: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Intelligence',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Global Events Feed', path: '/feed', icon: Rss },
      { label: 'Calendars', path: '/calendar', icon: CalendarDays },
      { label: 'Live Alerts', path: '/alerts', icon: Bell },
    ],
  },
  {
    label: 'Research',
    items: [
      { label: 'Entity Explorer', path: '/entities', icon: Network },
      { label: 'Timeline Builder', path: '/timeline', icon: Waypoints },
      { label: 'World Map', path: '/map', icon: Map },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Journalist Workspace', path: '/workspace', icon: Briefcase },
      { label: 'AI Chat Assistant', path: '/assistant', icon: MessageSquare },
    ],
  },
  {
    label: 'System',
    items: [{ label: 'Administration', path: '/admin', icon: ShieldCheck }],
  },
]
