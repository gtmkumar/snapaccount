/**
 * TeamPage — smoke tests for the plan-aligned, staff-only Team page.
 * Covers: page header, default Staff tab roster, Roles tab, and the staff
 * Invite dialog. (Org-scoped Members/Invites tabs were removed — the product
 * plan is single-tenant; customers live on the Users page.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as teamApi from '@/lib/teamApi'
import * as staffApi from '@/lib/staffApi'
import * as userAdminApi from '@/lib/userAdminApi'
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

// Grant the manage permission so the Staff tab renders fully.
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasServerPermission: () => true,
    canAccess: () => true,
    hasPermission: () => true,
    serverPermissions: ['platform.admins.invite'],
  }),
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

const gridRows: staffApi.StaffWorkloadRow[] = [
  {
    userId: 'u1', name: 'Riya Sharma', email: 'riya@snap.in', role: 'CA',
    roleDisplayName: 'CA', status: 'active', joinedAt: null, lastActiveAt: null,
    queues: { gst: 5, itr: 35, chat: 0, callbacks: 1 },
    completedByQueue: { gst: 2, itr: 1, chat: 0, callbacks: 4 },
    totalAssigned: 41, totalCompleted: 7,
  },
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(staffApi, 'getStaffWorkloadGrid').mockResolvedValue({ rows: gridRows, errors: {} })
  vi.spyOn(userAdminApi, 'setAdminUserActive').mockResolvedValue(undefined)
  vi.spyOn(teamApi, 'inviteTeamMember').mockResolvedValue({ inviteId: 'invite-new' })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamPage (staff-only)', () => {
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

  it('defaults to the Staff tab and renders the staff roster', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Riya Sharma')).toBeInTheDocument()
    })
  })

  it('does NOT render org-scoped Members or Invites tabs', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Staff'))
    expect(screen.queryByRole('tab', { name: /Members/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Invites/i })).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Roles tab (plan §J6)
  // ---------------------------------------------------------------------------

  it('clicking Roles tab shows staff role descriptions', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Roles'))
    fireEvent.click(screen.getByText('Roles'))

    await waitFor(() => {
      expect(screen.getByText('Full access to all modules, settings, team management, and subscriptions.')).toBeInTheDocument()
      expect(screen.getByText('Manages the team, monitors KPIs, views reports, and handles escalations.')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Invite dialog (staff invitation)
  // ---------------------------------------------------------------------------

  it('clicking Invite Teammate opens the invite dialog with name/email fields', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Riya Sharma')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('riya@firm.com')).toBeInTheDocument()
    })
  })

  it('Send invitation is disabled until name + email are filled, then calls inviteTeamMember', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Invite Teammate'))
    fireEvent.click(screen.getByText('Invite Teammate'))

    await waitFor(() => screen.getByPlaceholderText('Riya Sharma'))

    const sendBtn = screen.getByRole('button', { name: 'Send invitation' })
    expect(sendBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Riya Sharma'), { target: { value: 'Neha Singh' } })
    fireEvent.change(screen.getByPlaceholderText('riya@firm.com'), { target: { value: 'neha@firm.com' } })

    expect(sendBtn).not.toBeDisabled()
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(teamApi.inviteTeamMember).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Neha Singh', email: 'neha@firm.com' })
      )
    })
  })
})
