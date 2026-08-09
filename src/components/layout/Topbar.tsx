import { Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/useTheme'
import { GlobalSearch } from './GlobalSearch'
import { ProfileMenu } from './ProfileMenu'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900 lg:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden />
          ) : (
            <Moon className="h-5 w-5" aria-hidden />
          )}
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}
