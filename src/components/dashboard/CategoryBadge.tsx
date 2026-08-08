import { clsx } from 'clsx'
import { categoryById, type CategoryId } from '../../lib/categories'

export function CategoryBadge({
  category,
  className,
}: {
  category: CategoryId
  className?: string
}) {
  const meta = categoryById[category]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300',
        className,
      )}
      style={{ backgroundColor: `color-mix(in srgb, var(${meta.colorVar}) 16%, transparent)` }}
    >
      <meta.icon className="h-3 w-3" style={{ color: `var(${meta.colorVar})` }} aria-hidden />
      {meta.label}
    </span>
  )
}
