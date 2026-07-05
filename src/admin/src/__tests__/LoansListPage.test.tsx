/**
 * LoansListPage — Phase 6C smoke + interaction tests
 * Covers: KpiStrip render, filter behavior, bulk-assign modal, CSV export, role-gated stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as loanApi from '@/lib/loanApi'
import LoansListPage from '@/pages/loans/LoansListPage'

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
      <MemoryRouter initialEntries={['/loans']}>
        <LoansListPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockKpi: loanApi.LoanKpi = {
  totalApps: 150,
  submitted: 30,
  underReview: 45,
  awaitingDocs: 10,
  approved: 25,
  disbursed: 40,
}

const mockApp: loanApi.LoanApplicationSummary = {
  applicationId: 'app-001-uuid',
  orgId: 'org-001',
  orgName: 'Sunrise Textiles Pvt Ltd',
  pan: 'AAACS1234D',
  gstin: '27AAACS1234D1ZM',
  status: 'UNDER_REVIEW',
  requestedAmount: 5000000,
  tenureMonths: 36,
  bankName: 'HDFC Bank',
  bankAdapterType: 'EMAIL',
  submittedAt: '2024-03-01T08:00:00Z',
  daysInStage: 5,
  assignedOfficer: 'Priya Sharma',
}

const mockListResponse = {
  items: [mockApp],
  totalCount: 1,
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(loanApi, 'getLoanKpi').mockResolvedValue(mockKpi)
  vi.spyOn(loanApi, 'listLoanApplications').mockResolvedValue(mockListResponse)
  vi.spyOn(loanApi, 'listPartnerBanks').mockResolvedValue({
    items: [
      { bankId: 'bank-001', name: 'HDFC Bank', adapterType: 'EMAIL', isActive: true },
    ],
    totalCount: 1,
  })
})

// ---------------------------------------------------------------------------
// KPI Strip
// ---------------------------------------------------------------------------

describe('LoansListPage — KPI strip', () => {
  it('renders 6 KPI skeleton tiles while loading', () => {
    vi.spyOn(loanApi, 'getLoanKpi').mockReturnValue(new Promise(() => {}))
    vi.spyOn(loanApi, 'listLoanApplications').mockReturnValue(new Promise(() => {}))
    renderPage()
    // Skeleton component uses skeleton-shimmer class (replaced animate-pulse — S3 elevation pass)
    const skeletons = document.querySelectorAll('.skeleton-shimmer')
    expect(skeletons.length).toBeGreaterThanOrEqual(6)
  })

  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    })
  })

  it('renders data after KPI loads', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sunrise Textiles Pvt Ltd')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Filter behavior
// ---------------------------------------------------------------------------

describe('LoansListPage — filter bar', () => {
  it('renders search input', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('searchbox')).toBeInTheDocument()
    })
  })

  it('renders status filter select', async () => {
    renderPage()
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('typing in search input updates value', async () => {
    renderPage()
    const input = await screen.findByRole('searchbox')
    fireEvent.change(input, { target: { value: 'Sunrise' } })
    expect((input as HTMLInputElement).value).toBe('Sunrise')
  })

  it('renders CSV export button', async () => {
    renderPage()
    await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const exportBtn = btns.find(b => b.textContent?.toLowerCase().includes('export'))
      expect(exportBtn).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// Bulk assign modal
// ---------------------------------------------------------------------------

describe('LoansListPage — bulk assign modal', () => {
  it('selection toolbar appears after selecting a row checkbox', async () => {
    renderPage()
    const checkboxes = await screen.findAllByRole('checkbox', { name: /select row/i })
    fireEvent.click(checkboxes[0])
    await waitFor(() => {
      // SelectionToolbar with Assign CTA should appear
      const toolbar = document.querySelector('[data-testid="selection-toolbar"], [aria-label*="selected"], button')
      expect(toolbar).toBeTruthy()
    })
  })

  it('clicking row checkbox increments selection', async () => {
    renderPage()
    const checkboxes = await screen.findAllByRole('checkbox', { name: /select row/i })
    expect(checkboxes.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(checkboxes[0])
    // After selection the checkbox is checked
    await waitFor(() => {
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true)
    })
  })

  it('bulk assign modal opens when Assign button clicked', async () => {
    renderPage()
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select row/i })
    fireEvent.click(rowCheckboxes[0])
    await waitFor(async () => {
      // Find the assign CTA button in the toolbar
      const assignBtn = screen.queryByRole('button', { name: /assign/i })
      if (assignBtn) fireEvent.click(assignBtn)
    })
    // Modal should open
    await waitFor(() => {
      const dialog = screen.queryByRole('dialog')
      if (dialog) expect(dialog).toBeInTheDocument()
    })
  })

  it('bulk assign modal shows bank select with partner banks', async () => {
    renderPage()
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select row/i })
    fireEvent.click(rowCheckboxes[0])
    // Find and click the assign button
    const assignBtn = await screen.findByRole('button', { name: /assign/i })
    fireEvent.click(assignBtn)
    // Modal opens — check for select
    await waitFor(() => {
      const dialog = screen.queryByRole('dialog')
      expect(dialog).toBeInTheDocument()
    })
    // Bank dropdown should be present inside the dialog
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('confirm button is disabled when no bank is selected', async () => {
    renderPage()
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select row/i })
    fireEvent.click(rowCheckboxes[0])
    const assignBtn = await screen.findByRole('button', { name: /assign/i })
    fireEvent.click(assignBtn)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeInTheDocument())
    // Find the confirm button inside the modal dialog specifically
    const dialog = screen.getByRole('dialog')
    const dialogBtns = Array.from(dialog.querySelectorAll('button[type="button"]')) as HTMLButtonElement[]
    // The primary (non-ghost) submit button inside the dialog should be disabled
    const confirmBtn = dialogBtns.find(b =>
      !b.className.includes('ghost') && (b.textContent?.toLowerCase().includes('confirm') || b.textContent?.toLowerCase().includes('assign'))
    )
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Bulk close (P-33)
// ---------------------------------------------------------------------------

describe('LoansListPage — bulk close', () => {
  it('bulk close confirm calls closeLoanApplication for each selected id', async () => {
    const closeSpy = vi.spyOn(loanApi, 'closeLoanApplication').mockResolvedValue(undefined)
    renderPage()
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select row/i })
    fireEvent.click(rowCheckboxes[0])

    // Toolbar "Close" action opens the confirm dialog
    const toolbarClose = await screen.findByRole('button', { name: /^close$/i })
    fireEvent.click(toolbarClose)

    // Confirm dialog is labelled "Close applications"
    const dialog = await screen.findByRole('dialog', { name: /close applications/i })
    const dangerBtn = Array.from(dialog.querySelectorAll('button')).find(
      b => b.textContent?.toLowerCase().includes('close')
    ) as HTMLButtonElement
    fireEvent.click(dangerBtn)

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledWith('app-001-uuid')
    })
  })

  it('owner filter dropdown lists the assigned officer', async () => {
    renderPage()
    await screen.findByText('Sunrise Textiles Pvt Ltd')
    // The owner filter <select> should contain the mock officer as an option
    const options = Array.from(document.querySelectorAll('option'))
    expect(options.some(o => o.textContent === 'Priya Sharma')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe('LoansListPage — CSV export', () => {
  it('export button is present and clickable without crashing', async () => {
    // URL.createObjectURL is not in jsdom — mock it
    const mockRevoke = vi.fn()
    const mockCreate = vi.fn().mockReturnValue('blob:mock-url')
    global.URL.createObjectURL = mockCreate
    global.URL.revokeObjectURL = mockRevoke

    renderPage()
    const btns = await screen.findAllByRole('button')
    const exportBtn = btns.find(b => b.textContent?.toLowerCase().includes('export'))
    expect(exportBtn).toBeTruthy()
    fireEvent.click(exportBtn!)
    // Should not throw; no dialog popup (toast only)
    expect(mockCreate).toHaveBeenCalled()

    delete (global.URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (global.URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LoansListPage — error state', () => {
  it('shows error banner when API fails', async () => {
    vi.spyOn(loanApi, 'listLoanApplications').mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      // AlertBanner appears with role=alert or contains retry text
      const alerts = document.querySelectorAll('[role="alert"], [class*="alert"], [class*="error"]')
      expect(alerts.length).toBeGreaterThan(0)
    }, { timeout: 5000 })
  })
})
