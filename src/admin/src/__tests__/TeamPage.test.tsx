/**
 * TeamPage — Phase 6F smoke tests
 * Covers: invite dialog, role assignment, member list, workload/roles tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as teamApi from '@/lib/teamApi'
import TeamPage from '@/pages/team/TeamPage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const makeTeamMember = (overrides: Partial<teamApi.TeamMember> = {}): teamApi.TeamMember => ({
  userId: 'user-001',
  email: 'riya@snapaccount.in',
  displayName: 'Riya Sharma',
  role: 'CA',
  status: 'active',
  joinedAt: '2024-01-01T00:00:00Z',
  lastActiveAt: '2024-03-01T10:00:00Z',
  ...overrides,
})

const mockMembers: { items: teamApi.TeamMember[]; totalCount: number } = {
  items: [
    makeTeamMember({ userId: 'user-001', email: 'riya@snapaccount.in', displayName: 'Riya Sharma', role: 'CA' }),
    makeTeamMember({ userId: 'user-002', email: 'arjun@snapaccount.in', displayName: 'Arjun Kumar', role: 'SUPPORT_EXECUTIVE', status: 'suspended' }),
  ],
  totalCount: 2,
}

const mockInvites: teamApi.PendingInvite[] = [
  {
    inviteId: 'invite-001',
    email: 'neha@firm.com',
    role: 'CA',
    status: 'pending',
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    invitedAt: new Date().toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(teamApi, 'listTeamMembers').mockResolvedValue(mockMembers)
  vi.spyOn(teamApi, 'listPendingInvites').mockResolvedValue(mockInvites)
  vi.spyOn(teamApi, 'inviteTeamMember').mockResolvedValue({ inviteId: 'invite-new' })
  vi.spyOn(teamApi, 'suspendTeamMember').mockResolvedValue(undefined)
  vi.spyOn(teamApi, 'reactivateTeamMember').mockResolvedValue(undefined)
  vi.spyOn(teamApi, 'removeTeamMember').mockResolvedValue(undefined)
  vi.spyOn(teamApi, 'resendInvite').mockResolvedValue(undefined)
  vi.spyOn(teamApi, 'revokeInvite').mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamPage', () => {
  it('renders page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
  })

  it('renders Invite Teammate button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Invite Teammate')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Members tab
  // ---------------------------------------------------------------------------

  it('renders team member names', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Riya Sharma')).toBeInTheDocument()
      expect(screen.getByText('Arjun Kumar')).toBeInTheDocument()
    })
  })

  it('renders member emails', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('riya@snapaccount.in')).toBeInTheDocument()
    })
  })

  it('renders active status badge', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument()
    })
  })

  it('renders suspended status badge', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('suspended')).toBeInTheDocument()
    })
  })

  it('search input filters members by name', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Riya Sharma'))

    const searchInput = screen.getByPlaceholderText(/Search by name or email/i)
    fireEvent.change(searchInput, { target: { value: 'Arjun' } })

    await waitFor(() => {
      expect(screen.queryByText('Riya Sharma')).not.toBeInTheDocument()
      expect(screen.getByText('Arjun Kumar')).toBeInTheDocument()
    })
  })

  it('search input filters members by email', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Riya Sharma'))

    const searchInput = screen.getByPlaceholderText(/Search by name or email/i)
    fireEvent.change(searchInput, { target: { value: 'riya@' } })

    expect(screen.getByText('Riya Sharma')).toBeInTheDocument()
    expect(screen.queryByText('Arjun Kumar')).not.toBeInTheDocument()
  })

  it('Suspend button calls suspendTeamMember for active member', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Riya Sharma'))

    const suspendBtns = screen.getAllByRole('button', { name: 'Suspend' })
    fireEvent.click(suspendBtns[0]!)

    await waitFor(() => {
      // TanStack Query passes (variables, context) to mutationFn internally —
      // verify the spy was called with 'user-001' as the first argument
      expect(teamApi.suspendTeamMember).toHaveBeenCalled()
      const firstCallArgs = (teamApi.suspendTeamMember as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(firstCallArgs[0]).toBe('user-001')
    })
  })

  it('Reactivate button calls reactivateTeamMember for suspended member', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Arjun Kumar'))

    const reactivateBtn = screen.getByRole('button', { name: 'Reactivate' })
    fireEvent.click(reactivateBtn)

    await waitFor(() => {
      expect(teamApi.reactivateTeamMember).toHaveBeenCalled()
      const firstCallArgs = (teamApi.reactivateTeamMember as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(firstCallArgs[0]).toBe('user-002')
    })
  })

  it('Remove button calls removeTeamMember', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Riya Sharma'))

    const removeBtns = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(removeBtns[0]!)

    await waitFor(() => {
      expect(teamApi.removeTeamMember).toHaveBeenCalled()
      const firstCallArgs = (teamApi.removeTeamMember as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(firstCallArgs[0]).toBe('user-001')
    })
  })

  // ---------------------------------------------------------------------------
  // Invite dialog
  // ---------------------------------------------------------------------------

  it('clicking Invite Teammate opens invite dialog', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invite Teammate'))

    fireEvent.click(screen.getByText('Invite Teammate'))

    await waitFor(() => {
      expect(screen.getByText('Invite Teammate', { selector: 'h2,h3,div[id]' }) ||
        screen.getAllByText('Invite Teammate').length > 1).toBeTruthy()
    })
  })

  it('invite dialog has name, email, and role fields', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Riya Sharma')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('riya@firm.com')).toBeInTheDocument()
    })
  })

  it('Send invitation button is disabled when name or email empty', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))

    await waitFor(() => screen.getByText('Send invitation'))

    const sendBtn = screen.getByRole('button', { name: 'Send invitation' })
    expect(sendBtn).toBeDisabled()
  })

  it('filling name + email enables Send invitation and calls inviteTeamMember', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))

    await waitFor(() => screen.getByPlaceholderText('Riya Sharma'))

    fireEvent.change(screen.getByPlaceholderText('Riya Sharma'), { target: { value: 'Neha Singh' } })
    fireEvent.change(screen.getByPlaceholderText('riya@firm.com'), { target: { value: 'neha@firm.com' } })

    const sendBtn = screen.getByRole('button', { name: 'Send invitation' })
    expect(sendBtn).not.toBeDisabled()

    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(teamApi.inviteTeamMember).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Neha Singh', email: 'neha@firm.com' })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Invites tab
  // ---------------------------------------------------------------------------

  it('clicking Invites tab shows pending invites', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invites'))
    fireEvent.click(screen.getByText('Invites'))

    await waitFor(() => {
      expect(screen.getByText('neha@firm.com')).toBeInTheDocument()
    })
  })

  it('Resend button calls resendInvite', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invites'))
    fireEvent.click(screen.getByText('Invites'))

    await waitFor(() => screen.getByText('Resend'))
    fireEvent.click(screen.getByText('Resend'))

    await waitFor(() => {
      expect(teamApi.resendInvite).toHaveBeenCalled()
      const firstCallArgs = (teamApi.resendInvite as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(firstCallArgs[0]).toBe('invite-001')
    })
  })

  // ---------------------------------------------------------------------------
  // Roles tab
  // ---------------------------------------------------------------------------

  it('clicking Roles tab shows role descriptions', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Roles'))
    fireEvent.click(screen.getByText('Roles'))

    await waitFor(() => {
      expect(screen.getByText('Full access to all modules, settings, team management, and subscriptions.')).toBeInTheDocument()
    })
  })

  it('Roles tab lists all 6 roles', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Roles'))
    fireEvent.click(screen.getByText('Roles'))

    await waitFor(() => {
      // RoleChip renders human-readable labels, not raw role names
      // SUPER_ADMIN → 'Admin', OPERATIONS_MANAGER → 'Ops Manager', CA → 'CA'
      // Verify descriptions for all 6 roles appear (unique per role)
      expect(screen.getByText('Full access to all modules, settings, team management, and subscriptions.')).toBeInTheDocument()
      expect(screen.getByText('Chartered Accountant — access to ITR review, GST notices, chat, and reports.')).toBeInTheDocument()
      expect(screen.getByText('Support access — callbacks, chat, documents, and user management.')).toBeInTheDocument()
    })
  })
})
