import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface PagePlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
}

export function PagePlaceholder({
  icon: Icon,
  title,
  description,
}: PagePlaceholderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
        {title}
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </motion.div>
  )
}
