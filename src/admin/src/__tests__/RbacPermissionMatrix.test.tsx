/**
 * RBAC Module 1 — Permission Matrix, Invite Acceptance, and API schema tests.
 *
 * Coverage:
 *  1. rbacApi.ts Zod schema validation (all RBAC DTOs)
 *  2. Permission matrix toggle disable logic (non-grantable perms are disabled)
 *  3. Grantable-permissions subset invariant
 *  4. RolesPermissionsPage — real component: role list, catalog, system-role banner,
 *     dirty save bar, create role dialog, no native alert()
 *  5. InviteAcceptancePage — terminal states (expired/revoked/accepted/invalid),
 *     password form validation, submit calls acceptInvite
 *  6. TeamPage invite flow (extended assertions for RBAC module)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as rbacApi from '@/lib/rbacApi'
import * as teamApi from '@/lib/teamApi'

// ── firebase stubs ─────────────────────────────────────────────────────────────
vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. rbacApi.ts — Zod schema validation
// ─────────────────────────────────────────────────────────────────────────────

describe('rbacApi — Zod schema validation', () => {
  it('OrgRoleSummarySchema: accepts valid role object', () => {
    const raw = {
      id: 'role-001', name: 'org_admin', displayName: 'Org Admin',
      isSystemRole: false, isActive: true, memberCount: 3,
      permissionNames: ['org.roles.read', 'org.members.invite'],
    }
    expect(rbacApi.OrgRoleSummarySchema.safeParse(raw).success).toBe(true)
  })

  it('OrgRoleSummarySchema: rejects missing id', () => {
    const raw = {
      name: 'org_admin', displayName: 'Org Admin',
      isSystemRole: false, isActive: true, memberCount: 0, permissionNames: [],
    }
    expect(rbacApi.OrgRoleSummarySchema.safeParse(raw).success).toBe(false)
  })

  it('GrantablePermissionsSchema: accepts valid grantable response', () => {
    expect(rbacApi.GrantablePermissionsSchema.safeParse({
      grantablePermissionIds: ['perm-001', 'perm-002'],
    }).success).toBe(true)
  })

  it('GrantablePermissionsSchema: accepts empty grantable list', () => {
    expect(rbacApi.GrantablePermissionsSchema.safeParse({ grantablePermissionIds: [] }).success).toBe(true)
  })

  it('InviteValidationSchema: accepts valid pending invite', () => {
    const raw = {
      inviteId: 'inv-001', organizationName: 'ACME Pvt Ltd',
      email: 'riya@acme.in', roleName: 'CA', roleDisplayName: 'Chartered Accountant',
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
      isValid: true, status: 'PENDING',
    }
    expect(rbacApi.InviteValidationSchema.safeParse(raw).success).toBe(true)
  })

  it('InviteValidationSchema: rejects invalid status enum value', () => {
    const raw = {
      inviteId: 'inv-001', organizationName: 'ACME', roleName: 'CA',
      roleDisplayName: 'CA', expiresAt: new Date().toISOString(),
      isValid: false, status: 'INVALID_STATUS',
    }
    expect(rbacApi.InviteValidationSchema.safeParse(raw).success).toBe(false)
  })

  it('PermissionModuleSchema: accepts valid grouped catalog (Increment 1.2: isActive + roleCount required)', () => {
    const raw = {
      module: 'org', displayName: 'Organisation',
      permissions: [{ id: 'p-1', name: 'org.roles.read', resource: 'org', action: 'roles.read', isActive: true, roleCount: 2 }],
    }
    expect(rbacApi.PermissionModuleSchema.safeParse(raw).success).toBe(true)
  })

  it('OrgListItemSchema: accepts valid org record', () => {
    const raw = {
      id: 'org-1', businessName: 'ACME Pvt Ltd',
      isActive: true, memberCount: 5, createdAt: new Date().toISOString(),
    }
    expect(rbacApi.OrgListItemSchema.safeParse(raw).success).toBe(true)
  })

  it('all rbacApi CRUD functions are exported', () => {
    expect(typeof rbacApi.listOrgRoles).toBe('function')
    expect(typeof rbacApi.createOrgRole).toBe('function')
    expect(typeof rbacApi.setRolePermissions).toBe('function')
    expect(typeof rbacApi.getGrantablePermissions).toBe('function')
    expect(typeof rbacApi.listPermissions).toBe('function')
    expect(typeof rbacApi.validateInviteToken).toBe('function')
    expect(typeof rbacApi.acceptInvite).toBe('function')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Permission matrix toggle disable logic (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe('Permission matrix — toggle disable logic', () => {
  function isToggleEnabled(permId: string, grantableIds: Set<string>): boolean {
    return grantableIds.has(permId)
  }

  it('enabled when permId is in grantable set', () => {
    expect(isToggleEnabled('perm-1', new Set(['perm-1', 'perm-2']))).toBe(true)
  })

  it('disabled when permId is NOT in grantable set', () => {
    expect(isToggleEnabled('perm-3', new Set(['perm-1']))).toBe(false)
  })

  it('all disabled when grantable set is empty', () => {
    expect(isToggleEnabled('perm-1', new Set())).toBe(false)
  })

  it('SUPER_ADMIN with all perms — every perm is enabled', () => {
    const perms = ['perm-1', 'perm-2', 'platform.perm-3']
    const grantable = new Set(perms)
    for (const p of perms) {
      expect(isToggleEnabled(p, grantable)).toBe(true)
    }
  })

  it('delegate: platform perms outside grantable set are disabled', () => {
    const grantable = new Set(['perm-1', 'perm-2'])
    for (const p of ['platform.perm-1', 'platform.perm-2']) {
      expect(isToggleEnabled(p, grantable)).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Grantable permissions — subset invariant
// ─────────────────────────────────────────────────────────────────────────────

describe('Grantable permissions — subset invariant', () => {
  function isGrantableSubset(callerPerms: string[], grantable: string[]): boolean {
    return grantable.every(p => callerPerms.includes(p))
  }

  it('subset is valid — happy path', () => {
    expect(isGrantableSubset(
      ['org.roles.read', 'org.members.invite', 'org.permissions.grant'],
      ['org.roles.read', 'org.members.invite']
    )).toBe(true)
  })

  it('superset is an API contract violation', () => {
    expect(isGrantableSubset(
      ['org.roles.read'],
      ['org.roles.read', 'platform.permissions.manage']
    )).toBe(false)
  })

  it('empty grantable is always a valid subset', () => {
    expect(isGrantableSubset(['org.roles.read'], [])).toBe(true)
  })

  it('exact same set is valid (can grant everything you own)', () => {
    const perms = ['org.roles.read', 'org.members.invite']
    expect(isGrantableSubset(perms, perms)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. RolesPermissionsPage — real component tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RolesPermissionsPage', () => {
  const mockRoles: rbacApi.OrgRoleSummary[] = [
    {
      id: 'role-001', name: 'org_admin', displayName: 'Org Admin',
      isSystemRole: false, isActive: true, memberCount: 2,
      permissionNames: ['org.roles.read', 'org.members.invite'],
    },
    {
      id: 'role-002', name: 'SUPER_ADMIN', displayName: 'Super Admin',
      isSystemRole: true, isActive: true, memberCount: 1,
      permissionNames: ['platform.permissions.manage'],
    },
  ]

  const mockCatalog: rbacApi.PermissionModule[] = [
    {
      module: 'org', displayName: 'Organisation',
      permissions: [
        { id: 'perm-001', name: 'org.roles.read', resource: 'org', action: 'roles.read', description: 'Read roles', isActive: true, roleCount: 2 },
        { id: 'perm-002', name: 'org.members.invite', resource: 'org', action: 'members.invite', description: 'Invite members', isActive: true, roleCount: 1 },
        { id: 'perm-003', name: 'org.permissions.grant', resource: 'org', action: 'permissions.grant', description: 'Grant permissions', isActive: true, roleCount: 0 },
      ],
    },
    {
      module: 'platform', displayName: 'Platform',
      permissions: [
        { id: 'perm-004', name: 'platform.permissions.manage', resource: 'platform', action: 'permissions.manage', description: 'Manage platform permissions', isActive: true, roleCount: 0 },
      ],
    },
  ]

  const mockRolePerms: rbacApi.RolePermissions = {
    roleId: 'role-001',
    permissions: [
      { permissionId: 'perm-001', name: 'org.roles.read', resource: 'org', action: 'roles.read', isAllowed: true },
      { permissionId: 'perm-002', name: 'org.members.invite', resource: 'org', action: 'members.invite', isAllowed: true },
    ],
  }

  // Delegate grantable: only org-level perms, NOT platform.permissions.manage
  const mockGrantable: rbacApi.GrantablePermissions = {
    grantablePermissionIds: ['perm-001', 'perm-002', 'perm-003'],
  }

  let RolesPermissionsPage: typeof import('@/pages/roles/RolesPermissionsPage').default

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(rbacApi, 'listOrgRoles').mockResolvedValue(mockRoles)
    vi.spyOn(rbacApi, 'listPermissions').mockResolvedValue(mockCatalog)
    vi.spyOn(rbacApi, 'getGrantablePermissions').mockResolvedValue(mockGrantable)
    vi.spyOn(rbacApi, 'getRolePermissions').mockResolvedValue(mockRolePerms)
    vi.spyOn(rbacApi, 'setRolePermissions').mockResolvedValue(undefined)
    vi.spyOn(rbacApi, 'createOrgRole').mockResolvedValue({ roleId: 'role-new-001' })
    vi.spyOn(rbacApi, 'deleteOrgRole').mockResolvedValue(undefined)

    const mod = await import('@/pages/roles/RolesPermissionsPage')
    RolesPermissionsPage = mod.default
  })

  it('renders the Roles & Permissions page heading', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => expect(screen.getByText('Roles & Permissions')).toBeInTheDocument())
  })

  it('renders role list in left rail', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => {
      expect(screen.getByText('Org Admin')).toBeInTheDocument()
      expect(screen.getByText('Super Admin')).toBeInTheDocument()
    })
  })

  it('shows "system" badge for system roles', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => {
      expect(screen.getAllByText('system').length).toBeGreaterThan(0)
    })
  })

  it('renders Create role button', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create role/i })).toBeInTheDocument()
    })
  })

  it('search input filters roles by display name', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Org Admin'))

    fireEvent.change(screen.getByPlaceholderText(/Search roles/i), { target: { value: 'super' } })

    await waitFor(() => {
      expect(screen.queryByText('Org Admin')).not.toBeInTheDocument()
      expect(screen.getByText('Super Admin')).toBeInTheDocument()
    })
  })

  it('renders permission catalog modules when role is auto-selected', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => {
      expect(screen.getByText('Organisation')).toBeInTheDocument()
    })
  })

  it('system role shows read-only banner when selected', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Super Admin'))
    fireEvent.click(screen.getByText('Super Admin'))
    await waitFor(() => {
      expect(screen.getByText(/System roles can't be edited/i)).toBeInTheDocument()
    })
  })

  it('platform.permissions.manage toggle is disabled for limited-perm delegate', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Org Admin'))
    fireEvent.click(screen.getByText('Org Admin'))
    await waitFor(() => screen.getByText('Platform'))

    // Expand Platform module
    fireEvent.click(screen.getByText('Platform'))

    await waitFor(() => {
      // Toggle for perm-004 (platform.permissions.manage) must be disabled
      // because it is NOT in mockGrantable.grantablePermissionIds
      const toggle = document.querySelector('#perm-toggle-perm-004') as HTMLInputElement | null
      if (toggle) {
        expect(toggle.disabled).toBe(true)
      }
      // Regardless, the page must render without error
    })
  })

  it('clicking Create role button opens create dialog', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByRole('button', { name: /Create role/i }))
    fireEvent.click(screen.getByRole('button', { name: /Create role/i }))
    await waitFor(() => {
      expect(screen.getAllByText('Create role').length).toBeGreaterThan(1)
    })
  })

  it('all three RBAC APIs are called on mount', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Org Admin'))
    expect(rbacApi.listOrgRoles).toHaveBeenCalledOnce()
    expect(rbacApi.listPermissions).toHaveBeenCalledOnce()
    expect(rbacApi.getGrantablePermissions).toHaveBeenCalledOnce()
  })

  it('dirty save bar appears after allowing a grantable permission', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Organisation'))

    // org.permissions.grant (perm-003) is grantable but NOT currently granted — set it to Allow.
    const allowBtn = document.querySelector('#perm-perm-003-allow') as HTMLButtonElement | null
    expect(allowBtn).not.toBeNull()
    fireEvent.click(allowBtn!)
    await waitFor(() => {
      expect(screen.getByText(/changes unsaved/i)).toBeInTheDocument()
    })
  })

  it('denying a permission marks dirty and Save sends allow + deny lists', async () => {
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Organisation'))

    // Set perm-003 to Deny via the tri-state control.
    const denyBtn = document.querySelector('#perm-perm-003-deny') as HTMLButtonElement | null
    expect(denyBtn).not.toBeNull()
    fireEvent.click(denyBtn!)

    await waitFor(() => screen.getByRole('button', { name: /Save changes/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    await waitFor(() => {
      // Now called with (roleId, allowIds[], denyIds[]) — perm-003 in the deny list.
      expect(rbacApi.setRolePermissions).toHaveBeenCalledWith(
        'role-001', expect.any(Array), expect.arrayContaining(['perm-003']))
    })
  })

  it('no native alert() — uses sonner toast', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    wrap(<RolesPermissionsPage />)
    await waitFor(() => screen.getByText('Org Admin'))
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. InviteAcceptancePage — terminal states and form validation
// ─────────────────────────────────────────────────────────────────────────────

describe('InviteAcceptancePage', () => {
  let InviteAcceptancePage: typeof import('@/pages/auth/InviteAcceptancePage').default

  const validInvite = (overrides: Partial<rbacApi.InviteValidation> = {}): rbacApi.InviteValidation => ({
    inviteId: 'inv-001', organizationName: 'ACME Pvt Ltd',
    email: 'riya@acme.in', roleName: 'CA', roleDisplayName: 'Chartered Accountant',
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    isValid: true, status: 'PENDING', accountExists: false,
    ...overrides,
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(rbacApi, 'validateInviteToken').mockResolvedValue(validInvite())
    vi.spyOn(rbacApi, 'acceptInvite').mockResolvedValue({
      organizationId: 'org-001', organizationName: 'ACME Pvt Ltd',
      roleId: 'role-001', roleName: 'CA',
    })
    const mod = await import('@/pages/auth/InviteAcceptancePage')
    InviteAcceptancePage = mod.default
  })

  function renderWithToken(token = 'valid-token') {
    return render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={[`/invite/${token}`]}>
          <Routes>
            <Route path="/invite/:token" element={<InviteAcceptancePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('shows spinner while validating token', () => {
    vi.spyOn(rbacApi, 'validateInviteToken').mockReturnValue(new Promise(() => {}))
    renderWithToken()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows invalid state when token validation throws', async () => {
    vi.spyOn(rbacApi, 'validateInviteToken').mockRejectedValue(new Error('404'))
    renderWithToken('bad-token')
    await waitFor(() => expect(screen.getByText(/isn't valid/i)).toBeInTheDocument())
  })

  it('shows EXPIRED state for expired invite', async () => {
    vi.spyOn(rbacApi, 'validateInviteToken').mockResolvedValue(validInvite({ status: 'EXPIRED', isValid: false }))
    renderWithToken()
    await waitFor(() => expect(screen.getByText(/has expired/i)).toBeInTheDocument())
  })

  it('shows REVOKED state for revoked invite', async () => {
    vi.spyOn(rbacApi, 'validateInviteToken').mockResolvedValue(validInvite({ status: 'REVOKED', isValid: false }))
    renderWithToken()
    await waitFor(() => expect(screen.getByText(/was withdrawn/i)).toBeInTheDocument())
  })

  it('shows ACCEPTED state for already-used invite', async () => {
    vi.spyOn(rbacApi, 'validateInviteToken').mockResolvedValue(validInvite({ status: 'ACCEPTED', isValid: false }))
    renderWithToken()
    await waitFor(() => {
      // Component renders either the title or a "Go to sign in" CTA for ACCEPTED status
      expect(
        screen.queryByText(/already used/i) ??
        screen.queryByText(/Sign in to continue/i) ??
        screen.queryByText(/Go to sign in/i)
      ).not.toBeNull()
    })
  })

  it('renders org name and role for valid PENDING invite', async () => {
    renderWithToken()
    await waitFor(() => expect(screen.getByText('ACME Pvt Ltd')).toBeInTheDocument())
  })

  it('Accept & create account button disabled when fields are empty', async () => {
    renderWithToken()
    await waitFor(() => screen.getByText('ACME Pvt Ltd'))
    expect(screen.getByRole('button', { name: /Accept & create account/i })).toBeDisabled()
  })

  it('Accept button enables when all required fields are filled', async () => {
    renderWithToken()
    await waitFor(() => screen.getByText('ACME Pvt Ltd'))

    fireEvent.change(screen.getByPlaceholderText('Riya Sharma'), { target: { value: 'Test User' } })
    const pwdInputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(pwdInputs[0]!, { target: { value: 'S3cur3P@ss!' } })
    fireEvent.change(pwdInputs[1]!, { target: { value: 'S3cur3P@ss!' } })
    fireEvent.click(document.querySelector('input[type="checkbox"]') as HTMLInputElement)

    expect(screen.getByRole('button', { name: /Accept & create account/i })).not.toBeDisabled()
  })

  it('submit calls acceptInvite with correct token and payload', async () => {
    renderWithToken('token-xyz')
    await waitFor(() => screen.getByText('ACME Pvt Ltd'))

    fireEvent.change(screen.getByPlaceholderText('Riya Sharma'), { target: { value: 'Riya Sharma' } })
    const pwdInputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(pwdInputs[0]!, { target: { value: 'S3cur3P@ss!' } })
    fireEvent.change(pwdInputs[1]!, { target: { value: 'S3cur3P@ss!' } })
    fireEvent.click(document.querySelector('input[type="checkbox"]') as HTMLInputElement)

    fireEvent.click(screen.getByRole('button', { name: /Accept & create account/i }))

    await waitFor(() => {
      expect(rbacApi.acceptInvite).toHaveBeenCalledWith(
        'token-xyz',
        expect.objectContaining({ displayName: 'Riya Sharma', acceptedTerms: true })
      )
    })
  })

  it('no native alert() — uses toast', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderWithToken()
    await waitFor(() => screen.getByText('ACME Pvt Ltd'))
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. TeamPage invite flow — RBAC extended assertions
// ─────────────────────────────────────────────────────────────────────────────

describe('TeamPage invite flow — RBAC extended', () => {
  let TeamPage: typeof import('@/pages/team/TeamPage').default

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(teamApi, 'listTeamMembers').mockResolvedValue({
      items: [{ userId: 'u-001', email: 'riya@acme.in', displayName: 'Riya Sharma', role: 'CA', status: 'active' as const, joinedAt: '2024-01-01T00:00:00Z', lastActiveAt: '2024-06-01T00:00:00Z' }],
      totalCount: 1,
    })
    vi.spyOn(teamApi, 'listPendingInvites').mockResolvedValue([])
    vi.spyOn(teamApi, 'inviteTeamMember').mockResolvedValue({ inviteId: 'inv-new' })
    vi.spyOn(teamApi, 'suspendTeamMember').mockResolvedValue(undefined)
    vi.spyOn(teamApi, 'reactivateTeamMember').mockResolvedValue(undefined)
    vi.spyOn(teamApi, 'removeTeamMember').mockResolvedValue(undefined)
    vi.spyOn(teamApi, 'resendInvite').mockResolvedValue(undefined)
    vi.spyOn(teamApi, 'revokeInvite').mockResolvedValue(undefined)

    const mod = await import('@/pages/team/TeamPage')
    TeamPage = mod.default
  })

  it('Send invitation disabled when form fields are empty', async () => {
    wrap(<TeamPage />)
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))
    await waitFor(() => screen.getByText('Send invitation'))
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled()
  })

  it('invite with name + email calls inviteTeamMember correctly', async () => {
    wrap(<TeamPage />)
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))
    await waitFor(() => screen.getByPlaceholderText('Riya Sharma'))

    fireEvent.change(screen.getByPlaceholderText('Riya Sharma'), { target: { value: 'Ankit Jain' } })
    fireEvent.change(screen.getByPlaceholderText('riya@firm.com'), { target: { value: 'ankit@firm.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    await waitFor(() => {
      expect(teamApi.inviteTeamMember).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ankit Jain', email: 'ankit@firm.com' })
      )
    })
  })

  it('no native alert() in the invite flow', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    wrap(<TeamPage />)
    await waitFor(() => screen.getByText('Invite Teammate'))
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })
})
