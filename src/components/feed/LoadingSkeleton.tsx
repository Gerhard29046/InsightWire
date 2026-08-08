export function LoadingSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading events">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-slate-200 p-4 dark:border-slate-800"
        >
          <div className="flex gap-2">
            <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-14 rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="mt-3 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-2 h-3 w-full rounded bg-slate-100 dark:bg-slate-800/70" />
          <div className="mt-1 h-3 w-5/6 rounded bg-slate-100 dark:bg-slate-800/70" />
        </div>
      ))}
    </div>
  )
}
