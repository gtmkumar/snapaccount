import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/usePermission'

interface CanProps {
  /** Single permission code required (e.g. "document.read"). */
  permission?: string
  /** Allowed if the user has ANY of these permission codes. */
  anyOf?: string[]
  /** Allowed if the user has ALL of these permission codes. */
  allOf?: string[]
  /** Rendered when the permission check fails (default: nothing). */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Can — in-page action gating by server permission.
 *
 * Renders `children` only when the current user holds the required permission
 * code(s) from GET /auth/me/permissions (via `usePermission().hasServerPermission`).
 * SUPER_ADMIN's wildcard is expanded server-side, so admins pass these checks.
 *
 * Until the permission list has loaded, the `fallback` is shown to avoid briefly
 * flashing actions a user may not be allowed to see.
 *
 * @example
 * <Can permission="document.update"><Button>Assign</Button></Can>
 */
export function Can({ permission, anyOf, allOf, fallback = null, children }: CanProps) {
  const {
    hasServerPermission,
    hasAnyServerPermission,
    hasAllServerPermissions,
    permissionsLoaded,
  } = usePermission()

  // Don't reveal gated actions before we know the user's permissions.
  if (!permissionsLoaded) return <>{fallback}</>

  let allowed = true
  if (permission) allowed = hasServerPermission(permission)
  else if (anyOf && anyOf.length > 0) allowed = hasAnyServerPermission(anyOf)
  else if (allOf && allOf.length > 0) allowed = hasAllServerPermissions(allOf)

  return allowed ? <>{children}</> : <>{fallback}</>
}
