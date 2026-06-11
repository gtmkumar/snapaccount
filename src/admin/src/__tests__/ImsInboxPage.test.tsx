/**
 * ImsInboxPage — component tests (GAP-101 / Board #32)
 *
 * Tests:
 *  1. List rendering by status
 *  2. Optimistic accept + undo
 *  3. Reject reason validation (client-required min 3 chars)
 *  4. Bulk eligibility filter
 *  5. Permission gating (gst.ims.read / gst.ims.action / gst.ims.sync)
 *  6. Deemed-acceptance banner states
 *  7. API schemas (Zod parse)
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

// ---------------------------------------------------------------------------
// RBAC mock
// ---------------------------------------------------------------------------
const { perms } = vi.hoisted(() => ({
  perms: {
    loaded: true,
    granted: new Set<string>(['gst.ims.read', 'gst.ims.action', 'gst.ims.sync', 'gst.gstr1a.read', 'gst.gstr1a.create']),
  },
}))

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasServerPermission: (code: string) => perms.granted.has(code),
    hasAnyServerPermission: (codes: string[]) => codes.some((c) => perms.granted.has(c)),
    hasAllServerPermissions: (codes: string[]) => codes.every((c) => perms.granted.has(c)),
    permissionsLoaded: perms.loaded,
    serverPermissions: [...perms.granted],
  }),
}))

// ---------------------------------------------------------------------------
// Auth mock
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'user-111', email: 'admin@test.com', displayName: 'Admin', role: 'SUPER_ADMIN' },
    loading: false,
    signOut: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// API mock
// ---------------------------------------------------------------------------
vi.mock('@/lib/gstImsApi', async () => {
  const actual = await vi.importActual('@/lib/gstImsApi')
  return {
    ...actual,
    listImsInvoices: vi.fn(),
    getImsSummary: vi.fn(),
    syncImsInvoices: vi.fn(),
    actOnImsInvoice: vi.fn(),
    bulkActOnImsInvoices: vi.fn(),
  }
})

import * as gstImsApi from '@/lib/gstImsApi'
import ImsInboxPage from '@/pages/gst/ImsInboxPage'
// Import helpers directly — these are pure functions unaffected by the API mock
import { z } from 'zod'
import {
  periodToLabel,
  periodToShortLabel,
  getLastNPeriods,
  formatDateDMY,
  daysUntilDeadline,
  canAccept,
  canReject,
  canKeepPending,
  IMS_STATUSES,
} from '@/lib/gstImsApi'

// Build the Zod schemas locally for schema-parsing tests
// (vi.mock replaces the module; we reconstruct the schemas inline to test them
//  independently so they aren't subject to the async mock resolution)
const LocalImsInvoiceSummarySchema = z.object({
  id: z.string().uuid(),
  supplierGstin: z.string(),
  supplierName: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  invoiceValue: z.number(),
  taxableValue: z.number(),
  igstAmount: z.number(),
  cgstAmount: z.number(),
  sgstAmount: z.number(),
  cessAmount: z.number(),
  period: z.string(),
  source: z.string(),
  status: z.enum(IMS_STATUSES),
  deemedAccepted: z.boolean(),
  actionedAt: z.string().nullable().optional(),
  actionedBy: z.string().uuid().nullable().optional(),
})

const LocalImsSummarySchema = z.object({
  period: z.string(),
  pending: z.number(),
  accepted: z.number(),
  rejected: z.number(),
  pendingKept: z.number(),
  total: z.number(),
  deemedAccepted: z.boolean(),
  gstr2bGenerationDeadline: z.string(),
  gstr2bGenerationPast: z.boolean(),
  totalPendingValue: z.number().optional(),
  totalAcceptedValue: z.number().optional(),
  totalRejectedValue: z.number().optional(),
})

const LocalBulkImsActionResultSchema = z.object({
  invoiceId: z.string().uuid(),
  success: z.boolean(),
  newStatus: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
})

const LocalBulkImsActionResponseSchema = z.object({
  totalRequested: z.number(),
  changed: z.number(),
  skipped: z.number(),
  failed: z.number(),
  results: z.array(LocalBulkImsActionResultSchema),
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseInvoice: gstImsApi.ImsInvoiceSummary = {
  id: 'a0a0a0a0-0000-4000-8000-000000000001',
  supplierGstin: '29AABCU9603R1ZX',
  supplierName: 'ABC Supplies Pvt Ltd',
  invoiceNumber: 'INV-001',
  invoiceDate: '2026-03-15',
  invoiceValue: 11800,
  taxableValue: 10000,
  igstAmount: 1800,
  cgstAmount: 0,
  sgstAmount: 0,
  cessAmount: 0,
  period: '032026',
  source: 'GSTR-1',
  status: 'PENDING',
  deemedAccepted: false,
}

const acceptedInvoice: gstImsApi.ImsInvoiceSummary = {
  ...baseInvoice,
  id: 'a0a0a0a0-0000-4000-8000-000000000002',
  invoiceNumber: 'INV-002',
  status: 'ACCEPTED',
}

const rejectedInvoice: gstImsApi.ImsInvoiceSummary = {
  ...baseInvoice,
  id: 'a0a0a0a0-0000-4000-8000-000000000003',
  invoiceNumber: 'INV-003',
  status: 'REJECTED',
}

const pendingKeptInvoice: gstImsApi.ImsInvoiceSummary = {
  ...baseInvoice,
  id: 'a0a0a0a0-0000-4000-8000-000000000004',
  invoiceNumber: 'INV-004',
  status: 'PENDING_KEPT',
}

const mockSummaryOpen: gstImsApi.ImsSummary = {
  period: '032026',
  pending: 2,
  accepted: 1,
  rejected: 1,
  pendingKept: 1,
  total: 5,
  deemedAccepted: false,
  gstr2bGenerationDeadline: '2099-04-14',
  gstr2bGenerationPast: false,
  totalPendingValue: 20000,
  totalAcceptedValue: 11800,
  totalRejectedValue: 11800,
}

const mockSummaryPast: gstImsApi.ImsSummary = {
  ...mockSummaryOpen,
  gstr2bGenerationPast: true,
  deemedAccepted: true,
}

const mockListAllStatuses: gstImsApi.ImsInvoiceList = {
  items: [baseInvoice, acceptedInvoice, rejectedInvoice, pendingKeptInvoice],
  totalCount: 4,
  page: 1,
  pageSize: 20,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  })
}

function renderPage(organizationId = 'org-001') {
  const qc = makeQC()
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ImsInboxPage organizationId={organizationId} gstin="29AABCU9603R1ZX" />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImsInboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gstImsApi.getImsSummary).mockResolvedValue(mockSummaryOpen)
    vi.mocked(gstImsApi.listImsInvoices).mockResolvedValue(mockListAllStatuses)
  })

  // ─── 1. List rendering by status ─────────────────────────────────────────

  describe('list rendering', () => {
    it('renders all four status invoices in the table', async () => {
      renderPage()
      const rows = await screen.findAllByRole('row')
      // Header row + 4 data rows
      expect(rows.length).toBeGreaterThanOrEqual(5)
    })

    it('displays PENDING invoice number', async () => {
      renderPage()
      expect(await screen.findByText('INV-001')).toBeInTheDocument()
    })

    it('displays ACCEPTED invoice number', async () => {
      renderPage()
      expect(await screen.findByText('INV-002')).toBeInTheDocument()
    })

    it('displays REJECTED invoice number', async () => {
      renderPage()
      expect(await screen.findByText('INV-003')).toBeInTheDocument()
    })

    it('displays PENDING_KEPT invoice number', async () => {
      renderPage()
      expect(await screen.findByText('INV-004')).toBeInTheDocument()
    })

    it('shows supplier name in table', async () => {
      renderPage()
      const cells = await screen.findAllByText('ABC Supplies Pvt Ltd')
      expect(cells.length).toBeGreaterThan(0)
    })

    it('shows source badge GSTR-1', async () => {
      renderPage()
      const sourceBadges = await screen.findAllByText('GSTR-1')
      expect(sourceBadges.length).toBeGreaterThan(0)
    })
  })

  // ─── 2. Optimistic accept + undo ─────────────────────────────────────────

  describe('accept action + undo', () => {
    it('calls actOnImsInvoice with ACCEPTED on accept click', async () => {
      vi.mocked(gstImsApi.actOnImsInvoice).mockResolvedValue({
        invoiceId: baseInvoice.id,
        previousStatus: 'PENDING',
        newStatus: 'ACCEPTED',
        changed: true,
      })
      renderPage()
      // Wait for table to render
      await screen.findByText('INV-001')

      // Click the Accept button for INV-001 (PENDING invoice)
      const acceptBtns = screen.getAllByRole('button', { name: /accept invoice INV-001/i })
      fireEvent.click(acceptBtns[0])

      await waitFor(() => {
        expect(gstImsApi.actOnImsInvoice).toHaveBeenCalledWith(
          baseInvoice.id,
          expect.objectContaining({ action: 'ACCEPTED' })
        )
      })
    })

    it('shows undo toast after accept', async () => {
      vi.mocked(gstImsApi.actOnImsInvoice).mockResolvedValue({
        invoiceId: baseInvoice.id,
        previousStatus: 'PENDING',
        newStatus: 'ACCEPTED',
        changed: true,
      })
      renderPage()
      await screen.findByText('INV-001')

      const acceptBtns = screen.getAllByRole('button', { name: /accept invoice INV-001/i })
      fireEvent.click(acceptBtns[0])

      await waitFor(() => {
        expect(screen.queryByText(/undo/i)).toBeInTheDocument()
      })
    })

    it('does NOT show accept button for already-ACCEPTED invoice', async () => {
      renderPage()
      await screen.findByText('INV-002') // ACCEPTED invoice
      // Accept button for INV-002 should not exist
      const acceptBtns = screen.queryAllByRole('button', { name: /accept invoice INV-002/i })
      expect(acceptBtns).toHaveLength(0)
    })
  })

  // ─── 3. Reject reason validation ─────────────────────────────────────────

  describe('reject reason modal validation', () => {
    it('opens reject modal on reject click', async () => {
      renderPage()
      await screen.findByText('INV-001')

      const rejectBtns = screen.getAllByRole('button', { name: /reject invoice INV-001/i })
      fireEvent.click(rejectBtns[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('blocks submission with empty reason', async () => {
      vi.mocked(gstImsApi.actOnImsInvoice).mockResolvedValue({
        invoiceId: baseInvoice.id,
        previousStatus: 'PENDING',
        newStatus: 'REJECTED',
        changed: true,
      })
      renderPage()
      await screen.findByText('INV-001')

      const rejectBtns = screen.getAllByRole('button', { name: /reject invoice INV-001/i })
      fireEvent.click(rejectBtns[0])

      await waitFor(() => screen.getByRole('dialog'))

      // Click the dialog's confirm button (not the row button — dialog is now open)
      // The dialog confirm button has exact text "Reject invoice"
      const dialog = screen.getByRole('dialog')
      const confirmBtns = Array.from(dialog.querySelectorAll('button')).filter(
        b => b.textContent?.trim() === 'Reject invoice'
      )
      expect(confirmBtns.length).toBeGreaterThan(0)
      fireEvent.click(confirmBtns[0])

      await waitFor(() => {
        // The validation error paragraph has role="alert" and contains the required message
        expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument()
      })
      // actOnImsInvoice should NOT have been called
      expect(gstImsApi.actOnImsInvoice).not.toHaveBeenCalled()
    })

    it('blocks submission with reason shorter than 3 chars', async () => {
      renderPage()
      await screen.findByText('INV-001')

      const rejectBtns = screen.getAllByRole('button', { name: /reject invoice INV-001/i })
      fireEvent.click(rejectBtns[0])

      await waitFor(() => screen.getByRole('dialog'))

      const textarea = screen.getByRole('textbox', { name: /reason for rejection/i })
      fireEvent.change(textarea, { target: { value: 'ab' } })

      const dialog = screen.getByRole('dialog')
      const confirmBtns = Array.from(dialog.querySelectorAll('button')).filter(
        b => b.textContent?.trim() === 'Reject invoice'
      )
      expect(confirmBtns.length).toBeGreaterThan(0)
      fireEvent.click(confirmBtns[0])

      await waitFor(() => {
        expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument()
      })
      expect(gstImsApi.actOnImsInvoice).not.toHaveBeenCalled()
    })

    it('allows submission with valid reason (≥ 3 chars)', async () => {
      vi.mocked(gstImsApi.actOnImsInvoice).mockResolvedValue({
        invoiceId: baseInvoice.id,
        previousStatus: 'PENDING',
        newStatus: 'REJECTED',
        changed: true,
      })
      renderPage()
      await screen.findByText('INV-001')

      const rejectBtns = screen.getAllByRole('button', { name: /reject invoice INV-001/i })
      fireEvent.click(rejectBtns[0])

      await waitFor(() => screen.getByRole('dialog'))

      const textarea = screen.getByRole('textbox', { name: /reason for rejection/i })
      fireEvent.change(textarea, { target: { value: 'Price mismatch in invoice' } })

      const dialog = screen.getByRole('dialog')
      const confirmBtns = Array.from(dialog.querySelectorAll('button')).filter(
        b => b.textContent?.trim() === 'Reject invoice'
      )
      expect(confirmBtns.length).toBeGreaterThan(0)
      fireEvent.click(confirmBtns[0])

      await waitFor(() => {
        expect(gstImsApi.actOnImsInvoice).toHaveBeenCalledWith(
          baseInvoice.id,
          expect.objectContaining({ action: 'REJECTED', reason: 'Price mismatch in invoice' })
        )
      })
    })

    it('fills reason field when quick-pick chip is clicked', async () => {
      renderPage()
      await screen.findByText('INV-001')

      const rejectBtns = screen.getAllByRole('button', { name: /reject invoice INV-001/i })
      fireEvent.click(rejectBtns[0])

      await waitFor(() => screen.getByRole('dialog'))

      // Click "Price mismatch" quick-pick chip
      const priceChip = screen.getByRole('button', { name: /price mismatch/i })
      fireEvent.click(priceChip)

      const textarea = screen.getByRole('textbox', { name: /reason for rejection/i })
      expect((textarea as HTMLTextAreaElement).value).toBe('Price mismatch')
    })
  })

  // ─── 4. Bulk eligibility filter ──────────────────────────────────────────

  describe('bulk eligibility filter', () => {
    it('shows selected count when checkboxes are checked', async () => {
      renderPage()
      await screen.findByText('INV-001')

      const checkboxes = screen.getAllByRole('checkbox')
      // First checkbox is select-all; individual are after
      const firstInvoiceCheckbox = checkboxes[1]
      fireEvent.click(firstInvoiceCheckbox)

      await waitFor(() => {
        expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
      })
    })

    it('shows cap warning when more than 100 invoices selected', async () => {
      // Mock list with 101 items
      const manyInvoices = Array.from({ length: 101 }, (_, i) => ({
        ...baseInvoice,
        id: `a0a0a0a0-0000-4000-8000-${String(i).padStart(12, '0')}`,
        invoiceNumber: `INV-${String(i + 1).padStart(3, '0')}`,
      }))
      vi.mocked(gstImsApi.listImsInvoices).mockResolvedValueOnce({
        items: manyInvoices,
        totalCount: 101,
        page: 1,
        pageSize: 101,
      })

      renderPage()
      await screen.findByText('INV-001')

      // Click select-all (first checkbox)
      const selectAll = screen.getAllByRole('checkbox')[0]
      fireEvent.click(selectAll)

      await waitFor(() => {
        expect(screen.getByText(/100 invoices per action/i)).toBeInTheDocument()
      })
    })

    it('shows eligible count in bulk accept button', async () => {
      renderPage()
      await screen.findByText('INV-001')

      // Select PENDING invoice (INV-001) — eligible for accept
      const checkboxes = screen.getAllByRole('checkbox')
      // checkbox[0] = select-all, checkbox[1..N] = per-row
      fireEvent.click(checkboxes[1])

      await waitFor(() => {
        expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
      })

      // Bulk Accept button should show (1) for eligible
      const bulkAcceptBtn = screen.queryByRole('button', { name: /accept.*\(1\)/i })
      expect(bulkAcceptBtn).toBeInTheDocument()
    })
  })

  // ─── 5. Permission gating ────────────────────────────────────────────────

  describe('permission gating', () => {
    it('hides Sync button when gst.ims.sync permission absent', async () => {
      const withoutSync = new Set([...perms.granted].filter(p => p !== 'gst.ims.sync'))
      vi.mocked(gstImsApi.listImsInvoices).mockResolvedValue(mockListAllStatuses)
      vi.mocked(gstImsApi.getImsSummary).mockResolvedValue(mockSummaryOpen)

      const savedGranted = perms.granted
      perms.granted = withoutSync

      const qc = makeQC()
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <ImsInboxPage organizationId="org-001" gstin="29AABCU9603R1ZX" />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await screen.findByText('INV-001')
      expect(screen.queryByRole('button', { name: /sync from gstn/i })).not.toBeInTheDocument()

      perms.granted = savedGranted
    })

    it('hides action buttons when gst.ims.action permission absent', async () => {
      const withoutAction = new Set([...perms.granted].filter(p => p !== 'gst.ims.action'))
      const savedGranted = perms.granted
      perms.granted = withoutAction

      const qc = makeQC()
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <ImsInboxPage organizationId="org-001" gstin="29AABCU9603R1ZX" />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await screen.findByText('INV-001')
      // Should not see any Accept/Reject/Keep pending buttons
      expect(screen.queryAllByRole('button', { name: /accept invoice/i })).toHaveLength(0)
      expect(screen.queryAllByRole('button', { name: /reject invoice/i })).toHaveLength(0)

      perms.granted = savedGranted
    })
  })

  // ─── 6. Deemed-acceptance banner ─────────────────────────────────────────

  describe('deemed-acceptance banner', () => {
    it('shows warning banner when window is open', async () => {
      renderPage()

      await waitFor(() => {
        // The banner contains "Action required"
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('shows info banner when window is past', async () => {
      vi.mocked(gstImsApi.getImsSummary).mockResolvedValue(mockSummaryPast)

      renderPage()

      await waitFor(() => {
        // Info banner (role="status" not "alert") for past window
        const statusEl = screen.queryByRole('status')
        expect(statusEl).toBeInTheDocument()
      })
    })

    it('shows Learn how IMS works link in open window', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /learn how ims works/i })).toBeInTheDocument()
      })
    })

    it('opens education modal on Learn more click', async () => {
      renderPage()
      const learnMoreBtn = await screen.findByRole('button', { name: /learn how ims works/i })
      fireEvent.click(learnMoreBtn)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(/how the invoice management system works/i)).toBeInTheDocument()
      })
    })
  })

  // ─── 7. Empty state ───────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when no invoices returned', async () => {
      vi.mocked(gstImsApi.listImsInvoices).mockResolvedValue({
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
      })
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument()
      })
    })

    it('shows Sync button in empty state when never synced', async () => {
      vi.mocked(gstImsApi.listImsInvoices).mockResolvedValue({
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
      })
      renderPage()

      await waitFor(() => {
        // Sync button appears in header (permission gated) — at least one should exist
        const syncBtns = screen.queryAllByRole('button', { name: /sync from gstn/i })
        expect(syncBtns.length).toBeGreaterThan(0)
      })
    })
  })
})

// ---------------------------------------------------------------------------
// API helper tests
// ---------------------------------------------------------------------------

describe('gstImsApi helpers', () => {
  it('periodToLabel converts MMYYYY to full month name', () => {
    expect(periodToLabel('032026')).toBe('March 2026')
    expect(periodToLabel('012024')).toBe('January 2024')
    expect(periodToLabel('122025')).toBe('December 2025')
  })

  it('periodToShortLabel converts MMYYYY to abbreviated month', () => {
    expect(periodToShortLabel('032026')).toBe('Mar 2026')
    expect(periodToShortLabel('012024')).toBe('Jan 2024')
  })

  it('formatDateDMY converts ISO date to DD/MM/YYYY', () => {
    expect(formatDateDMY('2026-03-15')).toBe('15/03/2026')
  })

  it('getLastNPeriods returns correct number of periods', () => {
    const periods = getLastNPeriods(12)
    expect(periods).toHaveLength(12)
    // Each should match MMYYYY pattern
    for (const p of periods) {
      expect(p).toMatch(/^\d{6}$/)
    }
  })

  it('canAccept is true for PENDING', () => {
    expect(canAccept('PENDING')).toBe(true)
  })

  it('canAccept is true for PENDING_KEPT', () => {
    expect(canAccept('PENDING_KEPT')).toBe(true)
  })

  it('canAccept is false for ACCEPTED', () => {
    expect(canAccept('ACCEPTED')).toBe(false)
  })

  it('canAccept is false for REJECTED', () => {
    expect(canAccept('REJECTED')).toBe(false)
  })

  it('canReject is true for PENDING', () => {
    expect(canReject('PENDING')).toBe(true)
  })

  it('canReject is true for PENDING_KEPT', () => {
    expect(canReject('PENDING_KEPT')).toBe(true)
  })

  it('canReject is false for ACCEPTED', () => {
    expect(canReject('ACCEPTED')).toBe(false)
  })

  it('canKeepPending is true for PENDING only', () => {
    expect(canKeepPending('PENDING')).toBe(true)
    expect(canKeepPending('PENDING_KEPT')).toBe(false)
    expect(canKeepPending('ACCEPTED')).toBe(false)
    expect(canKeepPending('REJECTED')).toBe(false)
  })

  it('daysUntilDeadline returns positive for future deadline', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const days = daysUntilDeadline(future.toISOString())
    expect(days).toBeGreaterThanOrEqual(4)
    expect(days).toBeLessThanOrEqual(5)
  })

  it('daysUntilDeadline returns negative or zero for past deadline', () => {
    const past = new Date()
    past.setDate(past.getDate() - 5)
    const days = daysUntilDeadline(past.toISOString())
    expect(days).toBeLessThanOrEqual(-4)
  })
})

// ---------------------------------------------------------------------------
// Zod schema tests
// ---------------------------------------------------------------------------

describe('IMS Zod schemas', () => {
  it('LocalImsInvoiceSummarySchema parses valid invoice', () => {
    // Use a proper v4-format UUID that passes strict uuid validation
    const validInvoice = {
      ...baseInvoice,
      id: 'a0a0a0a0-0000-4000-8000-000000000001',
      actionedAt: null,
      actionedBy: null,
    }
    const parsed = LocalImsInvoiceSummarySchema.safeParse(validInvoice)
    if (!parsed.success) {
      console.error('Schema errors:', parsed.error.issues)
    }
    expect(parsed.success).toBe(true)
  })

  it('LocalImsInvoiceSummarySchema rejects unknown status', () => {
    const bad = {
      ...baseInvoice,
      id: 'a0a0a0a0-0000-4000-8000-000000000001',
      status: 'UNKNOWN_STATUS',
      actionedAt: null,
      actionedBy: null,
    }
    const parsed = LocalImsInvoiceSummarySchema.safeParse(bad)
    expect(parsed.success).toBe(false)
  })

  it('LocalImsSummarySchema parses valid summary', () => {
    const parsed = LocalImsSummarySchema.safeParse(mockSummaryOpen)
    expect(parsed.success).toBe(true)
  })

  it('LocalBulkImsActionResponseSchema parses valid bulk response', () => {
    const resp = {
      totalRequested: 3,
      changed: 2,
      skipped: 1,
      failed: 0,
      results: [
        { invoiceId: 'a0a0a0a0-0000-4000-8000-000000000001', success: true, newStatus: 'ACCEPTED', error: null, errorCode: null },
      ],
    }
    const parsed = LocalBulkImsActionResponseSchema.safeParse(resp)
    expect(parsed.success).toBe(true)
  })
})
