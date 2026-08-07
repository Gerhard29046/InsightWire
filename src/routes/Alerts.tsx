import { Bell } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function Alerts() {
  return (
    <PagePlaceholder
      icon={Bell}
      title="Live Alerts"
      description="Real-time notifications for high-importance and high-virality events matching your saved searches."
    />
  )
}
