/**
 * LoanDetailPage — Phase 6C smoke + interaction tests
 * Covers: 6-tab WAI-ARIA tablist, keyboard nav, Approve modal, Reject modal,
 *         Disbursement record modal (manual entry path), Timeline status_log entries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as loanApi from '@/lib/loanApi'
import LoanDetailPage from '@/pages/loans/LoanDetailPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderPage(applicationId = 'app-001') {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[`/loans/${applicationId}`]}>
        <Routes>
          <Route path="/loans/:applicationId" element={<LoanDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockApplication = {
  applicationId: 'app-001',
  orgId: 'org-001',
  orgName: 'Sunrise Textiles Pvt Ltd',
  pan: 'AAACS1234D',
  gstin: '27AAACS1234D1ZM',
  phone: '+91 98765 43210',
  email: 'accounts@sunrise.in',
  status: 'UNDER_REVIEW' as const,
  requestedAmount: 5000000,
  tenureMonths: 36,
  purpose: 'Working capital',
  bankName: 'HDFC Bank',
  bankAdapterType: 'EMAIL' as const,
  assignedOfficer: 'Priya Sharma',
  businessVintageYears: 5,
  annualRevenueFy: 20000000,
}

const mockStatusLog = {
  items: [
    {
      id: 'log-001',
      fromStatus: 'DRAFT' as const,
      toStatus: 'SUBMITTED' as const,
      timestamp: '2024-03-01T09:00:00Z',
      actorType: 'user' as const,
      actorName: 'Ramesh Patel',
      note: 'Application submitted by applicant',
    },
    {
      id: 'log-002',
      fromStatus: 'SUBMITTED' as const,
      toStatus: 'UNDER_REVIEW' as const,
      timestamp: '2024-03-02T10:00:00Z',
      actorType: 'officer' as const,
      actorName: 'Priya Sharma',
      note: null,
    },
  ],
}

const mockConsents = {
  items: [
    {
      consentId: 'consent-001',
      consentType: 'CREDIT_BUREAU' as const,
      consentVersion: 'v2.1',
      signedAt: '2024-02-28T08:30:00Z',
      signatureHex: 'abcdef1234567890abcdef1234567890',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test',
      biometricUsed: false,
    },
  ],
}

const mockDocuments = { items: [] }
const mockBankComms = { items: [], totalCount: 0 }
const mockPackageUrl = { url: 'https://storage.example.com/package.zip', expiresAt: '2026-05-01T00:00:00Z' }

beforeEach(() => {
  vi.spyOn(loanApi, 'getLoanApplication').mockResolvedValue(mockApplication)
  vi.spyOn(loanApi, 'listStatusLog').mockResolvedValue(mockStatusLog)
  vi.spyOn(loanApi, 'listConsents').mockResolvedValue(mockConsents)
  vi.spyOn(loanApi, 'listApplicationDocuments').mockResolvedValue(mockDocuments)
  vi.spyOn(loanApi, 'listBankCommunications').mockResolvedValue(mockBankComms)
  vi.spyOn(loanApi, 'getPackageDownloadUrl').mockResolvedValue(mockPackageUrl)
  vi.spyOn(loanApi, 'approveApplication').mockResolvedValue(undefined)
  vi.spyOn(loanApi, 'rejectApplication').mockResolvedValue(undefined)
  vi.spyOn(loanApi, 'recordDisbursement').mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// TAB LIST — WAI-ARIA structure
// ---------------------------------------------------------------------------

describe('LoanDetailPage — tablist WAI-ARIA', () => {
  it('renders a tablist element', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument()
    })
  })

  it('renders exactly 6 tab buttons', async () => {
    renderPage()
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(6)
    })
  })

  it('first tab (Application) is selected by default', async () => {
    renderPage()
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('non-active tabs have aria-selected=false', async () => {
    renderPage()
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      // tabs[1] through [5] are unselected
      for (let i = 1; i < tabs.length; i++) {
        expect(tabs[i]).toHaveAttribute('aria-selected', 'false')
      }
    })
  })

  it('clicking Documents tab activates it', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[1]) // Documents
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking Timeline tab shows status_log entries', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[3]) // Timeline tab (index 3)
    await waitFor(() => {
      expect(screen.getByText('Ramesh Patel')).toBeInTheDocument()
    })
  })

  it('ArrowRight key moves to the next tab', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[0]) // activate first
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    await waitFor(() => {
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('ArrowLeft key moves to the previous tab (wraps)', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[0]) // activate first
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    await waitFor(() => {
      // Should wrap to last tab (index 5)
      expect(tabs[5]).toHaveAttribute('aria-selected', 'true')
    })
  })
})

// ---------------------------------------------------------------------------
// Application header
// ---------------------------------------------------------------------------

describe('LoanDetailPage — application header', () => {
  it('renders the org name', async () => {
    renderPage()
    await waitFor(() => {
      const matches = screen.getAllByText('Sunrise Textiles Pvt Ltd')
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('renders the PAN number', async () => {
    renderPage()
    await waitFor(() => {
      const matches = screen.getAllByText('AAACS1234D')
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('shows Approve and Reject buttons for UNDER_REVIEW status', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Approve modal
// ---------------------------------------------------------------------------

describe('LoanDetailPage — Approve modal', () => {
  it('opens approve modal when Approve button is clicked', async () => {
    renderPage()
    const approveBtn = await screen.findByRole('button', { name: /approve/i })
    fireEvent.click(approveBtn)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('approve modal contains a bank reference input', async () => {
    renderPage()
    const approveBtn = await screen.findByRole('button', { name: /approve/i })
    fireEvent.click(approveBtn)
    await waitFor(() => {
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
    })
  })

  it('confirm button is disabled when bank ref is empty', async () => {
    renderPage()
    const approveBtn = await screen.findByRole('button', { name: /approve/i })
    fireEvent.click(approveBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // The approve modal has a success-variant confirm button (bg-green-*) — disabled until ref is filled
    const dialog = screen.getByRole('dialog')
    const allBtns = Array.from(dialog.querySelectorAll('button[type="button"]')) as HTMLButtonElement[]
    // Find the success (green) variant button or the last non-close button
    const confirmBtn = allBtns.find(b =>
      b.className.includes('green') || b.className.includes('success')
    ) ?? allBtns[allBtns.length - 1]
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------

describe('LoanDetailPage — Reject modal', () => {
  it('opens reject modal when Reject button is clicked', async () => {
    renderPage()
    const rejectBtn = await screen.findByRole('button', { name: /reject/i })
    fireEvent.click(rejectBtn)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('reject modal has a reason textarea or input', async () => {
    renderPage()
    const rejectBtn = await screen.findByRole('button', { name: /reject/i })
    fireEvent.click(rejectBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Disbursement tab — manual entry (APPROVED status)
// ---------------------------------------------------------------------------

describe('LoanDetailPage — Disbursement tab (APPROVED status)', () => {
  beforeEach(() => {
    vi.spyOn(loanApi, 'getLoanApplication').mockResolvedValue({
      ...mockApplication,
      status: 'APPROVED' as const,
    })
  })

  it('shows Record Disbursement button when status is APPROVED', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[5]) // Disbursement tab
    await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const recordBtn = btns.find(b => b.textContent?.toLowerCase().includes('record') || b.textContent?.toLowerCase().includes('disburs'))
      expect(recordBtn).toBeTruthy()
    })
  })

  it('clicking Record Disbursement opens a modal', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[5]) // Disbursement tab
    const recordBtn = await screen.findByRole('button', { name: /record disbursement/i })
    fireEvent.click(recordBtn)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('disbursement modal has amount and UTR inputs', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[5])
    const recordBtn = await screen.findByRole('button', { name: /record disbursement/i })
    fireEvent.click(recordBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const inputs = screen.getAllByRole('spinbutton').concat(screen.getAllByRole('textbox'))
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('save button is disabled without amount and UTR', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[5])
    const recordBtn = await screen.findByRole('button', { name: /record disbursement/i })
    fireEvent.click(recordBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Timeline tab — status_log entries
// ---------------------------------------------------------------------------

describe('LoanDetailPage — Timeline tab', () => {
  it('renders timeline actor names from status_log', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[3]) // Timeline
    await waitFor(() => {
      expect(screen.getByText('Ramesh Patel')).toBeInTheDocument()
      expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    })
  })

  it('renders status transition note when present', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[3])
    await waitFor(() => {
      expect(screen.getByText('Application submitted by applicant')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Consents tab
// ---------------------------------------------------------------------------

describe('LoanDetailPage — Consents tab', () => {
  it('renders ConsentAuditCard with CREDIT_BUREAU label', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[2]) // Consents
    await waitFor(() => {
      expect(screen.getByText('Credit Bureau')).toBeInTheDocument()
    })
  })

  it('shows last 4 of signature hash', async () => {
    renderPage()
    const tabs = await screen.findAllByRole('tab')
    fireEvent.click(tabs[2])
    await waitFor(() => {
      expect(screen.getByText(/7890/)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LoanDetailPage — error state', () => {
  it('shows error banner when API fails', async () => {
    vi.spyOn(loanApi, 'getLoanApplication').mockRejectedValue(new Error('Not found'))
    renderPage()
    await waitFor(() => {
      const alerts = document.querySelectorAll('[role="alert"], [class*="error"], [class*="alert"]')
      expect(alerts.length).toBeGreaterThan(0)
    }, { timeout: 5000 })
  })

  it('shows skeleton while loading', () => {
    vi.spyOn(loanApi, 'getLoanApplication').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
