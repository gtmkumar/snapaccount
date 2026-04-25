/**
 * RoleGuard — Phase 6F component tests
 * Covers: gates content by role; renders fallback; redirects when unauthorized.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RoleGuard } from '@/components/shared/RoleGuard'
import type { AdminRole } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Mocks — useAuth is the key dependency
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/hooks/usePermission', () => ({
  usePermission: vi.fn(() => ({
    canAccess: (roles: AdminRole[]) => roles.includes(mockUseAuth().user?.role),
    hasPermission: (_perm: string) => {
      const role = mockUseAuth().user?.role
      // Simple allow-all for SYSTEM_ADMIN, deny for others
      return role === 'SYSTEM_ADMIN'
    },
  })),
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUser(role: AdminRole | null) {
  mockUseAuth.mockReturnValue({
    user: role ? { uid: 'u1', email: 'dev@snapaccount.in', displayName: 'Dev', role } : null,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  })
}

function setLoading() {
  mockUseAuth.mockReturnValue({ user: null, loading: true, error: null, signInWithGoogle: vi.fn(), signOut: vi.fn() })
}

function renderGuard({
  allow,
  permissions,
  fallback,
  redirectOnDeny = true,
  children = <div>Protected Content</div>,
}: {
  allow: AdminRole[]
  permissions?: string[]
  fallback?: React.ReactNode
  redirectOnDeny?: boolean
  children?: React.ReactNode
}) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <RoleGuard allow={allow} permissions={permissions} fallback={fallback} redirectOnDeny={redirectOnDeny}>
        {children}
      </RoleGuard>
    </MemoryRouter>
  )
}

import React from 'react'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoleGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows spinner while auth is loading', () => {
    setLoading()
    renderGuard({ allow: ['SYSTEM_ADMIN'] })
    // Loading spinner div is present
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('does not show protected content while loading', () => {
    setLoading()
    renderGuard({ allow: ['SYSTEM_ADMIN'] })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Unauthenticated — redirect to login
  // ---------------------------------------------------------------------------

  it('redirects to /login when user is not authenticated', () => {
    setUser(null)
    renderGuard({ allow: ['SYSTEM_ADMIN'] })
    // MemoryRouter will navigate — the content should not render
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Authorized
  // ---------------------------------------------------------------------------

  it('renders children when user role is in allow list', () => {
    setUser('SYSTEM_ADMIN')
    renderGuard({ allow: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'] })
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('renders children for one of multiple allowed roles', () => {
    setUser('CA')
    renderGuard({ allow: ['CA', 'OPERATIONS_MANAGER'] })
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('renders children for PARTNER_BANK_REP when explicitly allowed', () => {
    setUser('PARTNER_BANK_REP')
    renderGuard({ allow: ['PARTNER_BANK_REP'] })
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Unauthorized — role not in allow list
  // ---------------------------------------------------------------------------

  it('does not render children when role not in allow list', () => {
    setUser('DATA_ENTRY_OPERATOR')
    renderGuard({ allow: ['SYSTEM_ADMIN', 'CA'], redirectOnDeny: false })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders fallback when user is unauthorized and fallback is provided', () => {
    setUser('DATA_ENTRY_OPERATOR')
    renderGuard({
      allow: ['SYSTEM_ADMIN'],
      fallback: <div>Access Denied Fallback</div>,
    })
    expect(screen.getByText('Access Denied Fallback')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('does not render children when fallback is shown', () => {
    setUser('SUPPORT_EXECUTIVE')
    renderGuard({
      allow: ['SYSTEM_ADMIN'],
      fallback: <div>No access</div>,
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders null (nothing) when unauthorized, no fallback, redirectOnDeny=false', () => {
    setUser('DATA_ENTRY_OPERATOR')
    renderGuard({ allow: ['SYSTEM_ADMIN'], redirectOnDeny: false })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Multiple role checks
  // ---------------------------------------------------------------------------

  it('SUPPORT_EXECUTIVE cannot access SYSTEM_ADMIN-only content', () => {
    setUser('SUPPORT_EXECUTIVE')
    renderGuard({ allow: ['SYSTEM_ADMIN'], redirectOnDeny: false })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('OPERATIONS_MANAGER can access content allowed for OPERATIONS_MANAGER', () => {
    setUser('OPERATIONS_MANAGER')
    renderGuard({ allow: ['OPERATIONS_MANAGER', 'SYSTEM_ADMIN'] })
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('DATA_ENTRY_OPERATOR cannot access CA-only content', () => {
    setUser('DATA_ENTRY_OPERATOR')
    renderGuard({
      allow: ['CA', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN'],
      fallback: <div>Restricted</div>,
    })
    expect(screen.getByText('Restricted')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Inline usage (no redirect on deny)
  // ---------------------------------------------------------------------------

  it('inline usage: shows fallback element for unauthorized role', () => {
    setUser('PARTNER_BANK_REP')
    render(
      <MemoryRouter>
        <div>
          <h1>Page Content</h1>
          <RoleGuard allow={['SYSTEM_ADMIN']} redirectOnDeny={false} fallback={<span>Feature locked</span>}>
            <button>Dangerous Action</button>
          </RoleGuard>
        </div>
      </MemoryRouter>
    )
    expect(screen.getByText('Page Content')).toBeInTheDocument()
    expect(screen.getByText('Feature locked')).toBeInTheDocument()
    expect(screen.queryByText('Dangerous Action')).not.toBeInTheDocument()
  })

  it('inline usage: shows children for authorized role', () => {
    setUser('SYSTEM_ADMIN')
    render(
      <MemoryRouter>
        <div>
          <h1>Page Content</h1>
          <RoleGuard allow={['SYSTEM_ADMIN']} redirectOnDeny={false}>
            <button>Admin Action</button>
          </RoleGuard>
        </div>
      </MemoryRouter>
    )
    expect(screen.getByText('Admin Action')).toBeInTheDocument()
  })
})
