import { ShieldCheck } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function Admin() {
  return (
    <PagePlaceholder
      icon={ShieldCheck}
      title="Administration"
      description="Manage sources, crawlers, users, and system health."
    />
  )
}
