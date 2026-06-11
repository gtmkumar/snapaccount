import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/hooks/useAuth'
import { getMyMenu, type MenuNode } from '@/lib/menuApi'
import { navIcon } from './navIcons'
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
  Shield,
  Globe,
  ListChecks,
  Database,
  ListTree,
  ClipboardList,
  ScrollText,
  Inbox,
} from 'lucide-react'
import type { AdminRole } from '@/hooks/useAuth'

interface NavItem {
  label: string
  href: string
  icon: React.FC<{ className?: string }>
  requiredRoles: AdminRole[]
  /** Module 1: optional server-side permission code that ALSO gates this item */
  requiredServerPermission?: string
  badge?: number
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP'],
  },
  {
    label: 'Documents',
    href: '/documents',
    icon: FileText,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'DATA_ENTRY_OPERATOR'],
  },
  {
    label: 'GST',
    href: '/gst',
    icon: Receipt,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'GST Notices',
    href: '/gst/notices',
    icon: Receipt,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    // GAP-101: IMS Inbox — mandatory regulatory surface from 1 Apr 2026
    label: 'IMS Inbox',
    href: '/gst/ims',
    icon: Inbox,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
    requiredServerPermission: 'gst.ims.read',
  },
  {
    label: 'ITR',
    href: '/itr',
    icon: FileSpreadsheet,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Loans',
    href: '/loans',
    icon: CreditCard,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'PARTNER_BANK_REP'],
  },
  {
    // Phase 6C sub-nav: Bank communications
    label: 'Bank Comms',
    href: '/loans/bank-communications',
    icon: CreditCard,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER'],
  },
  {
    // Phase 6C sub-nav: Partner banks settings
    label: 'Partner Banks',
    href: '/loans/partner-banks',
    icon: CreditCard,
    requiredRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Chat',
    href: '/chat',
    icon: MessageSquare,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Users',
    href: '/users',
    icon: Users,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Team',
    href: '/team',
    icon: Users2,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER'],
  },
  {
    label: 'Subscriptions',
    href: '/subscriptions',
    icon: Building2,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA'],
  },
  {
    // TODO Phase 6F: role-gate to CA + Admin + Ops only (real RBAC)
    label: 'Callbacks',
    href: '/callbacks',
    icon: PhoneCall,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE'],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER'],
  },
  // Module 1 — Roles & Permissions (gated by org.roles.read)
  {
    label: 'Roles & Permissions',
    href: '/settings/roles',
    icon: Shield,
    requiredRoles: ['SUPER_ADMIN', 'OPERATIONS_MANAGER'],
    requiredServerPermission: 'org.roles.read',
  },
  // Module 1 — Platform Organisations (SUPER_ADMIN only, gated by platform.orgs.read)
  {
    label: 'Organisations',
    href: '/admin/organizations',
    icon: Globe,
    requiredRoles: ['SUPER_ADMIN'],
    requiredServerPermission: 'platform.orgs.read',
  },
  // Audit Log (SUPER_ADMIN, admin.dashboard.read)
  {
    label: 'Audit Log',
    href: '/admin/audit-log',
    icon: ClipboardList,
    requiredRoles: ['SUPER_ADMIN'],
    requiredServerPermission: 'admin.dashboard.read',
  },
  // MCA Compliance — Edit Log (accounting.editlog.read)
  {
    label: 'Edit Log',
    href: '/compliance/edit-log',
    icon: ScrollText,
    requiredRoles: ['SUPER_ADMIN', 'CA'],
    requiredServerPermission: 'accounting.editlog.read',
  },
  // Module 1, Increment 1.1 — Permission Catalog (SUPER_ADMIN, platform.permissions.manage)
  {
    label: 'Permission Catalog',
    href: '/settings/permissions',
    icon: ListChecks,
    requiredRoles: ['SUPER_ADMIN'],
    requiredServerPermission: 'platform.permissions.manage',
  },
  // Module 1, Increment 1.4 — Reference Data (SUPER_ADMIN, platform.refdata.manage)
  {
    label: 'Reference Data',
    href: '/settings/reference-data',
    icon: Database,
    requiredRoles: ['SUPER_ADMIN'],
    requiredServerPermission: 'platform.refdata.manage',
  },
  // Menu Management (SUPER_ADMIN, platform.permissions.manage) — fallback entry
  {
    label: 'Navigation',
    href: '/settings/navigation',
    icon: ListTree,
    requiredRoles: ['SUPER_ADMIN'],
    requiredServerPermission: 'platform.permissions.manage',
  },
]

/** Normalized render shape shared by the dynamic menu and the static fallback. */
interface RenderItem {
  label: string
  href: string
  Icon: React.FC<{ className?: string }>
  badge?: number
}

/** Depth-first flatten of the backend menu tree into a render list. */
function flattenMenu(nodes: MenuNode[]): RenderItem[] {
  const out: RenderItem[] = []
  for (const n of nodes) {
    out.push({ label: n.label, href: n.url, Icon: navIcon(n.iconKey) })
    if (n.children.length > 0) out.push(...flattenMenu(n.children))
  }
  return out
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onMobileClose?: () => void
}

export function Sidebar({ collapsed, onToggle, onMobileClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const { canAccess, hasServerPermission, serverPermissions } = usePermission()
  const location = useLocation()

  // Backend-driven menu (already permission-filtered server-side). The frontend
  // is a pure consumer of this tree — gap #1 of the enhanced authz model.
  const { data: menu } = useQuery({
    queryKey: ['nav', 'menu'],
    queryFn: getMyMenu,
    staleTime: 300_000,
    retry: false,
  })

  // Resilient fallback: if the menu endpoint hasn't been seeded / is unavailable,
  // render the legacy static list with the original client-side role + permission
  // gates so the sidebar never disappears during rollout.
  const fallbackItems: RenderItem[] = navItems
    .filter(item => {
      if (!canAccess(item.requiredRoles)) return false
      if (item.requiredServerPermission && serverPermissions.length > 0) {
        return hasServerPermission(item.requiredServerPermission)
      }
      return true
    })
    .map(item => ({ label: item.label, href: item.href, Icon: item.icon, badge: item.badge }))

  const visibleItems: RenderItem[] = useMemo(
    () => (menu && menu.length > 0 ? flattenMenu(menu) : fallbackItems),
    // fallbackItems is cheap + derived from permission state; recompute is fine.
    [menu, fallbackItems],
  )

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
          const Icon = item.Icon

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
