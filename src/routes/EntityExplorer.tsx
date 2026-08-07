import { Network } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function EntityExplorer() {
  return (
    <PagePlaceholder
      icon={Network}
      title="Entity Explorer"
      description="Explore people, organizations, and their relationships across tracked events."
    />
  )
}
