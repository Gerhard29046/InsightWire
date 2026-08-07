import { MessageSquare } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function Assistant() {
  return (
    <PagePlaceholder
      icon={MessageSquare}
      title="AI Chat Assistant"
      description="Ask questions about tracked events, entities, and timelines in natural language."
    />
  )
}
