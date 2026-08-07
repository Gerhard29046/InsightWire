import { CalendarDays } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function Calendar() {
  return (
    <PagePlaceholder
      icon={CalendarDays}
      title="Calendars"
      description="Upcoming events, government and parliament sessions, court dates, and company earnings in one unified calendar."
    />
  )
}
