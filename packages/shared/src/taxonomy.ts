/**
 * Pure classification vocabulary shared by the frontend and the backend.
 *
 * These are string unions only — no icons, colors, or other presentation
 * concerns. The frontend's lib/categories.ts and lib/severity.ts own that
 * metadata locally and re-export the underlying types from here, so the
 * taxonomy itself is declared exactly once.
 */
export const CATEGORY_IDS = [
  'government',
  'business',
  'courts',
  'markets',
  'elections',
  'weather',
  'conflicts',
  'science',
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const

export type Severity = (typeof SEVERITY_LEVELS)[number]

export const VERIFICATION_STATUSES = ['verified', 'unverified', 'disputed'] as const

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const EVENT_STATUS_IDS = ['live', 'developing', 'scheduled', 'resolved'] as const

export type EventStatusId = (typeof EVENT_STATUS_IDS)[number]
