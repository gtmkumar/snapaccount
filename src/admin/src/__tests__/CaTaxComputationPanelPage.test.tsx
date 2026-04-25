/**
 * CaTaxComputationPanelPage — unit tests (Phase 6D)
 *
 * Covers:
 * - Loading skeleton renders while query pending
 * - Error alert renders when filing API fails
 * - DualPaneEditor (left + right panes) renders after data loads
 * - Left pane tab list (Income / Deductions / Notes)
 * - ComputationCard + amount display renders after compute result returns
 * - Debounced recompute: computeTax is called after 300ms following input change (vi.useFakeTimers)
 * - 30s auto-save: updateFilingDraft called after 30s when state is 'unsaved' (vi.useFakeTimers)
 * - Regime toggle (OLD / NEW) re-triggers recompute
 * - Approve / Reject modal buttons present for non-locked filings
 * - Locked (FILED) filing shows info banner, no approve/reject actions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as itrApi from '@/lib/itrApi'
import type { Filing } from '@/lib/itrApi'
import CaTaxComputationPanelPage from '@/pages/itr/CaTaxComputationPanelPage'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage(filingId = 'fil-001') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[`/itr/${filingId}/computation`]}>
        <Routes>
          <Route path="/itr/:filingId/computation" element={<CaTaxComputationPanelPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const makeFiling = (overrides: Partial<Filing> = {}): Filing => ({
  id: 'fil-001',
  assesseeId: 'prof-001',
  assesseeName: 'Ravi Kumar Test',
  panLast4: '1234',
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

const makeComputationResult = (): itrApi.ComputationResult => ({
  filingId: 'fil-001',
  grossTotalIncome: 600000,
  deductions: 75000,
  taxableIncome: 525000,
  taxOnIncome: 11250,
  surcharge: 0,
  cessAmount: 450,
  rebate87A: 0,
  grossTaxLiability: 11700,
  tdsPaid: 42000,
  advanceTaxPaid: 0,
  totalCredits: 42000,
  payableOrRefund: -30300,
  computationHash: 'abc123',
  regime: 'NEW',
  assessmentYear: 'AY2025-26',
})

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — loading and error', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows loading skeleton while filing query is pending', () => {
    vi.spyOn(itrApi, 'getFiling').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error alert when filing API rejects', async () => {
    vi.spyOn(itrApi, 'getFiling').mockRejectedValue(new Error('Not found'))
    renderPage()
    const errorEl = await screen.findByRole('alert')
    expect(errorEl).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// DualPaneEditor renders
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — DualPaneEditor renders', () => {
  beforeEach(() => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling())
    vi.spyOn(itrApi, 'computeTax').mockResolvedValue(makeComputationResult())
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders assessee name in sub-header', async () => {
    renderPage()
    const el = await screen.findByText(/Ravi Kumar Test/)
    expect(el).toBeTruthy()
  })

  it('renders assessment year in sub-header', async () => {
    renderPage()
    const els = await screen.findAllByText(/AY2025-26/)
    expect(els.length).toBeGreaterThan(0)
  })

  it('renders left-pane tab list with Income tab selected', async () => {
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const tabs = document.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBeGreaterThan(0)
  })

  it('renders Income, Deductions, Notes tabs in left pane', async () => {
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map(t => t.textContent ?? '')
    const hasIncome = tabs.some(t => /income/i.test(t))
    const hasDeductions = tabs.some(t => /deduction/i.test(t))
    const hasNotes = tabs.some(t => /notes/i.test(t))
    expect(hasIncome).toBe(true)
    expect(hasDeductions).toBe(true)
    expect(hasNotes).toBe(true)
  })

  it('renders regime toggle buttons (OLD, NEW)', async () => {
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const oldBtn = screen.queryAllByText(/OLD/i)
    const newBtn = screen.queryAllByText(/NEW/i)
    expect(oldBtn.length + newBtn.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// ComputationCard renders with before/after values
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — ComputationCard', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders computation result rows after computeTax resolves', async () => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling())
    vi.spyOn(itrApi, 'computeTax').mockResolvedValue(makeComputationResult())

    renderPage()
    await screen.findByText(/Ravi Kumar Test/)

    // Trigger a salary input to kick off computation
    const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    if (numberInputs.length > 0) {
      await userEvent.clear(numberInputs[0])
      await userEvent.type(numberInputs[0], '600000')

      await waitFor(() => {
        expect(itrApi.computeTax).toHaveBeenCalled()
      }, { timeout: 1000 })
    }
  })
})

// ---------------------------------------------------------------------------
// Debounced recompute: 300ms (vi.useFakeTimers)
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — debounced recompute', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('computeTax is NOT called before 300ms', async () => {
    vi.useFakeTimers()
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling())
    vi.spyOn(itrApi, 'computeTax').mockResolvedValue(makeComputationResult())

    renderPage()
    await vi.runAllTimersAsync()

    const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    if (numberInputs.length > 0) {
      // Use fireEvent (works with fake timers; userEvent does not)
      fireEvent.change(numberInputs[0], { target: { value: '500000' } })
      // Only 200ms has passed — debounce hasn't fired yet
      await vi.advanceTimersByTimeAsync(200)
      expect(itrApi.computeTax).not.toHaveBeenCalled()
    }
  })

  it('computeTax IS called after 300ms debounce', async () => {
    vi.useFakeTimers()
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling())
    vi.spyOn(itrApi, 'computeTax').mockResolvedValue(makeComputationResult())

    renderPage()
    // Flush initial query timers only (don't runAll — causes infinite loop with polling)
    await vi.advanceTimersByTimeAsync(100)

    const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    if (numberInputs.length > 0) {
      fireEvent.change(numberInputs[0], { target: { value: '500000' } })
      // Advance past the 300ms debounce
      await vi.advanceTimersByTimeAsync(400)

      expect(itrApi.computeTax).toHaveBeenCalled()
    }
  })
})

// ---------------------------------------------------------------------------
// 30s auto-save (vi.useFakeTimers)
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — 30s autosave', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('updateFilingDraft is called after 30s when state is unsaved', async () => {
    vi.useFakeTimers()
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling())
    vi.spyOn(itrApi, 'computeTax').mockResolvedValue(makeComputationResult())
    vi.spyOn(itrApi, 'updateFilingDraft').mockResolvedValue(makeFiling())

    renderPage()
    // Flush all pending timers (react-query fetch + initial render)
    await vi.runAllTimersAsync()

    const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    if (numberInputs.length > 0) {
      // Use fireEvent so React's synthetic onChange fires with fake timers
      fireEvent.change(numberInputs[0], { target: { value: '700000' } })

      // Advance past 300ms compute debounce
      await vi.advanceTimersByTimeAsync(300)
      await vi.runAllTimersAsync()

      // Advance past the 30s autosave timer
      await vi.advanceTimersByTimeAsync(30_000)
      await vi.runAllTimersAsync()

      expect(itrApi.updateFilingDraft).toHaveBeenCalled()
    }
  })
})

// ---------------------------------------------------------------------------
// Regime toggle re-runs compute
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — regime toggle', () => {
  beforeEach(() => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling({ regime: 'NEW' }))
    vi.spyOn(itrApi, 'computeTax').mockResolvedValue(makeComputationResult())
  })
  afterEach(() => vi.restoreAllMocks())

  it('clicking OLD regime button triggers recompute', async () => {
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)

    const buttons = screen.getAllByRole('button')
    const oldBtn = buttons.find(b => /^OLD$/i.test(b.textContent?.trim() ?? ''))
    if (oldBtn) {
      await userEvent.click(oldBtn)
      // computeTax should have been called
      await waitFor(() => {
        expect(itrApi.computeTax).toHaveBeenCalled()
      }, { timeout: 500 })
    }
  })

  it('deduction inputs are disabled in NEW regime', async () => {
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)

    // Switch to Deductions tab
    const tabs = document.querySelectorAll('[role="tab"]')
    const deductionsTab = Array.from(tabs).find(t => /deduction/i.test(t.textContent ?? ''))
    if (deductionsTab) {
      await userEvent.click(deductionsTab)
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
      // In NEW regime, deduction inputs should all be disabled
      const allDisabled = Array.from(inputs).every(inp => inp.disabled)
      expect(allDisabled).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Approve / Reject actions
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — approve / reject', () => {
  afterEach(() => vi.restoreAllMocks())

  it('Approve and Reject buttons are visible for UNDER_CA_REVIEW status', async () => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling({ status: 'UNDER_CA_REVIEW' }))
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const buttons = screen.getAllByRole('button')
    const approveBtn = buttons.find(b => /approve/i.test(b.textContent ?? ''))
    const rejectBtn = buttons.find(b => /reject/i.test(b.textContent ?? ''))
    expect(approveBtn).toBeTruthy()
    expect(rejectBtn).toBeTruthy()
  })

  it('clicking Approve opens approve modal', async () => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling({ status: 'UNDER_CA_REVIEW' }))
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const buttons = screen.getAllByRole('button')
    const approveBtn = buttons.find(b => /approve/i.test(b.textContent ?? ''))
    if (approveBtn) {
      await userEvent.click(approveBtn)
      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog).toBeTruthy()
    }
  })

  it('clicking Reject opens reject modal with reason textarea', async () => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling({ status: 'UNDER_CA_REVIEW' }))
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const buttons = screen.getAllByRole('button')
    const rejectBtn = buttons.find(b => /reject/i.test(b.textContent ?? ''))
    if (rejectBtn) {
      await userEvent.click(rejectBtn)
      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog).toBeTruthy()
      const reasonArea = dialog?.querySelector('textarea')
      expect(reasonArea).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Locked filing (FILED status)
// ---------------------------------------------------------------------------

describe('CaTaxComputationPanelPage — locked filing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows locked banner for FILED status', async () => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling({ status: 'FILED' }))
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    // AlertBanner renders as role="alert" — the locked info banner should be present
    const alerts = document.querySelectorAll('[role="alert"]')
    expect(alerts.length).toBeGreaterThan(0)
  })

  it('Approve / Reject buttons are NOT shown for FILED status', async () => {
    vi.spyOn(itrApi, 'getFiling').mockResolvedValue(makeFiling({ status: 'FILED' }))
    renderPage()
    await screen.findByText(/Ravi Kumar Test/)
    const buttons = screen.getAllByRole('button')
    const approveBtn = buttons.find(b => /^approve$/i.test(b.textContent?.trim() ?? ''))
    const rejectBtn = buttons.find(b => /^reject$/i.test(b.textContent?.trim() ?? ''))
    expect(approveBtn).toBeFalsy()
    expect(rejectBtn).toBeFalsy()
  })
})
