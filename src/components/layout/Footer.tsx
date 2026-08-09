import { Link } from 'react-router-dom'

const LINKS: { label: string; to: string }[] = [
  { label: 'Terms & Conditions', to: '/legal/terms-and-conditions' },
  { label: 'Privacy Policy', to: '/legal/privacy-policy' },
  { label: 'Research & Information Disclaimer', to: '/legal/research-disclaimer' },
  { label: 'Copyright & Source Policy', to: '/legal/copyright-policy' },
  { label: 'All Policies', to: '/legal' },
  { label: 'Administration', to: '/admin' },
]

export function Footer() {
  return (
    <footer className="border-t border-slate-200 px-4 py-6 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="hover:text-slate-600 dark:hover:text-slate-300">
              {link.label}
            </Link>
          ))}
        </nav>
        <p>InsightWire is a research aid. Verify independently before publication or action.</p>
      </div>
    </footer>
  )
}
