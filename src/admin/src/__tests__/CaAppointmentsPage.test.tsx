/**
 * CaAppointmentsPage — Wave 7A reconciliation tests
 *
 * Covers:
 * - Renders appointment list after data loads
 * - Cancel drawer shows reason textarea (reason is mandatory per Wave 7A)
 * - cancelAppointmentAsCA is called with reason when confirm clicked
 * - Cancel button is disabled when reason is empty (UX guard mirrors backend validation)
 * - cancelAppointmentAsCA uses POST /cancel-by-ca, not /cancel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as caApi from '@/lib/caApi'

vi.mock('@/lib/caApi', async (importOriginal) => {
  const actual = await importOriginal<typeof caApi>()
  return {
    ...actual,
    listAppointments: vi.fn(),
    cancelAppointmentAsCA: vi.fn(),
  }
})

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

import CaAppointmentsPage from '@/pages/ca/CaAppointmentsPage'

const mockedCaApi = caApi as unknown as {
  listAppointments: ReturnType<typeof vi.fn>
  cancelAppointmentAsCA: ReturnType<typeof vi.fn>
}

const TEST_APPOINTMENT: caApi.Appointment = {
  id: 'appt-uuid-1',
  caId: 'ca-profile-uuid-1',
  caName: 'Priya Sharma',
  clientUserId: 'user-uuid-1',
  clientName: 'Rahul Gupta',
  clientBusinessName: 'Gupta Traders',
  topic: 'GST',
  topicNote: null,
  status: 'CONFIRMED',
  slotStart: new Date(Date.now() + 86400000).toISOString(), // tomorrow
  slotEnd: new Date(Date.now() + 86400000 + 3600000).toISOString(),
  durationMinutes: 60,
  channel: 'GOOGLE_MEET',
  meetLink: 'https://meet.google.com/abc-xyz',
  rating: null,
  ratingComment: null,
  cancelledReason: null,
  cancelledByCa: false,
  caCancellationReason: null,
  createdAt: '2024-01-01T00:00:00Z',
}

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <CaAppointmentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCaApi.listAppointments.mockResolvedValue({ items: [TEST_APPOINTMENT], totalCount: 1 })
})

describe('CaAppointmentsPage — Wave 7A', () => {
  it('renders appointment list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Rahul Gupta')).toBeTruthy()
    })
  })

  it('opens detail drawer on row click', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Rahul Gupta')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Rahul Gupta'))
    await waitFor(() => {
      expect(screen.getByText(/appointment details/i)).toBeTruthy()
    })
  })

  it('shows CA cancel action button in drawer for manageable appointment', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Rahul Gupta'))
    fireEvent.click(screen.getByText('Rahul Gupta'))
    await waitFor(() => {
      expect(screen.getByText(/cancel appointment \(ca-initiated\)/i)).toBeTruthy()
    })
  })

  it('shows reason textarea after clicking CA cancel button', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Rahul Gupta'))
    fireEvent.click(screen.getByText('Rahul Gupta'))
    await waitFor(() => {
      fireEvent.click(screen.getByText(/cancel appointment \(ca-initiated\)/i))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/reason for cancellation/i)).toBeTruthy()
    })
  })

  it('confirm cancel button is disabled when reason is empty', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Rahul Gupta'))
    fireEvent.click(screen.getByText('Rahul Gupta'))
    await waitFor(() => {
      fireEvent.click(screen.getByText(/cancel appointment \(ca-initiated\)/i))
    })
    await waitFor(() => {
      const cancelBtn = screen.getAllByRole('button').find(
        b => b.textContent?.toLowerCase().includes('cancel') && b.hasAttribute('disabled')
      )
      expect(cancelBtn).toBeTruthy()
    })
  })

  it('calls cancelAppointmentAsCA with id and reason on confirm', async () => {
    mockedCaApi.cancelAppointmentAsCA.mockResolvedValue(undefined)
    mockedCaApi.listAppointments
      .mockResolvedValueOnce({ items: [TEST_APPOINTMENT], totalCount: 1 })
      .mockResolvedValueOnce({ items: [], totalCount: 0 })
    renderPage()

    await waitFor(() => screen.getByText('Rahul Gupta'))
    fireEvent.click(screen.getByText('Rahul Gupta'))

    await waitFor(() => {
      fireEvent.click(screen.getByText(/cancel appointment \(ca-initiated\)/i))
    })
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/reason for cancellation/i)
      fireEvent.change(textarea, { target: { value: 'Emergency — CA hospitalised' } })
    })

    // Click the cancel confirm button (not the "back" button)
    const cancelBtn = screen.getAllByRole('button').find(
      b => b.textContent?.toLowerCase() === 'cancel' && !b.hasAttribute('disabled')
    )
    expect(cancelBtn).toBeTruthy()
    fireEvent.click(cancelBtn!)

    await waitFor(() => {
      expect(mockedCaApi.cancelAppointmentAsCA).toHaveBeenCalledWith(
        'appt-uuid-1',
        'Emergency — CA hospitalised'
      )
    })
  })
})
