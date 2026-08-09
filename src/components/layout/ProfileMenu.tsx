import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  FileText,
  LogOut,
  Palette,
  Settings,
  Shield,
  ShieldCheck,
  User,
} from 'lucide-react'

interface MenuLink {
  label: string
  to: string
  icon: typeof User
}

const LINKS: MenuLink[] = [
  { label: 'Profile', to: '/profile', icon: User },
  { label: 'Preferences', to: '/profile#preferences', icon: Settings },
  { label: 'Notifications', to: '/admin?tab=settings#notifications', icon: Bell },
  { label: 'Appearance', to: '/admin?tab=settings#appearance', icon: Palette },
  { label: 'Privacy', to: '/legal/privacy-policy', icon: Shield },
  { label: 'Terms & Conditions', to: '/legal/terms-and-conditions', icon: FileText },
  { label: 'Administration', to: '/admin', icon: ShieldCheck },
]

/**
 * The ONE global profile menu — rendered once by Topbar (which every route
 * renders through AppShell), never duplicated per page. "Sign out" is
 * intentionally non-functional: there is no authentication to sign out of
 * yet (see docs/decisions/0015-workspace-single-user.md) — showing it as a
 * disabled, clearly-labeled framework placeholder is honest; making it
 * silently do nothing on click would not be.
 */
export function ProfileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[var(--accent)] to-indigo-500 ring-offset-2 ring-offset-white transition-shadow hover:ring-2 hover:ring-[var(--accent)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:ring-offset-slate-950"
      />

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Journalist</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Authentication not configured yet</p>
          </div>

          <div className="py-1">
            {LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <link.icon className="h-4 w-4 text-slate-400" aria-hidden />
                {link.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-slate-100 py-1 dark:border-slate-800">
            <button
              type="button"
              disabled
              title="Sign out will be available once Supabase Auth is connected — see docs/decisions/0015-workspace-single-user.md"
              aria-disabled="true"
              className="flex w-full cursor-not-allowed items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-300 dark:text-slate-600"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
              <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                Not configured
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
