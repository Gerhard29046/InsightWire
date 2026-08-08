import { useEffect, useRef } from 'react'
import { EventCard } from './EventCard'
import { LoadingSkeleton } from './LoadingSkeleton'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import type { FeedStatus } from '../../hooks/useEventsFeed'
import type { NormalizedEvent } from '../../lib/api/types'

interface EventFeedProps {
  events: NormalizedEvent[]
  status: FeedStatus
  error: unknown
  hasMore: boolean
  onLoadMore: () => void
  onRetry: () => void
}

export function EventFeed({ events, status, error, hasMore, onLoadMore, onRetry }: EventFeedProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || (status !== 'ready' && status !== 'loading-more')) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, status, onLoadMore])

  if (status === 'loading') return <LoadingSkeleton count={6} />
  if (status === 'not-configured') return <EmptyState variant="not-configured" />
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />
  if (status === 'empty') return <EmptyState variant="no-events" onRefresh={onRetry} />

  return (
    <div className="flex flex-col gap-3">
      {events.map((event, i) => (
        <EventCard key={event.id} event={event} index={i} />
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
      {status === 'loading-more' && <LoadingSkeleton count={2} />}
    </div>
  )
}
