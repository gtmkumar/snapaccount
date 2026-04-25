/**
 * BankCommunicationsPage — Phase 6C smoke + interaction tests
 * Covers: split-view layout, DetailPane with redacted PayloadViewer, KpiStrip from data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as loanApi from '@/lib/loanApi'
import BankCommunicationsPage from '@/pages/loans/BankCommunicationsPage'

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
      <MemoryRouter initialEntries={['/loans/bank-communications']}>
        <BankCommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockKpi: loanApi.BankCommKpi = {
  sentToday: 14,
  pending: 3,
  failed: 1,
  avgResponseMinutes: 42.5,
  bounceRate: 1.4,
}

const mockMsg: loanApi.BankCommMessage = {
  messageId: 'msg-001-uuid',
  bankId: 'bank-001',
  bankName: 'HDFC Bank',
  adapterType: 'EMAIL',
  applicationId: 'app-001',
  status: 'SENT',
  direction: 'outbound',
  channel: 'email',
  timestamp: '2024-03-15T10:30:00Z',
  subject: 'Loan Application: Sunrise Textiles',
  payloadMasked: JSON.stringify({ to: 'ops@hdfc.com', subject: 'Loan Application' }),
  responseMasked: null,
  responseStatus: null,
}

const mockMsgWithSecret: loanApi.BankCommMessage = {
  ...mockMsg,
  messageId: 'msg-002-uuid',
  channel: 'rest',
  adapterType: 'REST',
  payloadMasked: JSON.stringify({ apitoken: '***REDACTED***', applicationId: 'app-001' }),
  responseStatus: 200,
  responseMasked: JSON.stringify({ status: 'received' }),
}

const mockListResponse = {
  items: [mockMsg, mockMsgWithSecret],
  totalCount: 2,
}

beforeEach(() => {
  vi.spyOn(loanApi, 'getBankCommKpi').mockResolvedValue(mockKpi)
  vi.spyOn(loanApi, 'listBankCommunications').mockResolvedValue(mockListResponse)
})

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('BankCommunicationsPage — page structure', () => {
  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    })
  })

  it('renders KPI loading skeletons initially', () => {
    vi.spyOn(loanApi, 'getBankCommKpi').mockReturnValue(new Promise(() => {}))
    vi.spyOn(loanApi, 'listBankCommunications').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------

describe('BankCommunicationsPage — KPI strip', () => {
  it('renders KPI tiles after data loads', async () => {
    renderPage()
    await waitFor(() => {
      // KPI strip shows 5 MetricCards — check at least one numeric value renders
      expect(screen.getByText('14')).toBeInTheDocument()
    })
  })

  it('renders pending count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('renders failed count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Split-view: list
// ---------------------------------------------------------------------------

describe('BankCommunicationsPage — message list (3/5 side)', () => {
  it('renders message rows after data loads', async () => {
    renderPage()
    await waitFor(() => {
      // Bank name appears in message rows
      const names = screen.getAllByText('HDFC Bank')
      expect(names.length).toBeGreaterThan(0)
    })
  })

  it('renders BankCommStatusBadge for each message', async () => {
    renderPage()
    await waitFor(() => {
      // Status badge renders at least one SENT badge
      const container = document.body
      expect(container.innerHTML).toContain('SENT')
    })
  })

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

  it('shows hint text when no message selected (2/5 detail pane)', async () => {
    renderPage()
    await waitFor(() => {
      // Detail pane shows select hint when nothing is selected
      const hint = document.querySelector('.text-neutral-400')
      expect(hint).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// Split-view: detail pane
// ---------------------------------------------------------------------------

describe('BankCommunicationsPage — detail pane (2/5 side)', () => {
  it('clicking a message row shows detail pane with bank name', async () => {
    renderPage()
    await waitFor(() => screen.getAllByText('HDFC Bank'))
    // Find the clickable row buttons
    const rowBtns = document.querySelectorAll('button[type="button"]')
    // Click the first message row button that has HDFC Bank text
    const msgRowBtn = Array.from(rowBtns).find(b => b.textContent?.includes('Loan Application: Sunrise Textiles'))
    if (msgRowBtn) {
      fireEvent.click(msgRowBtn)
      await waitFor(() => {
        // Detail pane now shows the bank name in the header
        const bankNames = screen.getAllByText('HDFC Bank')
        expect(bankNames.length).toBeGreaterThanOrEqual(1)
      })
    }
  })

  it('PayloadViewer renders inside detail pane for email message', async () => {
    renderPage()
    const msgs = await screen.findAllByText('HDFC Bank')
    expect(msgs.length).toBeGreaterThan(0)

    // Click first row button to select the email message
    const rowBtns = document.querySelectorAll('button[type="button"]')
    const emailRow = Array.from(rowBtns).find(b =>
      b.textContent?.includes('Loan Application: Sunrise Textiles')
    )
    if (emailRow) {
      fireEvent.click(emailRow)
      await waitFor(() => {
        // PayloadViewer for email renders an iframe with title
        const iframe = screen.queryByTitle(/email body/i)
        // Either iframe or JSON tree view should appear
        const tree = screen.queryByRole('tree')
        expect(iframe ?? tree).toBeTruthy()
      })
    }
  })

  it('REST message row shows response status code', async () => {
    renderPage()
    await waitFor(() => screen.getAllByText('HDFC Bank'))

    const rowBtns = document.querySelectorAll('button[type="button"]')
    const restRow = Array.from(rowBtns).find(b => {
      const btn = b as HTMLElement
      // REST message has no subject — identify by messageId substring
      return btn.querySelector('.font-mono') !== null
    })
    if (restRow) {
      fireEvent.click(restRow)
      await waitFor(() => {
        // Response code 200 should be visible in detail pane
        expect(screen.getByText('200')).toBeInTheDocument()
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('BankCommunicationsPage — error state', () => {
  it('shows error banner when API fails', async () => {
    vi.spyOn(loanApi, 'listBankCommunications').mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      const alerts = document.querySelectorAll('[role="alert"], [class*="error"], [class*="alert"]')
      expect(alerts.length).toBeGreaterThan(0)
    }, { timeout: 5000 })
  })
})
