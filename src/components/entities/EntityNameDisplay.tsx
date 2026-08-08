import { splitEntityName } from '../../lib/entityName'

/**
 * Renders a real entity name intelligently: most names pass through
 * unchanged, but a semicolon-delimited multi-part name (a real data shape a
 * few NWS location entities have — see the redesign's data-quality note)
 * shows only its first segment plus a "+N more" badge, with the untouched
 * full string available via the native title tooltip. Never truncates,
 * merges, or rewrites the underlying data — presentation only.
 */
export function EntityNameDisplay({ name, className }: { name: string; className?: string }) {
  const { primary, extraCount, full } = splitEntityName(name)

  if (extraCount === 0) {
    return (
      <span className={className} title={primary !== full ? full : undefined}>
        {primary}
      </span>
    )
  }

  return (
    <span className={className} title={full}>
      {primary}
      <span className="ml-1 whitespace-nowrap text-slate-400 dark:text-slate-500">+{extraCount} more</span>
    </span>
  )
}
