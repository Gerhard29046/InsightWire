import { z } from 'zod'
import { CATEGORY_IDS, EVENT_STATUS_IDS, SEVERITY_LEVELS, VERIFICATION_STATUSES } from './taxonomy'

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export type Coordinates = z.infer<typeof CoordinatesSchema>

export const EventUpdateSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  label: z.string().min(1),
})

export type EventUpdate = z.infer<typeof EventUpdateSchema>

export const ConfirmingSourceSchema = z.object({
  connectorId: z.string().min(1),
  sourceUrl: z.url().optional(),
  reportedAt: z.iso.datetime({ offset: true }),
})

export type ConfirmingSource = z.infer<typeof ConfirmingSourceSchema>

/**
 * The canonical event contract every connector normalizes into and every
 * consumer (worker, future API, frontend) reads from. Field naming follows
 * TypeScript/JSON convention (camelCase) rather than the Postgres column
 * names implied by the Phase 4 spec (snake_case) — Phase 6 owns the DB
 * schema and the snake_case<->camelCase mapping at that boundary; this is
 * the wire/application-level shape.
 *
 * `description` is the untouched source text; `summary` is AI-generated
 * (Phase 5) and stays undefined until the AI pipeline runs — never derive
 * one by overwriting the other. Likewise `importance`/`confidence` are
 * connector-seeded conservative defaults ('medium' / 0.4) until Phase 5's
 * scoring model replaces them; they are required (not optional) so every
 * consumer can rely on them being present, just not yet authoritative.
 */
export const NormalizedEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  summary: z.string().min(1).optional(),
  country: z.string().min(1),
  city: z.string().min(1).optional(),
  coordinates: CoordinatesSchema.optional(),
  category: z.enum(CATEGORY_IDS),
  source: z.string().min(1),
  sourceUrl: z.url().optional(),
  startTime: z.iso.datetime({ offset: true }).optional(),
  endTime: z.iso.datetime({ offset: true }).optional(),
  publishedAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  importance: z.enum(SEVERITY_LEVELS),
  confidence: z.number().min(0).max(1),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  language: z.string().min(2).max(5),
  people: z.array(z.string()),
  organizations: z.array(z.string()),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  embeddings: z.array(z.number()).optional(),
  status: z.enum(EVENT_STATUS_IDS),
  updates: z.array(EventUpdateSchema).optional(),
  /** Every connector that has reported this event — the Merge Engine's record of independent confirmation (Phase 6.6). */
  confirmingSources: z.array(ConfirmingSourceSchema).optional(),
  /** Computed by the pipeline's Priority Engine after enrichment — absent until then, same lifecycle as `summary`. */
  priorityScore: z.number().min(0).max(100).optional(),
  /** Denormalized snapshot from the Source Trust Engine at ingestion time — stored separately from `importance` by design. */
  sourceTrustScore: z.number().min(0).max(1).optional(),
})

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>
