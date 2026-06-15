import { useLocation, Link } from 'react-router'
import { cn } from '@/lib/utils'
import { ChevronRight, Menu, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { NotificationCenter } from '@/components/shared/NotificationCenter'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useCommandPalette } from '@/contexts/CommandPaletteContext'
import { t } from '@/i18n'

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  documents: 'Documents',
  gst: 'GST Operations',
  itr: 'ITR Operations',
  loans: 'Loan Operations',
  chat: 'Chat',
  users: 'User Management',
  team: 'Team Management',
  subscriptions: 'Subscriptions',
  reports: 'Reports',
  settings: 'Settings',
  callbacks: 'Callbacks',
  queue: 'Queue',
  review: 'Review',
  'itc-mismatch': 'ITC Mismatch',
  login: 'Login',
}

function buildBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: Array<{ label: string; href: string }> = [
    { label: 'Dashboard', href: '/dashboard' },
  ]

  let path = ''
  for (const segment of segments) {
    if (segment === 'dashboard') break
    path += `/${segment}`
    const label = routeLabels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
    crumbs.push({ label, href: path })
  }

  return crumbs
}

interface TopBarProps {
  className?: string
  onMobileMenuToggle?: () => void
}

export function TopBar({ className, onMobileMenuToggle }: TopBarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const { open: openPalette } = useCommandPalette()
  const breadcrumbs = buildBreadcrumbs(location.pathname)

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between gap-4 px-4 md:px-6 py-4',
        'bg-[var(--surface-raised)]/80 backdrop-blur-md border-b border-[var(--border-subtle)] min-h-[64px]',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
          onClick={onMobileMenuToggle}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 text-sm">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <li key={crumb.href} className="flex items-center gap-1.5 min-w-0">
                  {index > 0 && (
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--border-strong)] shrink-0" aria-hidden="true" />
                  )}
                  {isLast ? (
                    <span className="font-medium text-[var(--text-primary)] truncate" aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.href}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors hidden sm:inline truncate"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Search / Command palette trigger */}
        <button
          type="button"
          onClick={openPalette}
          aria-label={t('palette.trigger.label')}
          className={cn(
            'hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
            'text-[var(--text-tertiary)] border border-[var(--border-default)]',
            'bg-[var(--surface-sunken)] hover:border-[var(--border-strong)] transition-colors'
          )}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden lg:inline">{t('palette.placeholder')}</span>
          <kbd className="hidden lg:inline px-1.5 py-0.5 text-xs rounded bg-[var(--surface-canvas)] border border-[var(--border-default)] font-mono ml-1">⌘K</kbd>
        </button>

        {/* Mobile search icon only */}
        <button
          type="button"
          onClick={openPalette}
          aria-label={t('palette.trigger.label')}
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notification Center */}
        <NotificationCenter />

        {/* User avatar */}
        {user && (
          <div
            className="h-9 w-9 rounded-full bg-[var(--brand-primary)] flex items-center justify-center text-white text-sm font-bold cursor-pointer"
            aria-label={`User: ${user.displayName ?? user.email}`}
          >
            {user.displayName
              ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              : user.email?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
    </header>
  )
}
