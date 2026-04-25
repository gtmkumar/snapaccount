import { useAuth, type AdminRole } from './useAuth'

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY: AdminRole[] = [
  'PARTNER_BANK_REP',
  'DATA_ENTRY_OPERATOR',
  'SUPPORT_EXECUTIVE',
  'CA',
  'OPERATIONS_MANAGER',
  'SYSTEM_ADMIN',
]

// Permission map: which roles can access which features
const PERMISSIONS: Record<string, AdminRole[]> = {
  // Documents
  'documents.view': ['DATA_ENTRY_OPERATOR', 'SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'documents.review': ['DATA_ENTRY_OPERATOR', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'documents.approve': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'documents.delete': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'documents.ocr_report': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],

  // GST
  'gst.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'gst.edit': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'gst.file': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'gst.notices': ['CA', 'SUPPORT_EXECUTIVE', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],

  // ITR
  'itr.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'itr.edit': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'itr.file': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],

  // Loans
  'loans.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN', 'PARTNER_BANK_REP'],
  'loans.edit': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'loans.bank_submit': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],

  // Users
  'users.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'users.edit': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'users.suspend': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'users.delete': ['SYSTEM_ADMIN'],

  // Team
  'team.view': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'team.invite': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'team.roles': ['SYSTEM_ADMIN'],

  // Settings
  'settings.view': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'settings.edit': ['SYSTEM_ADMIN'],
  'settings.feature_flags': ['SYSTEM_ADMIN'],

  // Reports
  'reports.view': ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'reports.export': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'reports.financial': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],

  // Audit
  'audit.view': ['SYSTEM_ADMIN'],
  'audit.export': ['SYSTEM_ADMIN'],

  // Chat
  'chat.view': ['SUPPORT_EXECUTIVE', 'CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
  'chat.manage': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],

  // Dashboard
  'dashboard.system_health': ['SYSTEM_ADMIN'],
  'dashboard.full': ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
}

export function usePermission() {
  const { user } = useAuth()

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

  return {
    hasPermission,
    hasRole,
    hasMinRole,
    canAccess,
    role: user?.role,
  }
}
