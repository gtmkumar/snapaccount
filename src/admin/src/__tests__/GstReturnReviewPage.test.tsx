/**
 * GstReturnReviewPage — unit tests for Phase 6A additions
 * Tests: ARN capture section, audit trail panel, real data wiring
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as gstApi from '@/lib/gstApi'
import GstReturnReviewPage from '@/pages/gst/GstReturnReviewPage'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage(id = 'return-001') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[`/gst/${id}`]}>
        <Routes>
          <Route path="/gst/:id" element={<GstReturnReviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockReturn = {
  id: 'return-001',
  organizationId: 'org-001',
  gstin: '27AABCS1429B1ZB',
  businessName: 'Sharma Trading Co.',
  returnType: 'GSTR-3B' as const,
  period: 'March 2026',
  financialYear: '2025-26',
  status: 'FILED' as const,
  dueDate: new Date(Date.now() + 86400000).toISOString(),
  taxPayable: 48500,
  assignedCa: 'CA Ravi Kumar',
  slaExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  arn: null,
  arnSavedAt: null,
  arnSavedBy: null,
}

const mockAudit = {
  items: [
    {
      id: 'ev-001',
      eventType: 'FILED' as const,
      actorEmail: 'system@snapaccount.in',
      actorDisplayName: 'System',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      detail: 'Return filed via GSTN portal',
      previousStatus: 'APPROVED',
      arnReceived: null,
      diffAvailable: false,
    },
    {
      id: 'ev-002',
      eventType: 'APPROVED' as const,
      actorEmail: 'ca-ravi@snapaccount.in',
      actorDisplayName: 'CA Ravi Kumar',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      detail: 'ITC reconciled, approved for filing',
      previousStatus: 'PENDING_APPROVAL',
      arnReceived: null,
      diffAvailable: false,
    },
  ],
  totalCount: 2,
  page: 1,
}

describe('GstReturnReviewPage', () => {
  beforeEach(() => {
    vi.spyOn(gstApi, 'getGstReturn').mockResolvedValue(mockReturn)
    vi.spyOn(gstApi, 'getGstReturnAudit').mockResolvedValue(mockAudit)
  })

  it('renders business name from real API data', async () => {
    renderPage()
    const titles = await screen.findAllByText(/Sharma Trading Co\./)
    expect(titles.length).toBeGreaterThan(0)
  })

  // CG-9: GSTR-1 Add-invoice line-item editor
  it('shows Add invoice button for an editable GSTR-1 return and adds an invoice', async () => {
    vi.spyOn(gstApi, 'getGstReturn').mockResolvedValue({
      ...mockReturn,
      returnType: 'GSTR-1',
      status: 'DRAFT',
    })
    vi.spyOn(gstApi, 'listReturnInvoices').mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 500 })
    const addSpy = vi.spyOn(gstApi, 'addReturnInvoice').mockResolvedValue(undefined)

    renderPage()
    const addBtn = await screen.findByRole('button', { name: /add invoice/i })
    fireEvent.click(addBtn)

    const dialog = await screen.findByRole('dialog', { name: /add invoice to return/i })
    // Use a B2C invoice so no buyer GSTIN is required.
    const typeSelect = dialog.querySelector('select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'B2C' } })
    const numberInput = dialog.querySelectorAll('input[type="text"], input:not([type])')[0] as HTMLInputElement
    fireEvent.change(numberInput, { target: { value: 'INV-99' } })
    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-03-15' } })
    const numberFields = dialog.querySelectorAll('input[type="number"]')
    fireEvent.change(numberFields[0], { target: { value: '1000' } }) // taxable

    const submitBtn = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalled()
      expect(addSpy.mock.calls[0][1].invoiceNumber).toBe('INV-99')
      expect(addSpy.mock.calls[0][1].invoiceType).toBe('B2C')
    })
  })

  it('hides Add invoice button for a filed (non-editable) GSTR-1 return', async () => {
    vi.spyOn(gstApi, 'getGstReturn').mockResolvedValue({
      ...mockReturn,
      returnType: 'GSTR-1',
      status: 'FILED',
    })
    vi.spyOn(gstApi, 'listReturnInvoices').mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 500 })
    renderPage()
    await screen.findAllByText('Sharma Trading Co.')
    expect(screen.queryByRole('button', { name: /add invoice/i })).toBeNull()
  })

  it('renders GSTIN from real API data', async () => {
    renderPage()
    const gstin = await screen.findAllByText('27AABCS1429B1ZB')
    expect(gstin.length).toBeGreaterThan(0)
  })

  it('shows ARN capture section when status is FILED', async () => {
    renderPage()
    await screen.findAllByText('Sharma Trading Co.')
    const arnLabels = await screen.findAllByText('ARN (Acknowledgement Ref. No.)')
    expect(arnLabels.length).toBeGreaterThan(0)
  })

  it('hides ARN capture section when status is not FILED or REVISION_NEEDED', async () => {
    vi.spyOn(gstApi, 'getGstReturn').mockResolvedValue({
      ...mockReturn,
      status: 'PENDING_APPROVAL',
    })
    renderPage()
    await screen.findAllByText('Sharma Trading Co.')
    const arnLabel = screen.queryByText('ARN (Acknowledgement Ref. No.)')
    expect(arnLabel).toBeNull()
  })

  it('renders ARN input field when no ARN saved', async () => {
    renderPage()
    await screen.findAllByText('ARN (Acknowledgement Ref. No.)')
    const inputs = screen.getAllByLabelText('ARN (Acknowledgement Ref. No.)')
    expect(inputs[0]).toBeTruthy()
  })

  it('shows ARN as read-only when already saved', async () => {
    vi.spyOn(gstApi, 'getGstReturn').mockResolvedValue({
      ...mockReturn,
      arn: 'AA270320250000123',
      arnSavedAt: new Date().toISOString(),
      arnSavedBy: 'ops@snapaccount.in',
    })
    renderPage()
    const arnEls = await screen.findAllByText('AA270320250000123')
    expect(arnEls.length).toBeGreaterThan(0)
    // Should not render any input (read-only display)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows ARN validation error for invalid format', async () => {
    renderPage()
    await screen.findAllByText('ARN (Acknowledgement Ref. No.)')
    // Use first textbox (ARN input may appear twice due to responsive dual render)
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'INVALID')
    const saveBtns = screen.getAllByText('Save ARN')
    await userEvent.click(saveBtns[0])
    const errors = await screen.findAllByText(/Invalid ARN format/)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('renders audit trail toggle button', async () => {
    renderPage()
    const auditToggles = await screen.findAllByText('Audit Trail')
    expect(auditToggles.length).toBeGreaterThan(0)
  })

  it('renders audit events when expanded', async () => {
    renderPage()
    await screen.findAllByText('Audit Trail')
    // Audit panel loads audit events
    const filed = await screen.findByText('Filed')
    expect(filed).toBeTruthy()
  })

  it('renders action buttons', async () => {
    renderPage()
    await screen.findAllByText('Sharma Trading Co.')
    const submitBtns = screen.getAllByRole('button', { name: /Submit for Filing/i })
    expect(submitBtns[0]).toBeTruthy()
  })

  it('submit button disabled when checklist incomplete', async () => {
    renderPage()
    await screen.findAllByText('Sharma Trading Co.')
    const submitButtons = screen.getAllByRole('button', { name: /Submit for Filing/i })
    expect(submitButtons[0]).toBeDisabled()
  })

  it('shows loading state initially', () => {
    vi.spyOn(gstApi, 'getGstReturn').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error state on API failure', async () => {
    vi.spyOn(gstApi, 'getGstReturn').mockRejectedValue(new Error('Network error'))
    renderPage()
    const err = await screen.findByText(/Failed to load return/)
    expect(err).toBeTruthy()
  })
})
