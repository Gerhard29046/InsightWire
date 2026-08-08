import { clsx } from 'clsx'
import { severityMeta, type Severity } from '../../lib/severity'

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity
  className?: string
}) {
  const meta = severityMeta[severity]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{
        color: `var(${meta.colorVar})`,
        backgroundColor: `color-mix(in srgb, var(${meta.colorVar}) 16%, transparent)`,
      }}
    >
      <meta.icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  )
}
