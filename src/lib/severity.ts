import type { LucideIcon } from 'lucide-react'
import { Info, AlertTriangle, AlertOctagon, Siren } from 'lucide-react'
import type { Severity } from '@insightwire/shared'

export type { Severity }

export interface SeverityMeta {
  id: Severity
  label: string
  icon: LucideIcon
  /** CSS custom property (defined in index.css) — the reserved status palette. */
  colorVar: string
}

// Fixed status roles, never reused for category identity.
export const severityMeta: Record<Severity, SeverityMeta> = {
  low: { id: 'low', label: 'Low', icon: Info, colorVar: '--status-good' },
  medium: { id: 'medium', label: 'Medium', icon: AlertTriangle, colorVar: '--status-warning' },
  high: { id: 'high', label: 'High', icon: AlertOctagon, colorVar: '--status-serious' },
  critical: { id: 'critical', label: 'Critical', icon: Siren, colorVar: '--status-critical' },
}

export const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low']
