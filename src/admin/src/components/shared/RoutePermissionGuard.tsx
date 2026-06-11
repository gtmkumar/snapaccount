/**
 * RoutePermissionGuard — enforces the SAME permission that gates each sidebar menu
 * item on the ROUTE itself, so hiding a menu entry also blocks direct URL access.
 *
 * Without this, the permission-driven sidebar only *hides* links; a user could still
 * type the URL (e.g. /chat) and load the page shell. The map below mirrors the
 * backend `auth.navigation_item` → `auth.menu_permission` config (source of truth);
 * keep it in sync if menu permissions change.
 *
 * Matching is longest-prefix so detail routes inherit their section's permission
 * (e.g. /chat/:id → /chat, /users/:id → /users, /team/staff/:id → /team).
 */
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { usePermission } from '@/hooks/usePermission'
import { ForbiddenPage } from '@/components/shared/RoleGuard'

// Route prefix → required permission code. Paths not listed (e.g. /dashboard) are
// public to any authenticated user. Mirrors menu_permission in the DB.
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/documents': 'menu.documents.view',
  '/gst/notices': 'menu.gst_notices.view',
  '/gst': 'menu.gst.view',
  '/itr': 'menu.itr.view',
  '/loans/bank-communications': 'menu.loans.bank_comms.view',
  '/loans/partner-banks': 'menu.loans.partner_banks.view',
  '/loans': 'menu.loans.view',
  '/chat': 'menu.chat.view',
  '/users': 'menu.users.view',
  '/team': 'menu.team.view',
  '/subscriptions': 'menu.subscriptions.view',
  '/reports': 'menu.reports.view',
  '/callbacks': 'menu.callbacks.view',
  '/admin/audit-log': 'admin.dashboard.read',
  '/admin/system-health': 'admin.dashboard.read',
  '/admin/organizations': 'platform.orgs.read',
  '/subscriptions/subscribers': 'subscription.plan.create',
  '/subscriptions/invoices': 'menu.subscriptions.view',
  '/settings/roles': 'org.roles.read',
  '/settings/permissions': 'platform.permissions.manage',
  '/settings/navigation': 'platform.permissions.manage',
  '/settings/reference-data': 'platform.refdata.manage',
  '/settings': 'menu.settings.view',
}

/** Required permission for a path via longest-prefix match (null = public). */
export function requiredPermissionForPath(pathname: string): string | null {
  const match = Object.keys(ROUTE_PERMISSIONS)
    .filter(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return match ? ROUTE_PERMISSIONS[match] : null
}

export function RoutePermissionGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { serverPermissions, permissionsLoaded } = usePermission()

  const required = requiredPermissionForPath(pathname)
  if (!required) return <>{children}</>

  // Wait for the permission list before deciding (prevents a false "forbidden" flash).
  if (!permissionsLoaded) return null

  const allowed = serverPermissions.includes('*') || serverPermissions.includes(required)
  return allowed ? <>{children}</> : <ForbiddenPage />
}
