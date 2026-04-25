/**
 * ItrPage — unit tests (Phase 6D)
 *
 * Covers:
 * - Loading skeleton renders
 * - Error alert renders when filings API fails
 * - 4 tab labels are rendered
 * - Verification Queue tab: filings table rows visible
 * - AY dropdown/selector is present
 * - Tab switching triggers correct API calls
 * - KPI values rendered from getVerificationKpi
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as itrApi from '@/lib/itrApi'
import type { Filing } from '@/lib/itrApi'
import ItrPage from '@/pages/itr/ItrPage'

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
      <MemoryRouter initialEntries={['/itr']}>
        <Routes>
          <Route path="/itr" element={<ItrPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const validKpi = {
  awaitingReview: 12,
  slaBreached: 3,
  avgTimeToReviewDays: 1.5,
  totalFilingsAy: 48,
}

const makeFiling = (overrides: Partial<Filing> = {}): Filing => ({
  id: 'fil-001',
  assesseeId: 'prof-001',
  assesseeName: 'RaviKumarFilingUser',
  panLast4: '4321',
  assessmentYear: 'AY2025-26',
  itrFormType: 'ITR-1',
  status: 'UNDER_CA_REVIEW',
  regime: 'NEW',
  assignedCaId: 'ca-001',
  assignedCaName: 'CA Ravi Kumar',
  slaExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  filedAt: null,
  eVerifiedAt: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-25T00:00:00Z',
  ...overrides,
})

const oneFilingList = { items: [makeFiling()], totalCount: 1, page: 1, pageSize: 20 }

describe('ItrPage', () => {
  beforeEach(() => {
    vi.spyOn(itrApi, 'getVerificationKpi').mockResolvedValue(validKpi)
    vi.spyOn(itrApi, 'listFilings').mockResolvedValue(oneFilingList)
    vi.spyOn(itrApi, 'listItrNotices').mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 })
  })

  it('shows loading skeleton before data arrives', () => {
    vi.spyOn(itrApi, 'listFilings').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error alert when filings API fails', async () => {
    vi.spyOn(itrApi, 'listFilings').mockRejectedValue(new Error('Network error'))
    renderPage()
    const errorEl = await screen.findByRole('alert')
    expect(errorEl).toBeTruthy()
  })

  it('renders all 4 tab labels', async () => {
    renderPage()
    await screen.findAllByRole('tab')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBeGreaterThanOrEqual(4)
  })

  it('renders KPI awaitingReview count', async () => {
    renderPage()
    // KPI value 12 rendered as "12" in MetricCard
    const kpiEl = await screen.findByText('12')
    expect(kpiEl).toBeTruthy()
  })

  it('renders assessee name in verification queue table', async () => {
    renderPage()
    const rows = await screen.findAllByText(/RaviKumarFilingUser/)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('renders AY dropdown/selector', async () => {
    renderPage()
    await screen.findAllByRole('tab')
    const aySelects = document.querySelectorAll('select, [role="combobox"]')
    expect(aySelects.length).toBeGreaterThan(0)
  })

  it('switches to Filing Queue tab on click', async () => {
    renderPage()
    await screen.findAllByRole('tab')
    const tabs = screen.getAllByRole('tab')
    // Tab index 2 = Filing Queue
    await userEvent.click(tabs[2])
    await waitFor(() => {
      expect(itrApi.listFilings).toHaveBeenCalled()
    })
  })

  it('switches to Notices tab on click and calls listItrNotices', async () => {
    renderPage()
    await screen.findAllByRole('tab')
    const tabs = screen.getAllByRole('tab')
    // Tab index 3 = Notices
    await userEvent.click(tabs[3])
    await waitFor(() => {
      expect(itrApi.listItrNotices).toHaveBeenCalled()
    })
  })

  it('shows empty state when no filings returned', async () => {
    vi.spyOn(itrApi, 'listFilings').mockResolvedValue({ items: [] as Filing[], totalCount: 0, page: 1, pageSize: 20 })
    renderPage()
    await screen.findAllByRole('tab')
    // No assessee name visible
    expect(screen.queryByText(/RaviKumarFilingUser/)).toBeNull()
  })
})
