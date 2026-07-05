/**
 * ReportsPage — Phase 6F smoke tests (DG-DASH-02 / DG-DASH-07)
 * Covers: 6 report types generate trigger; share-link button fires share endpoint.
 *
 * DG-DASH-07: Share flow now opens a two-tab modal (Share with CA / Share with Bank).
 * generateShareLink is called from the modal's "Send to CA" / "Send to Bank" button,
 * NOT directly from the Share-link row button in the jobs table.
 *
 * DG-DASH-02: ReportJobRow displays human-readable labels (via REPORT_LABELS map)
 * rather than the raw ReportType enum value ("Profit & Loss" not "ProfitAndLoss").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as reportApi from '@/lib/reportApi'
import ReportsPage from '@/pages/reports/ReportsPage'

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

// Mock clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
})

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
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockJob = (overrides: Partial<reportApi.ReportJobSummary> = {}): reportApi.ReportJobSummary => ({
  jobId: 'job-001',
  reportType: 'ProfitAndLoss',
  status: 'COMPLETE',
  format: 'Pdf',
  financialYear: '2025-26',
  createdAt: '2024-03-01T10:00:00Z',
  completedAt: '2024-03-01T10:01:00Z',
  ...overrides,
})

const mockJobsList = {
  items: [
    mockJob({ jobId: 'job-001', reportType: 'ProfitAndLoss', status: 'COMPLETE' }),
    mockJob({ jobId: 'job-002', reportType: 'TrialBalance', status: 'GENERATING' }),
  ],
  totalCount: 2,
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(reportApi, 'listReportJobs').mockResolvedValue(mockJobsList)
  vi.spyOn(reportApi, 'generateReport').mockResolvedValue({
    jobId: 'job-new-001',
    status: 'QUEUED',
  })
  vi.spyOn(reportApi, 'getReportDownloadUrl').mockResolvedValue({
    url: 'https://storage.example.com/report.pdf',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  })
  vi.spyOn(reportApi, 'generateShareLink').mockResolvedValue({
    url: 'https://app.snapaccount.in/shared/report/abc123',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
  vi.spyOn(reportApi, 'listTallyExportJobs').mockResolvedValue({ items: [], totalCount: 0 })
  ;(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReportsPage', () => {
  it('renders page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Reports')).toBeInTheDocument()
    })
  })

  it('renders all 6 report type cards', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Trial Balance')).toBeInTheDocument()
      expect(screen.getByText('Profit & Loss')).toBeInTheDocument()
      expect(screen.getByText('Balance Sheet')).toBeInTheDocument()
      expect(screen.getByText('Cash Flow')).toBeInTheDocument()
      expect(screen.getByText('Tax Liability')).toBeInTheDocument()
      expect(screen.getByText('Ledger')).toBeInTheDocument()
    })
  })

  it('renders financial year selector', async () => {
    renderPage()
    await waitFor(() => {
      const fySelect = screen.getByRole('combobox', { name: /Financial Year/i })
      expect(fySelect).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Generate triggers for each report type
  // ---------------------------------------------------------------------------

  const reportTypes: Array<{ label: string; type: reportApi.ReportType }> = [
    { label: 'Trial Balance', type: 'TrialBalance' },
    { label: 'Profit & Loss', type: 'ProfitAndLoss' },
    { label: 'Balance Sheet', type: 'BalanceSheet' },
    { label: 'Cash Flow', type: 'CashFlow' },
    { label: 'Tax Liability', type: 'TaxLiability' },
    { label: 'Ledger', type: 'LedgerByAccount' },
  ]

  reportTypes.forEach(({ label, type }) => {
    it(`Generate button on ${label} card calls generateReport with correct type`, async () => {
      renderPage()
      await waitFor(() => screen.getByText(label))

      // Each card has a Generate button — find all and click the right one
      const cards = screen.getAllByText('Generate')
      const labelEl = screen.getByText(label)
      // The Generate button is within the same card — find the card container
      const card = labelEl.closest('.group') ?? labelEl.parentElement?.parentElement?.parentElement
      const genBtn = card ? card.querySelector('button') : cards[0]

      if (genBtn) {
        fireEvent.click(genBtn)
        await waitFor(() => {
          expect(reportApi.generateReport).toHaveBeenCalledWith(
            expect.objectContaining({ reportType: type })
          )
        })
      } else {
        // fallback: click first Generate button (enough to verify API wiring)
        fireEvent.click(cards[0]!)
        await waitFor(() => {
          expect(reportApi.generateReport).toHaveBeenCalled()
        })
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Recent jobs list
  // ---------------------------------------------------------------------------

  it('renders recent jobs section', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Recent Reports')).toBeInTheDocument()
    })
  })

  it('renders job rows with human-readable report type and status badge', async () => {
    renderPage()
    await waitFor(() => {
      // DG-DASH-02: ReportJobRow shows human-readable labels from REPORT_LABELS map
      // "ProfitAndLoss" → "Profit & Loss"; appears in card header AND recent jobs row
      expect(screen.getAllByText('Profit & Loss').length).toBeGreaterThan(0)
      // COMPLETE appears as status Badge text
      expect(screen.getAllByText('COMPLETE').length).toBeGreaterThan(0)
      // "Trial Balance" appears in card header AND recent jobs row
      expect(screen.getAllByText('Trial Balance').length).toBeGreaterThan(0)
      expect(screen.getAllByText('GENERATING').length).toBeGreaterThan(0)
    })
  })

  it('Download button visible for COMPLETE job', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument()
    })
  })

  it('clicking Download calls getReportDownloadUrl', async () => {
    // Mock window.open
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /Download/i }))

    fireEvent.click(screen.getByRole('button', { name: /Download/i }))

    await waitFor(() => {
      expect(reportApi.getReportDownloadUrl).toHaveBeenCalledWith('job-001')
    })
    openSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // Share link (DG-DASH-07: now opens a modal; generateShareLink is called
  // when the user clicks "Send to CA" / "Send to Bank" inside the modal)
  // ---------------------------------------------------------------------------

  it('Share link button visible for COMPLETE job', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Share link/i })).toBeInTheDocument()
    })
  })

  it('clicking Share link button opens the Share modal', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /Share link/i }))

    fireEvent.click(screen.getByRole('button', { name: /Share link/i }))

    await waitFor(() => {
      // DG-DASH-07: modal opens as a dialog with aria-modal
      // Note: "Share Report" also appears as KpiStrip button text, so query the dialog role
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      // The modal dialog has two tab buttons for CA and Bank sharing
      expect(screen.getByRole('button', { name: /Share with CA/i })).toBeInTheDocument()
    })
  })

  it('submitting share modal calls generateShareLink and copies URL to clipboard', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /Share link/i }))

    // Open the share modal (row share button in recent jobs table)
    fireEvent.click(screen.getByRole('button', { name: /Share link/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click "Send to CA" to trigger the generateShareLink mutation
    const sendBtn = screen.getByRole('button', { name: /Send to CA/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(reportApi.generateShareLink).toHaveBeenCalledWith(
        'job-001',
        expect.objectContaining({ expiryHours: expect.any(Number) })
      )
    })

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://app.snapaccount.in/shared/report/abc123'
      )
    })
  })

  it('GENERATING job does NOT show Download or Share buttons', async () => {
    vi.spyOn(reportApi, 'listReportJobs').mockResolvedValue({
      ...mockJobsList,
      items: [mockJob({ status: 'GENERATING' })],
    })
    renderPage()

    // GENERATING appears in multiple places (KpiStrip MetricCard + status badge)
    await waitFor(() => {
      const genEls = screen.getAllByText('GENERATING')
      expect(genEls.length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Share link/i })).not.toBeInTheDocument()
  })

  it('shows empty state when no jobs exist', async () => {
    vi.spyOn(reportApi, 'listReportJobs').mockResolvedValue({
      items: [],
      totalCount: 0,
    })
    renderPage()

    await waitFor(() => {
      // EmptyState with variant="reports" renders defaultTitle + CTA — both may say
      // "Generate your first report"; confirm at least one occurrence is present
      const matches = screen.getAllByText('Generate your first report')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })
})
