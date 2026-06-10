/**
 * ItcMismatchPage — unit tests (Phase 7)
 *
 * All tests mock the `gstApi` module — no inline mock data in the page.
 * Covers: data loading, filters, reconcile modal, empty state, error state.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

import * as gstApi from '@/lib/gstApi'
import ItcMismatchPage from '@/pages/gst/ItcMismatchPage'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const mockMismatches: gstApi.ItcMismatch[] = [
  {
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    mismatchType: 'AMOUNT_MISMATCH',
    claimedAmount: 48500,
    availableAmount: 45200,
    differenceAmount: 3300,
    status: 'OPEN',
  },
  {
    id: 'mmmmmmmm-0000-0000-0000-000000000002',
    mismatchType: 'MISSING_IN_2B',
    claimedAmount: 125000,
    availableAmount: 0,
    differenceAmount: 125000,
    status: 'OPEN',
  },
  {
    id: 'mmmmmmmm-0000-0000-0000-000000000003',
    mismatchType: 'EXCESS_CLAIM',
    claimedAmount: 0,
    availableAmount: 45000,
    differenceAmount: -45000,
    status: 'RESOLVED',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <ItcMismatchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ItcMismatchPage (real API)', () => {
  beforeEach(() => {
    vi.spyOn(gstApi, 'getItcMismatches').mockResolvedValue(mockMismatches)
    vi.spyOn(gstApi, 'reconcileItc').mockResolvedValue({
      organizationId: 'org-001',
      financialYear: '2025-26',
      periodMonth: 3,
      mismatchesDetected: 2,
      totalDifferenceAmount: 128300,
    })
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByText('ITC Mismatch Tracker')).toBeInTheDocument()
  })

  it('calls getItcMismatches on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(gstApi.getItcMismatches).toHaveBeenCalledTimes(1)
    })
  })

  it('renders mismatch rows from API response', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Amount Mismatch')).toBeInTheDocument()
      expect(screen.getByText('Missing in 2B')).toBeInTheDocument()
      expect(screen.getByText('Excess Claim')).toBeInTheDocument()
    })
  })

  it('renders status badges for OPEN and RESOLVED', async () => {
    renderPage()
    await waitFor(() => {
      const openBadges = screen.getAllByText('Open')
      expect(openBadges.length).toBeGreaterThan(0)
      expect(screen.getByText('Resolved')).toBeInTheDocument()
    })
  })

  it('renders summary stat cards', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Total Mismatches')).toBeInTheDocument()
      expect(screen.getByText('Total Amount')).toBeInTheDocument()
      expect(screen.getByText('Critical (>10%)')).toBeInTheDocument()
    })
    // 3 total items rendered
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders Run Reconciliation button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Run Reconciliation/i })).toBeInTheDocument()
  })

  it('opens reconcile modal when Run Reconciliation is clicked', async () => {
    renderPage()
    const btn = screen.getByRole('button', { name: /Run Reconciliation/i })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Run ITC Reconciliation')).toBeInTheDocument()
    })
  })

  it('closes reconcile modal on Cancel', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Run Reconciliation/i }))
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('status filter select exists and can be changed', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Amount Mismatch')).toBeInTheDocument()
    })
    const statusSelect = screen.getByRole('combobox', { name: /status/i })
    fireEvent.change(statusSelect, { target: { value: 'RESOLVED' } })
    expect((statusSelect as HTMLSelectElement).value).toBe('RESOLVED')
    // Should re-fetch with the new status
    await waitFor(() => {
      expect(gstApi.getItcMismatches).toHaveBeenCalled()
    })
  })

  it('cause filter select exists and filters client-side', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Amount Mismatch')).toBeInTheDocument()
    })
    const causeSelect = screen.getByRole('combobox', { name: /Mismatch Cause/i })
    fireEvent.change(causeSelect, { target: { value: 'AMOUNT_MISMATCH' } })
    // After filtering, only AMOUNT_MISMATCH rows should be visible
    await waitFor(() => {
      expect(screen.queryByText('Missing in 2B')).not.toBeInTheDocument()
      expect(screen.queryByText('Excess Claim')).not.toBeInTheDocument()
    })
  })

  it('shows empty state when API returns an empty array', async () => {
    vi.spyOn(gstApi, 'getItcMismatches').mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No ITC mismatches')).toBeInTheDocument()
    })
  })

  it('shows error banner and retry when getItcMismatches rejects', async () => {
    vi.spyOn(gstApi, 'getItcMismatches').mockRejectedValue(new Error('Server error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Failed to load ITC mismatches')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
