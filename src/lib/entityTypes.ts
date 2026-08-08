import type { LucideIcon } from 'lucide-react'
import { User, Building2, Landmark, Factory, ShieldCheck, Globe2, MapPin, Flag, Users2, HelpCircle } from 'lucide-react'
import type { EntityType } from './api/entities'

export interface EntityTypeMeta {
  id: EntityType
  label: string
  icon: LucideIcon
}

export const entityTypes: EntityTypeMeta[] = [
  { id: 'person', label: 'Person', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'government', label: 'Government', icon: Landmark },
  { id: 'company', label: 'Company', icon: Factory },
  { id: 'agency', label: 'Agency', icon: ShieldCheck },
  { id: 'country', label: 'Country', icon: Flag },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'political_party', label: 'Political Party', icon: Users2 },
  { id: 'international_organization', label: 'International Org', icon: Globe2 },
  { id: 'other', label: 'Other', icon: HelpCircle },
]

export const entityTypeById = Object.fromEntries(entityTypes.map((t) => [t.id, t])) as Record<EntityType, EntityTypeMeta>
