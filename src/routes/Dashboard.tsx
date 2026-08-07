import { LayoutDashboard } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function Dashboard() {
  return (
    <PagePlaceholder
      icon={LayoutDashboard}
      title="Dashboard"
      description="Global events feed, AI summaries, and story suggestions will surface here once the data layer is connected."
    />
  )
}
