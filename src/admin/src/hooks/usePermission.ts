import { useAuth, type AdminRole } from './useAuth'
import { useQuery } from '@tanstack/react-query'
import { getMyPermissions } from '@/lib/teamApi'

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY: AdminRole[] = [
  'PARTNER_BANK_REP',
  'DATA_ENTRY_OPERATOR',
  'SUPPORT_EXECUTIVE',
  'CA',
  'OPERATIONS_MANAGER',
  'SUPER_ADMIN',
]

// Permission map: which roles can access which features
const PERMISSIONS: Record<string, AdminRole[]> = {
  // Documents
  'documents.view': ['DATA_ENTRY_OPERATOR', 'SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'documents.review': ['DATA_ENTRY_OPERATOR', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'documents.approve': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'documents.delete': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'documents.ocr_report': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],

  // GST
  'gst.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'gst.edit': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'gst.file': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'gst.notices': ['CA', 'SUPPORT_EXECUTIVE', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],

  // ITR
  'itr.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'itr.edit': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'itr.file': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],

  // Loans
  'loans.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN', 'PARTNER_BANK_REP'],
  'loans.edit': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'loans.bank_submit': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],

  // Users
  'users.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'users.edit': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'users.suspend': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'users.delete': ['SUPER_ADMIN'],

  // Team
  'team.view': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'team.invite': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'team.roles': ['SUPER_ADMIN'],

  // Settings
  'settings.view': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'settings.edit': ['SUPER_ADMIN'],
  'settings.feature_flags': ['SUPER_ADMIN'],

  // Reports
  'reports.view': ['CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'reports.export': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'reports.financial': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],

  // Audit
  'audit.view': ['SUPER_ADMIN'],
  'audit.export': ['SUPER_ADMIN'],

  // Chat
  'chat.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'],
  'chat.manage': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],

  // Dashboard
  'dashboard.system_health': ['SUPER_ADMIN'],
  'dashboard.full': ['OPERATIONS_MANAGER', 'SUPER_ADMIN'],
}

/**
 * usePermission
 *
 * Provides both:
 *  - Static role-based checks (legacy, for sidebar gating): hasPermission(), hasRole(), hasMinRole(), canAccess()
 *  - Dynamic server-backed permission string checks (Module 1 RBAC): hasServerPermission()
 *
 * Dynamic permissions come from GET /auth/me/permissions and are keyed as "resource.action"
 * strings (e.g. "org.roles.read", "platform.orgs.create").
 */
export function usePermission() {
  const { user } = useAuth()

  // Fetch server-side permission strings for the current user.
  // Disabled when not logged in to avoid a 401 on the initial render.
  const { data: serverPermsData } = useQuery({
    queryKey: ['auth', 'me', 'permissions'],
    queryFn: getMyPermissions,
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })

  const serverPermissions: string[] = serverPermsData?.permissions ?? []

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    const allowedRoles = PERMISSIONS[permission]
    if (!allowedRoles) return false
    return allowedRoles.includes(user.role)
  }

  const hasRole = (role: AdminRole): boolean => {
    if (!user) return false
    return user.role === role
  }

  const hasMinRole = (minRole: AdminRole): boolean => {
    if (!user) return false
    const userLevel = ROLE_HIERARCHY.indexOf(user.role)
    const minLevel = ROLE_HIERARCHY.indexOf(minRole)
    return userLevel >= minLevel
  }

  const canAccess = (roles: AdminRole[]): boolean => {
    if (!user) return false
    return roles.includes(user.role)
  }

  // ── Dynamic server permission checks (Module 1 RBAC) ─────────────────────────

  /**
   * Check whether the current user has a specific permission code string
   * as returned by GET /auth/me/permissions (e.g. 'org.roles.read').
   */
  const hasServerPermission = (permissionCode: string): boolean => {
    return serverPermissions.includes(permissionCode)
  }

  /**
   * Check whether the current user has ANY of the given permission codes.
   */
  const hasAnyServerPermission = (permissionCodes: string[]): boolean => {
    return permissionCodes.some(p => serverPermissions.includes(p))
  }

  /**
   * Check whether the current user has ALL of the given permission codes.
   */
  const hasAllServerPermissions = (permissionCodes: string[]): boolean => {
    return permissionCodes.every(p => serverPermissions.includes(p))
  }

  return {
    // Static (legacy role-based)
    hasPermission,
    hasRole,
    hasMinRole,
    canAccess,
    role: user?.role,
    // Dynamic (Module 1 RBAC — from /auth/me/permissions)
    hasServerPermission,
    hasAnyServerPermission,
    hasAllServerPermissions,
    serverPermissions,
    // True once /auth/me/permissions has resolved (avoids guards flashing "forbidden"
    // before the permission list is loaded).
    permissionsLoaded: serverPermsData !== undefined,
  }
}
