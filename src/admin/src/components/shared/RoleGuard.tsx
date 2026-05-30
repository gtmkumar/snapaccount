/**
 * RoleGuard — Phase 6F Track F1
 * Route-level and inline role-based access control.
 * Reads useAuth().role and usePermission().hasPermission().
 */
import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth, type AdminRole } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface RoleGuardProps {
  /** ANY-of role check */
  allow: AdminRole[]
  /** ALL-of permission check (additive to role check) */
  permissions?: string[]
  /** Render instead of redirect when denied (for inline use inside pages) */
  fallback?: ReactNode
  /** When true and denied and no fallback, redirect to /403. Default: true */
  redirectOnDeny?: boolean
  children: ReactNode
}

export function RoleGuard({
  allow,
  permissions,
  fallback,
  redirectOnDeny = true,
  children,
}: RoleGuardProps) {
  const { user, loading } = useAuth()
  const { canAccess, hasPermission } = usePermission()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-[var(--surface-canvas)]">
        <div className="w-8 h-8 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  const roleAllowed = canAccess(allow)
  const permsAllowed = permissions ? permissions.every(p => hasPermission(p)) : true
  const allowed = roleAllowed && permsAllowed

  if (allowed) return <>{children}</>

  if (fallback !== undefined) return <>{fallback}</>

  if (redirectOnDeny) {
    return <Navigate to="/403" replace state={{ from: location.pathname }} />
  }

  return null
}

// ── 403 Forbidden page ──────────────────────────────────────────────────────
const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'System Administrator',
  OPERATIONS_MANAGER: 'Operations Manager',
  CA: 'Chartered Accountant',
  SUPPORT_EXECUTIVE: 'Support Executive',
  DATA_ENTRY_OPERATOR: 'Data Entry Operator',
  PARTNER_BANK_REP: 'Partner Bank Representative',
}

export function ForbiddenPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const roleLabel = user ? ROLE_LABELS[user.role] : ''

  return (
    <main
      className="flex items-center justify-center min-h-screen bg-[var(--surface-canvas)]"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center max-w-md mx-auto px-6 py-12">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-[var(--surface-sunken)]">
            <Lock className="h-12 w-12 text-[var(--text-tertiary)]" aria-hidden="true" />
          </div>
        </div>

        <h1
          className="text-2xl font-bold text-[var(--text-primary)] mb-3 focus:outline-none"
          tabIndex={-1}
          autoFocus
        >
          {t('403.heading', "You don't have access to this page")}
        </h1>

        <p className="text-[var(--text-secondary)] mb-8">
          {t('403.body', {
            defaultValue: "Your role ({{roleLabel}}) doesn't include this area. If you believe this is a mistake, contact your administrator.",
            roleLabel,
          })}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="primary" onClick={() => { window.location.href = '/dashboard' }}>
            {t('403.cta.dashboard', 'Go to dashboard')}
          </Button>
          <Button variant="ghost" onClick={() => { window.location.href = 'mailto:admin@snapaccount.in' }}>
            {t('403.cta.contactAdmin', 'Contact admin')}
          </Button>
        </div>

        <p className="mt-6 text-sm text-[var(--text-tertiary)]">
          <a href="/logout?next=/login" className="text-[var(--text-link)] hover:underline">
            {t('403.cta.signInAs', 'Sign in as a different user')}
          </a>
        </p>
      </div>
    </main>
  )
}
