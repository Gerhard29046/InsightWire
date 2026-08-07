import { Map } from 'lucide-react'
import { PagePlaceholder } from '../components/PagePlaceholder'

export default function WorldMap() {
  return (
    <PagePlaceholder
      icon={Map}
      title="World Map"
      description="Geospatial view of tracked events — conflicts, disasters, elections, and more."
    />
  )
}
