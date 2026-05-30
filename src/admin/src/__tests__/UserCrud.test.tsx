/**
 * Auth/RBAC Module 1, Increment 1.4 Phase B — User CRUD (Edit/Delete) tests
 *
 * Coverage:
 *  1. validateUserAttributes — PAN / Aadhaar / pincode / future-DOB rules
 *  2. toProfileInput — omits empties, passes set fields, PAN only when entered
 *  3. EditUserDialog — prefills name + masked-PAN placeholder + immutable email,
 *     and Save calls updateAdminUser with the merged payload (blank PAN omitted)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  validateUserAttributes, toProfileInput, emptyUserAttributes,
} from '@/components/shared/UserAttributeFields'
import * as userAdminApi from '@/lib/userAdminApi'
import * as rbacApi from '@/lib/rbacApi'
import * as referenceDataApi from '@/lib/referenceDataApi'
import { EditUserDialog } from '@/components/shared/EditUserDialog'

// ── firebase stubs ─────────────────────────────────────────────────────────────
vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. validateUserAttributes
// ─────────────────────────────────────────────────────────────────────────────

describe('validateUserAttributes', () => {
  it('accepts a clean empty profile', () => {
    expect(validateUserAttributes(emptyUserAttributes())).toEqual({})
  })

  it('rejects a malformed PAN', () => {
    const v = { ...emptyUserAttributes(), panNumber: 'BADPAN' }
    expect(validateUserAttributes(v)).toHaveProperty('panNumber')
  })

  it('accepts a valid PAN', () => {
    const v = { ...emptyUserAttributes(), panNumber: 'ABCDE1234F' }
    expect(validateUserAttributes(v).panNumber).toBeUndefined()
  })

  it('rejects bad aadhaar last-4 and short pincode', () => {
    const v = { ...emptyUserAttributes(), aadhaarLast4: '12', pincode: '40' }
    const errs = validateUserAttributes(v)
    expect(errs).toHaveProperty('aadhaarLast4')
    expect(errs).toHaveProperty('pincode')
  })

  it('rejects a future date of birth', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const v = { ...emptyUserAttributes(), dateOfBirth: future }
    expect(validateUserAttributes(v)).toHaveProperty('dateOfBirth')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. toProfileInput
// ─────────────────────────────────────────────────────────────────────────────

describe('toProfileInput', () => {
  it('omits empty fields and keeps set ones', () => {
    const v = { ...emptyUserAttributes(), city: 'Mumbai', state: 'MH', country: 'IN' }
    const out = toProfileInput(v)
    expect(out.city).toBe('Mumbai')
    expect(out.state).toBe('MH')
    expect(out.country).toBe('IN')
    expect(out.panNumber).toBeUndefined()
    expect(out.aadhaarLast4).toBeUndefined()
  })

  it('passes a freshly entered PAN', () => {
    const v = { ...emptyUserAttributes(), panNumber: 'ABCDE1234F' }
    expect(toProfileInput(v).panNumber).toBe('ABCDE1234F')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. EditUserDialog prefill + submit
// ─────────────────────────────────────────────────────────────────────────────

describe('EditUserDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(userAdminApi, 'getAdminUserDetail').mockResolvedValue({
      id: 'user-1',
      name: 'Riya Sharma',
      email: 'riya@acme.in',
      phone: '+919876543210',
      isActive: true,
      preferredLanguage: 'en',
      userType: 'STAFF',
      joinedAt: '2026-01-01T00:00:00Z',
      roleId: 'role-1',
      roleScope: 'platform',
      roleOrganizationId: null,
      overridePermissionIds: [],
      profile: {
        panMasked: 'ABCDE****F',
        aadhaarLast4: '1234',
        dateOfBirth: null,
        gender: null,
        addressLine1: null,
        addressLine2: null,
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
        country: 'IN',
      },
      business: null,
    } as userAdminApi.UserDetail)

    vi.spyOn(userAdminApi, 'listAssignableRoles').mockResolvedValue([
      { id: 'role-1', name: 'BUSINESS_OWNER', displayName: 'Business Owner', isSystemRole: true, permissionCount: 0, permissions: [] },
    ])
    vi.spyOn(rbacApi, 'listPermissions').mockResolvedValue([])
    vi.spyOn(rbacApi, 'getGrantablePermissions').mockResolvedValue({ grantablePermissionIds: [] } as Awaited<ReturnType<typeof rbacApi.getGrantablePermissions>>)
    vi.spyOn(referenceDataApi, 'listReferenceData').mockResolvedValue([])
  })

  function renderDialog() {
    return render(
      <QueryClientProvider client={makeQC()}>
        <EditUserDialog open onClose={() => {}} userId="user-1" />
      </QueryClientProvider>,
    )
  }

  it('prefills the name and shows the immutable email + masked PAN', async () => {
    renderDialog()
    const nameInput = await screen.findByDisplayValue('Riya Sharma')
    expect(nameInput).toBeInTheDocument()
    expect(screen.getByText('riya@acme.in')).toBeInTheDocument()
    // Expand the collapsible KYC section, then the masked PAN appears as the field placeholder
    fireEvent.click(screen.getByRole('button', { name: /KYC & profile/i }))
    expect(screen.getByPlaceholderText('ABCDE****F')).toBeInTheDocument()
  })

  it('Save calls updateAdminUser with the merged payload and a blank PAN', async () => {
    const updateSpy = vi.spyOn(userAdminApi, 'updateAdminUser').mockResolvedValue({
      userId: 'user-1', scope: 'platform', roleId: 'role-1', grantedPermissions: [],
    })
    renderDialog()
    await screen.findByDisplayValue('Riya Sharma')

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    const [calledId, payload] = updateSpy.mock.calls[0]
    expect(calledId).toBe('user-1')
    expect(payload).toMatchObject({
      fullName: 'Riya Sharma',
      roleId: 'role-1',
      isActive: true,
      preferredLanguage: 'en',
      userType: 'STAFF',
    })
    // blank PAN must not be sent (keeps the stored encrypted value)
    expect(payload.profile?.panNumber).toBeUndefined()
    expect(payload.profile?.city).toBe('Mumbai')
  })
})
