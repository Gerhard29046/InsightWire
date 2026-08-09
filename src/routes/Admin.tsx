import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ClipboardList, Database, FileText, Flag, Rss, Settings, ShieldCheck, Users } from 'lucide-react'
import { AdminTabs, type AdminTabDef } from '../components/admin/AdminTabs'
import { OverviewTab } from '../components/admin/OverviewTab'
import { SourcesTab } from '../components/admin/SourcesTab'
import { DatabaseTab } from '../components/admin/DatabaseTab'
import { UsersTab } from '../components/admin/UsersTab'
import { SettingsTab } from '../components/admin/SettingsTab'
import { LegalTab } from '../components/admin/LegalTab'
import { ModerationTab } from '../components/admin/ModerationTab'
import { AuditTab } from '../components/admin/AuditTab'
import { SecurityTab } from '../components/admin/SecurityTab'

const TABS: AdminTabDef[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'sources', label: 'Sources', icon: Rss },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'users', label: 'Users & Roles', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'legal', label: 'Legal', icon: FileText },
  { id: 'moderation', label: 'Moderation', icon: Flag },
  { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  { id: 'security', label: 'Security', icon: ShieldCheck },
]

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = searchParams.get('tab') ?? 'overview'

  useEffect(() => {
    if (!window.location.hash) return
    const id = window.location.hash.slice(1)
    const el = document.getElementById(id)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [active])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Administration</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The newsroom operations centre — real ingestion control, data health, and compliance in one place.
        </p>
      </div>

      <AdminTabs tabs={TABS} active={active} onChange={(id) => setSearchParams({ tab: id })} />

      <div>
        {active === 'overview' && <OverviewTab />}
        {active === 'sources' && <SourcesTab />}
        {active === 'database' && <DatabaseTab />}
        {active === 'users' && <UsersTab />}
        {active === 'settings' && <SettingsTab />}
        {active === 'legal' && <LegalTab />}
        {active === 'moderation' && <ModerationTab />}
        {active === 'audit' && <AuditTab />}
        {active === 'security' && <SecurityTab />}
      </div>
    </div>
  )
}
