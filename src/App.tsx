import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import Dashboard from './routes/Dashboard'
import EventsFeed from './routes/EventsFeed'
import EventDetail from './routes/EventDetail'
import Calendar from './routes/Calendar'
import Alerts from './routes/Alerts'
import EntityExplorer from './routes/EntityExplorer'
import EntityDetail from './routes/EntityDetail'
import TimelineBuilder from './routes/TimelineBuilder'
import WorldMap from './routes/WorldMap'
import HistoryDetail from './routes/HistoryDetail'
import Workspace from './routes/Workspace'
import SearchResults from './routes/SearchResults'
import Assistant from './routes/Assistant'
import Admin from './routes/Admin'
import LegalIndex from './routes/LegalIndex'
import LegalDocument from './routes/LegalDocument'
import UserProfile from './routes/UserProfile'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="feed" element={<EventsFeed />} />
        <Route path="feed/:id" element={<EventDetail />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="entities" element={<EntityExplorer />} />
        <Route path="entities/:id" element={<EntityDetail />} />
        <Route path="timeline" element={<TimelineBuilder />} />
        <Route path="map" element={<WorldMap />} />
        <Route path="history/:id" element={<HistoryDetail />} />
        <Route path="workspace" element={<Workspace />} />
        <Route path="search" element={<SearchResults />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="admin" element={<Admin />} />
        <Route path="legal" element={<LegalIndex />} />
        <Route path="legal/:slug" element={<LegalDocument />} />
        <Route path="profile" element={<UserProfile />} />
      </Route>
    </Routes>
  )
}

export default App
