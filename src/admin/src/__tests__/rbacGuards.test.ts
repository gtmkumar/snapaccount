/**
 * rbacGuards.test.ts — client-side RBAC regressions from the 2026-07-05
 * access-control sweep (ACM-01/02/06/07).
 *
 *  1. pickRole must FAIL CLOSED: unknown / org-member roles map to the
 *     least-privilege staff role, NEVER SUPER_ADMIN.
 *  2. requiredPermissionForPath must gate the roles/permissions matrix on a
 *     platform-level permission, and must guard the previously-open routes.
 */
import { describe, it, expect, vi } from 'vitest'

// useAuth (imported transitively) pulls in Firebase; stub it so the module loads.
vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

import { pickRole, type AdminRole } from '@/hooks/useAuth'
import { requiredPermissionForPath } from '@/components/shared/RoutePermissionGuard'

describe('pickRole — fails closed to least privilege', () => {
  it('defaults to DATA_ENTRY_OPERATOR (not SUPER_ADMIN) when no known role matches', () => {
    expect(pickRole([])).toBe('DATA_ENTRY_OPERATOR')
    expect(pickRole(['SOMETHING_UNKNOWN'])).toBe('DATA_ENTRY_OPERATOR')
  })

  it('maps org-member roles (ORG_ADMIN/MANAGER/HR/REVIEWER) to DATA_ENTRY_OPERATOR', () => {
    for (const role of ['ORG_ADMIN', 'MANAGER', 'HR', 'REVIEWER', 'DEV_LIMITED_MANAGER']) {
      expect(pickRole([role])).toBe('DATA_ENTRY_OPERATOR')
    }
  })

  it('NEVER returns SUPER_ADMIN for an unknown role (ACM-01/02/06 regression)', () => {
    for (const role of ['ORG_ADMIN', 'MANAGER', 'HR', 'REVIEWER', '', 'x']) {
      expect(pickRole([role])).not.toBe('SUPER_ADMIN')
    }
  })

  it('resolves each staff role to itself', () => {
    const staff: AdminRole[] = [
      'SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA',
      'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP',
    ]
    for (const role of staff) expect(pickRole([role])).toBe(role)
  })

  it('picks the highest-privilege known staff role when several are present', () => {
    expect(pickRole(['DATA_ENTRY_OPERATOR', 'SUPER_ADMIN'])).toBe('SUPER_ADMIN')
    expect(pickRole(['CA', 'OPERATIONS_MANAGER'])).toBe('OPERATIONS_MANAGER')
    // Unknown roles are ignored; the known staff role wins.
    expect(pickRole(['ORG_ADMIN', 'SUPPORT_EXECUTIVE'])).toBe('SUPPORT_EXECUTIVE')
  })
})

describe('requiredPermissionForPath — route → permission mapping', () => {
  it('gates the roles/permissions matrix on platform.roles.manage, not org.roles.read (ACM-02)', () => {
    expect(requiredPermissionForPath('/settings/roles')).toBe('platform.roles.manage')
    expect(requiredPermissionForPath('/settings/roles')).not.toBe('org.roles.read')
  })

  it('guards the previously-open routes (ACM-07)', () => {
    expect(requiredPermissionForPath('/notifications/templates')).toBe('notification.templates.read')
    expect(requiredPermissionForPath('/ca/availability')).toBe('chat.slots.manage')
    expect(requiredPermissionForPath('/ca/appointments')).toBe('chat.slots.manage')
  })

  it('applies a section permission to its detail routes via longest-prefix match', () => {
    expect(requiredPermissionForPath('/notifications/templates/abc-123')).toBe('notification.templates.read')
    expect(requiredPermissionForPath('/gst/notices')).toBe('menu.gst_notices.view')
    // more specific prefix wins over the shorter /gst
    expect(requiredPermissionForPath('/gst')).toBe('menu.gst.view')
  })

  it('treats unlisted routes as public (no required permission)', () => {
    expect(requiredPermissionForPath('/dashboard')).toBeNull()
  })
})
