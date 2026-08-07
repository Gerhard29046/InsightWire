import { Rss } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function EventsFeed() {
  return (
    <PagePlaceholder
      icon={Rss}
      title="Global Events Feed"
      description="A live, filterable stream of detected events across government, business, courts, markets, and more."
    />
  )
}
