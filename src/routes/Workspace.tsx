import { Briefcase } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function Workspace() {
  return (
    <PagePlaceholder
      icon={Briefcase}
      title="Journalist Workspace"
      description="Saved searches, bookmarks, and notifications, all in one place."
    />
  )
}
