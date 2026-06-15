/**
 * DeviceApprovalQueue — component tests (GAP-047 / BUG-W7-06)
 *
 * Covers:
 * - Happy path: renders list of pending approval requests
 * - Empty state: shows "No pending requests" when list is empty
 * - Approve flow: clicking Approve opens modal, confirm calls approveDevice
 * - Deny flow: clicking Deny opens modal, entering reason and confirming calls denyDevice
 * - Expired requests: shown with Expired badge, actions disabled
 * - Error state: shows load error message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as devicesApi from '@/lib/devicesApi'

vi.mock('@/lib/devicesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof devicesApi>()
  return {
    ...actual,
    getPendingApprovals: vi.fn(),
    approveDevice: vi.fn(),
    denyDevice: vi.fn(),
    getDevices: vi.fn(),
  }
})

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

import { DeviceApprovalQueue } from '@/pages/settings/sections/DeviceApprovalQueue'

const mockedApi = devicesApi as unknown as {
  getPendingApprovals: ReturnType<typeof vi.fn>
  approveDevice: ReturnType<typeof vi.fn>
  denyDevice: ReturnType<typeof vi.fn>
  getDevices: ReturnType<typeof vi.fn>
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FUTURE_DATE = new Date(Date.now() + 8 * 60 * 1000).toISOString() // 8 min from now
const PAST_DATE = new Date(Date.now() - 2 * 60 * 1000).toISOString()   // 2 min ago

const PENDING_REQUEST: devicesApi.DeviceApprovalDto = {
  approvalRequestId: 'req-uuid-1',
  newDeviceId: 'dev-uuid-1',
  newDeviceIdentifier: 'abc123xyz',
  newDeviceName: 'Rahul iPhone 14',
  newDevicePlatform: 'iOS',
  expiresAt: FUTURE_DATE,
  createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
}

const EXPIRED_REQUEST: devicesApi.DeviceApprovalDto = {
  approvalRequestId: 'req-uuid-2',
  newDeviceId: 'dev-uuid-2',
  newDeviceIdentifier: 'def456uvw',
  newDeviceName: 'Old Pixel 7',
  newDevicePlatform: 'Android',
  expiresAt: PAST_DATE,
  createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
}

const REVIEWER_DEVICE: devicesApi.Device = {
  id: 'reviewer-dev-uuid-1',
  deviceId: 'reviewer-device-id',
  deviceName: 'Admin MacBook',
  platform: 'Web',
  isActive: true,
  boundAt: new Date(Date.now() - 86400000).toISOString(),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderQueue() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <DeviceApprovalQueue />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.getDevices.mockResolvedValue([REVIEWER_DEVICE])
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DeviceApprovalQueue', () => {
  describe('happy path — pending request', () => {
    beforeEach(() => {
      mockedApi.getPendingApprovals.mockResolvedValue({ pending: [PENDING_REQUEST] })
    })

    it('renders device name and platform', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      expect(screen.getByText('iOS')).toBeTruthy()
    })

    it('shows Pending badge for non-expired request', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      // Badge text is exactly "Pending" in a <span>; getAllByText to handle subtitle also containing "Pending"
      const pendingElements = screen.getAllByText(/^pending$/i)
      expect(pendingElements.length).toBeGreaterThan(0)
    })

    it('renders Approve and Deny action buttons', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /deny/i })).toBeTruthy()
    })
  })

  describe('empty state', () => {
    it('shows empty state when no pending requests', async () => {
      mockedApi.getPendingApprovals.mockResolvedValue({ pending: [] })
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText(/no pending requests/i)).toBeTruthy()
      })
    })
  })

  describe('error state', () => {
    it('shows load error when API fails', async () => {
      mockedApi.getPendingApprovals.mockRejectedValue(new Error('Network error'))
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText(/could not load pending/i)).toBeTruthy()
      })
    })
  })

  describe('expired request', () => {
    it('shows Expired badge for expired requests', async () => {
      mockedApi.getPendingApprovals.mockResolvedValue({ pending: [EXPIRED_REQUEST] })
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Old Pixel 7')).toBeTruthy()
      })
      // Badge text is exactly "Expired"; there may be multiple elements (badge + timestamp label)
      const expiredElements = screen.getAllByText(/^expired$/i)
      expect(expiredElements.length).toBeGreaterThan(0)
    })

    it('disables approve and deny buttons for expired request', async () => {
      mockedApi.getPendingApprovals.mockResolvedValue({ pending: [EXPIRED_REQUEST] })
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Old Pixel 7')).toBeTruthy()
      })
      const approveBtn = screen.getByRole('button', { name: /approve/i })
      const denyBtn = screen.getByRole('button', { name: /deny/i })
      expect(approveBtn).toHaveProperty('disabled', true)
      expect(denyBtn).toHaveProperty('disabled', true)
    })
  })

  describe('approve flow', () => {
    beforeEach(() => {
      mockedApi.getPendingApprovals.mockResolvedValue({ pending: [PENDING_REQUEST] })
      mockedApi.approveDevice.mockResolvedValue({
        approvalRequestId: 'req-uuid-1',
        status: 'Approved',
        reviewedAt: new Date().toISOString(),
      })
    })

    it('opens approve modal when Approve is clicked', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: /approve Rahul iPhone 14/i }))
      await waitFor(() => {
        expect(screen.getByText(/approve device login/i)).toBeTruthy()
      })
    })

    it('calls approveDevice with correct ids on confirm', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: /approve Rahul iPhone 14/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve sign-in/i })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: /approve sign-in/i }))

      await waitFor(() => {
        expect(mockedApi.approveDevice).toHaveBeenCalledWith(
          'req-uuid-1',
          'reviewer-dev-uuid-1',
        )
      })
    })

    it('closes modal on Cancel', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: /approve Rahul iPhone 14/i }))
      await waitFor(() => {
        expect(screen.getByText(/approve device login/i)).toBeTruthy()
      })
      // Find cancel button inside modal
      const cancelBtn = screen.getAllByRole('button').find(
        b => b.textContent?.toLowerCase() === 'cancel',
      )
      expect(cancelBtn).toBeTruthy()
      fireEvent.click(cancelBtn!)
      await waitFor(() => {
        expect(screen.queryByText(/approve device login/i)).toBeFalsy()
      })
    })
  })

  describe('deny flow', () => {
    beforeEach(() => {
      mockedApi.getPendingApprovals.mockResolvedValue({ pending: [PENDING_REQUEST] })
      mockedApi.denyDevice.mockResolvedValue({
        approvalRequestId: 'req-uuid-1',
        status: 'Denied',
        reviewedAt: new Date().toISOString(),
        enforced: false,
      })
    })

    it('opens deny modal when Deny is clicked', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: /deny Rahul iPhone 14/i }))
      await waitFor(() => {
        expect(screen.getByText(/deny device login/i)).toBeTruthy()
      })
    })

    it('calls denyDevice without reason when reason is empty', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: /deny Rahul iPhone 14/i }))
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /deny and block/i })).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: /deny and block/i }))
      await waitFor(() => {
        expect(mockedApi.denyDevice).toHaveBeenCalledWith(
          'req-uuid-1',
          'reviewer-dev-uuid-1',
          undefined, // no reason
        )
      })
    })

    it('calls denyDevice with reason when reason is provided', async () => {
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: /deny Rahul iPhone 14/i }))
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/unrecognised device/i)).toBeTruthy()
      })
      fireEvent.change(screen.getByPlaceholderText(/unrecognised device/i), {
        target: { value: 'Not my device' },
      })
      fireEvent.click(screen.getByRole('button', { name: /deny and block/i }))
      await waitFor(() => {
        expect(mockedApi.denyDevice).toHaveBeenCalledWith(
          'req-uuid-1',
          'reviewer-dev-uuid-1',
          'Not my device',
        )
      })
    })
  })

  describe('multiple requests', () => {
    it('renders both pending and expired requests', async () => {
      mockedApi.getPendingApprovals.mockResolvedValue({
        pending: [PENDING_REQUEST, EXPIRED_REQUEST],
      })
      renderQueue()
      await waitFor(() => {
        expect(screen.getByText('Rahul iPhone 14')).toBeTruthy()
        expect(screen.getByText('Old Pixel 7')).toBeTruthy()
      })
    })
  })
})
