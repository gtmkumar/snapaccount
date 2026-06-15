/**
 * TeamPage Staff/Workload/KPI tabs — smoke tests (design Screens 87/89/90).
 * Verifies the new tabs mount and render their data spine on click.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as teamApi from '@/lib/teamApi'
import * as staffApi from '@/lib/staffApi'
import * as callbackApi from '@/lib/callbackApi'
import * as userAdminApi from '@/lib/userAdminApi'
import TeamPage from '@/pages/team/TeamPage'

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// Grant the manage permission so the Staff tab renders Edit/Deactivate actions.
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasServerPermission: () => true,
    canAccess: () => true,
    hasPermission: () => true,
    serverPermissions: ['platform.admins.invite'],
  }),
}))

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
  {
    userId: 'u2', name: 'Arjun Kumar', email: 'arjun@snap.in', role: 'OPERATIONS_MANAGER',
    roleDisplayName: 'Ops Manager', status: 'active', joinedAt: null, lastActiveAt: null,
    queues: { gst: 0, itr: 0, chat: 3, callbacks: 0 },
    completedByQueue: { gst: 0, itr: 0, chat: 9, callbacks: 0 },
    totalAssigned: 3, totalCompleted: 9,
  },
]

const mockKpi = {
  open: 42, avgTtrSeconds: 8040, slaCompliance: 94.3, completed: 128,
  deltas: { open: 0, avgTtrSeconds: 0, slaCompliance: 0, completed: 0 },
  statusDistribution: [], dailyVolume: [], ttrHistogram: [], categoryMix: [],
  teamPerformance: [], slaBreaches: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(teamApi, 'listTeamMembers').mockResolvedValue({ items: [], totalCount: 0 })
  vi.spyOn(teamApi, 'listPendingInvites').mockResolvedValue([])
  vi.spyOn(staffApi, 'getStaffWorkloadGrid').mockResolvedValue({ rows: gridRows, errors: {} })
  vi.spyOn(userAdminApi, 'setAdminUserActive').mockResolvedValue(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(callbackApi, 'getCallbackKpi').mockResolvedValue(mockKpi as any)
})

describe('TeamPage — Staff tab (Screen 87)', () => {
  it('renders staff roster with queue totals on click', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Staff'))

    await waitFor(() => {
      expect(screen.getByText('Riya Sharma')).toBeInTheDocument()
      expect(screen.getByText('Arjun Kumar')).toBeInTheDocument()
    })
    // Current-queue badge shows the total assigned (41 for Riya).
    expect(screen.getByText('41')).toBeInTheDocument()
  })

  it('exposes View and Edit role actions per row', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Staff'))
    await screen.findByText('Riya Sharma')

    expect(screen.getAllByLabelText('View profile').length).toBe(2)
    expect(screen.getAllByLabelText('Edit role').length).toBe(2)
  })

  it('Deactivate action confirms and calls setAdminUserActive(false)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Staff'))
    await screen.findByText('Riya Sharma')

    // Both staff are active → two Deactivate buttons; click the first (Riya).
    fireEvent.click(screen.getAllByLabelText('Deactivate')[0]!)

    // Confirm dialog → click the confirming Deactivate button (scoped to the dialog,
    // since the row icon-button shares the "Deactivate" accessible name).
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      expect(userAdminApi.setAdminUserActive).toHaveBeenCalledWith('u1', false)
    })
  })
})

describe('TeamPage — Workload tab (Screen 89)', () => {
  it('renders the workload grid and flags overloaded staff', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Workload'))

    await waitFor(() => {
      // Column headers for the four assignee-tracked queues.
      expect(screen.getByText('GST')).toBeInTheDocument()
      expect(screen.getByText('ITR')).toBeInTheDocument()
      expect(screen.getByText('Callbacks')).toBeInTheDocument()
    })
    // Riya's ITR queue (35) breaches the overload threshold → capacity alert.
    // Multiple elements may match: the capacity banner and the legend label.
    expect(screen.getAllByText(/overloaded/i).length).toBeGreaterThanOrEqual(1)
    // Grid is exportable.
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })
})

describe('TeamPage — KPI tab (Screen 90)', () => {
  it('renders callback SLA and marks untracked metrics', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('KPIs'))

    await waitFor(() => {
      expect(screen.getByText('Callback Response SLA')).toBeInTheDocument()
      expect(screen.getByText('94.3%')).toBeInTheDocument()
    })
    // Untracked SLA cards render the honest placeholder.
    expect(screen.getAllByText('Not tracked yet').length).toBeGreaterThan(0)
    // Staff performance table is exportable.
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })
})
