import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  FileSpreadsheet,
  CreditCard,
  MessageSquare,
  Users,
  Users2,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Building2,
  PhoneCall,
} from 'lucide-react'
import type { AdminRole } from '@/hooks/useAuth'

interface NavItem {
  label: string
  href: string
  icon: React.FC<{ className?: string }>
  requiredRoles: AdminRole[]
  badge?: number
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP'],
  },
  {
    label: 'Documents',
    href: '/documents',
    icon: FileText,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'DATA_ENTRY_OPERATOR'],
  },
  {
    label: 'GST',
    href: '/gst',
    icon: Receipt,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'GST Notices',
    href: '/gst/notices',
    icon: Receipt,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'ITR',
    href: '/itr',
    icon: FileSpreadsheet,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Loans',
    href: '/loans',
    icon: CreditCard,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'PARTNER_BANK_REP'],
  },
  {
    // Phase 6C sub-nav: Bank communications
    label: 'Bank Comms',
    href: '/loans/bank-communications',
    icon: CreditCard,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'],
  },
  {
    // Phase 6C sub-nav: Partner banks settings
    label: 'Partner Banks',
    href: '/loans/partner-banks',
    icon: CreditCard,
    requiredRoles: ['SYSTEM_ADMIN'],
  },
  {
    label: 'Chat',
    href: '/chat',
    icon: MessageSquare,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Users',
    href: '/users',
    icon: Users,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Team',
    href: '/team',
    icon: Users2,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'],
  },
  {
    label: 'Subscriptions',
    href: '/subscriptions',
    icon: Building2,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA'],
  },
  {
    // TODO Phase 6F: role-gate to CA + Admin + Ops only (real RBAC)
    label: 'Callbacks',
    href: '/callbacks',
    icon: PhoneCall,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    requiredRoles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onMobileClose?: () => void
}

export function Sidebar({ collapsed, onToggle, onMobileClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const { canAccess } = usePermission()
  const location = useLocation()

  const visibleItems = navItems.filter(item => canAccess(item.requiredRoles))

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-neutral-800 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-5',
        collapsed && 'justify-center px-0'
      )}>
        <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm" aria-hidden="true">SA</span>
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-white leading-tight">SnapAccount</p>
            <p className="text-xs text-neutral-400">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto" aria-label="Primary navigation">
        {visibleItems.map((item) => {
          const isActive = location.pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onMobileClose}
              className={({ isActive: navActive }) => cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-800',
                (isActive || navActive)
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-white',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active left accent bar */}
              {location.pathname.startsWith(item.href) && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand-400"
                  aria-hidden="true"
                />
              )}
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {!collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-brand-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-2 space-y-0.5">
        {/* User profile */}
        {user && (
          <div className={cn(
            'flex items-center gap-3 px-3 py-2.5',
            collapsed && 'justify-center px-0'
          )}>
            <div className="relative h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center shrink-0 text-white text-xs font-bold">
              {user.displayName
                ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                : user.email?.[0]?.toUpperCase() ?? '?'}
              {/* Online indicator */}
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success-500 ring-2 ring-neutral-800" aria-hidden="true" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user.displayName ?? user.email}
                </p>
                <p className="text-xs text-neutral-400 truncate capitalize">
                  {user.role.toLowerCase().replace('_', ' ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={() => void signOut()}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-neutral-400',
            'hover:bg-white/5 hover:text-white transition-colors duration-150',
            'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-800',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Sign out' : undefined}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-neutral-500',
            'hover:bg-white/5 hover:text-neutral-300 transition-colors duration-150',
            'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-800',
            collapsed && 'justify-center px-0'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" aria-hidden="true" />
            : (
              <>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
        </button>
      </div>
    </aside>
  )
}
