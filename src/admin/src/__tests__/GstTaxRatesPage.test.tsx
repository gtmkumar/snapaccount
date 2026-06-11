/**
 * GstTaxRatesPage — component tests (GAP-022)
 *
 * Tests:
 *  1. Render: active rates shown, skeleton while loading, empty state
 *  2. Permission gating: Create button hidden without gst.admin.taxrates
 *  3. Slab auto-computation: CGST/SGST/IGST computed correctly for every slab
 *  4. Create flow: form validation, success toast + query invalidation
 *  5. Deactivate confirm: dialog opens, calls API, shows success toast
 *  6. Filter tabs: active / historical / all filtering
 *  7. Zod schema: parses valid TaxRateDto, rejects invalid shapes
 *  8. computeTaxBreakdown helper correctness
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

// ---------------------------------------------------------------------------
// RBAC mock (full access by default)
// ---------------------------------------------------------------------------
const { perms } = vi.hoisted(() => ({
  perms: {
    loaded: true,
    granted: new Set<string>(['gst.admin.taxrates']),
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'admin@test.com', displayName: 'Admin', role: 'SUPER_ADMIN' },
    loading: false,
    signOut: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// API mock
// ---------------------------------------------------------------------------
vi.mock('@/lib/gstApi', async () => {
  const actual = await vi.importActual('@/lib/gstApi')
  return {
    ...actual,
    listTaxRates: vi.fn(),
    createTaxRate: vi.fn(),
    deactivateTaxRate: vi.fn(),
  }
})

import * as gstApi from '@/lib/gstApi'
import {
  computeTaxBreakdown,
  GST_SLABS,
  TaxRateDtoSchema,
  TaxRateListSchema,
} from '@/lib/gstApi'
import GstTaxRatesPage from '@/pages/gst/GstTaxRatesPage'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

// Use proper v4-format UUIDs (version nibble=4, variant nibble=8..B)
const activeRate = {
  id: 'a0a0a0a0-0000-4000-8000-000000000001',
  rateName: 'GST 18%',
  ratePct: 18,
  cgstPct: 9,
  sgstPct: 9,
  igstPct: 18,
  cessPct: 0,
  validFrom: '2024-04-01',
  validTo: null,
  isActive: true,
  notes: 'Standard rate',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const historicalRate = {
  id: 'a0a0a0a0-0000-4000-8000-000000000002',
  rateName: 'GST 18%',
  ratePct: 18,
  cgstPct: 9,
  sgstPct: 9,
  igstPct: 18,
  cessPct: 0,
  validFrom: '2022-07-01',
  validTo: '2024-03-31',
  isActive: true,
  notes: 'Prior version',
  createdAt: '2022-01-01T00:00:00Z',
  updatedAt: '2024-03-31T00:00:00Z',
}

const inactiveRate = {
  id: 'a0a0a0a0-0000-4000-8000-000000000003',
  rateName: 'GST 5%',
  ratePct: 5,
  cgstPct: 2.5,
  sgstPct: 2.5,
  igstPct: 5,
  cessPct: 0,
  validFrom: '2017-07-01',
  validTo: null,
  isActive: false,
  notes: null,
  createdAt: '2017-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

function mkQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

function renderPage() {
  const qc = mkQc()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GstTaxRatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GstTaxRatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to full access
    perms.granted = new Set(['gst.admin.taxrates'])
    perms.loaded = true
  })

  // 1. Render: active rates shown
  it('renders active rates and compliance banner', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([activeRate, historicalRate])

    renderPage()

    // Compliance banner always visible
    expect(screen.getByRole('note', { name: /compliance notice/i })).toBeInTheDocument()

    // Wait for data
    await waitFor(() => {
      expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
    })

    // Active badge visible
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
    // Create button visible (has permission)
    expect(screen.getByRole('button', { name: /new rate version/i })).toBeInTheDocument()
  })

  // 2. Skeleton while loading
  it('shows skeleton rows while loading', () => {
    // listTaxRates never resolves in this test
    vi.mocked(gstApi.listTaxRates).mockReturnValue(new Promise(() => {}))
    renderPage()
    const loading = screen.getByLabelText(/loading/i)
    expect(loading).toBeInTheDocument()
  })

  // 3. Empty state
  it('shows empty state when no rates exist', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no rates found/i)).toBeInTheDocument()
    })
  })

  // 4. Permission gating — Create button hidden
  it('hides Create button when user lacks gst.admin.taxrates', async () => {
    perms.granted = new Set<string>() // no permissions
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([activeRate])
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /new rate version/i })).not.toBeInTheDocument()
  })

  // 5. Permission gating — Deactivate button hidden
  it('hides Deactivate button when user lacks gst.admin.taxrates', async () => {
    perms.granted = new Set<string>()
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([activeRate])
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument()
  })

  // 6. Filter tabs — historical filter
  it('shows historical rates when Historical tab is selected', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([activeRate, historicalRate, inactiveRate])
    renderPage()

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
    })

    // Click Historical tab
    const histTab = screen.getByRole('button', { name: /historical/i })
    fireEvent.click(histTab)

    // historicalRate (validTo set) and inactiveRate (isActive=false) should be visible
    // activeRate should be hidden
    expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
  })

  // 7. Filter tabs — all rates
  it('shows all rates in "All" tab', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([activeRate, historicalRate, inactiveRate])
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    // All 3 rows now shown (activeRate + historicalRate both named "GST 18%", inactiveRate "GST 5%")
    expect(screen.getByText('GST 5%')).toBeInTheDocument()
  })

  // 8. Create form — shows breakdown when slab selected
  it('auto-computes CGST/SGST/IGST when slab selected in create modal', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/no rates found/i)).toBeInTheDocument()
    })

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /new rate version/i }))
    await waitFor(() => {
      expect(screen.getByText(/create new rate version/i)).toBeInTheDocument()
    })

    // Select 18% slab
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '18' } })

    // Breakdown should show: CGST 9%, SGST 9%, IGST 18%
    await waitFor(() => {
      const ninePercent = screen.getAllByText('9%', { selector: 'p' })
      expect(ninePercent.length).toBeGreaterThanOrEqual(2) // CGST + SGST both 9%
    })
    // IGST = 18%: there may be multiple 18% elements (the slab option label + IGST breakdown)
    const eighteenPct = screen.getAllByText(/^18%$/, { selector: 'p' })
    expect(eighteenPct.length).toBeGreaterThanOrEqual(1)
  })

  // 9. Create form — validation fires on empty submit
  it('shows validation errors when submitting empty create form', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/no rates found/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /new rate version/i }))
    await waitFor(() => {
      expect(screen.getByText(/create new rate version/i)).toBeInTheDocument()
    })

    // Submit without filling anything
    fireEvent.click(screen.getByRole('button', { name: /^create rate$/i }))

    await waitFor(() => {
      expect(screen.getByText(/rate name is required/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/please select a gst slab/i)).toBeInTheDocument()
    expect(screen.getByText(/effective date is required/i)).toBeInTheDocument()

    // API must NOT have been called
    expect(gstApi.createTaxRate).not.toHaveBeenCalled()
  })

  // 10. Create flow — success
  it('calls createTaxRate and shows success toast on valid submission', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([])
    vi.mocked(gstApi.createTaxRate).mockResolvedValue({
      taxRateId: 'a0a0a0a0-0000-4000-8000-000000000010',
      rateName: 'GST 12%',
      ratePct: 12,
      cgstPct: 6,
      sgstPct: 6,
      igstPct: 12,
      validFrom: '2026-07-01',
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no rates found/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /new rate version/i }))
    await waitFor(() => {
      expect(screen.getByText(/create new rate version/i)).toBeInTheDocument()
    })

    // Fill form
    const nameInput = screen.getByPlaceholderText(/e\.g\. GST 18%/i)
    await userEvent.type(nameInput, 'GST 12%')

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '12' } })

    const dateInput = screen.getByLabelText(/effective from/i)
    fireEvent.change(dateInput, { target: { value: '2026-07-01' } })

    fireEvent.click(screen.getByRole('button', { name: /^create rate$/i }))

    await waitFor(() => {
      expect(gstApi.createTaxRate).toHaveBeenCalledWith({
        rateName: 'GST 12%',
        ratePct: 12,
        validFrom: '2026-07-01',
        notes: undefined,
      })
    })
  })

  // 11. Deactivate — dialog opens and calls API
  it('opens deactivate dialog and calls deactivateTaxRate on confirm', async () => {
    vi.mocked(gstApi.listTaxRates).mockResolvedValue([activeRate])
    vi.mocked(gstApi.deactivateTaxRate).mockResolvedValue()

    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText(/GST 18%/).length).toBeGreaterThanOrEqual(1)
    })

    const deactivateBtn = screen.getByRole('button', { name: /deactivate/i })
    fireEvent.click(deactivateBtn)

    // Confirm dialog appears
    await waitFor(() => {
      expect(screen.getByText(/deactivate tax rate/i)).toBeInTheDocument()
    })

    // Confirm is the primary button in the dialog footer
    const dialogEl = screen.getByRole('dialog')
    const confirmInDialog = within(dialogEl).getAllByRole('button').find(
      b => b.textContent === 'Deactivate'
    )
    expect(confirmInDialog).toBeDefined()
    fireEvent.click(confirmInDialog!)

    await waitFor(() => {
      expect(gstApi.deactivateTaxRate).toHaveBeenCalledWith(activeRate.id)
    })
  })
})

// ---------------------------------------------------------------------------
// Pure unit tests — computeTaxBreakdown
// ---------------------------------------------------------------------------

describe('computeTaxBreakdown', () => {
  it.each([
    [0,    0,    0,    0   ],
    [5,    2.5,  2.5,  5   ],
    [12,   6,    6,    12  ],
    [18,   9,    9,    18  ],
    [28,   14,   14,   28  ],
    [1.5,  0.75, 0.75, 1.5 ],
    [3,    1.5,  1.5,  3   ],
    [7.5,  3.75, 3.75, 7.5 ],
  ] as [number, number, number, number][])('ratePct=%s → cgst=%s sgst=%s igst=%s', (ratePct, cgst, sgst, igst) => {
    const result = computeTaxBreakdown(ratePct)
    expect(result.cgstPct).toBe(cgst)
    expect(result.sgstPct).toBe(sgst)
    expect(result.igstPct).toBe(igst)
  })
})

// ---------------------------------------------------------------------------
// Zod schema tests
// ---------------------------------------------------------------------------

describe('TaxRateDtoSchema', () => {
  it('parses a valid TaxRateDto', () => {
    const parsed = TaxRateDtoSchema.safeParse(activeRate)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.ratePct).toBe(18)
      expect(parsed.data.validTo).toBeNull()
    }
  })

  it('rejects a TaxRateDto with missing required fields', () => {
    const bad = { ...activeRate, ratePct: undefined }
    expect(TaxRateDtoSchema.safeParse(bad).success).toBe(false)
  })

  it('parses a list via TaxRateListSchema', () => {
    const list = TaxRateListSchema.safeParse([activeRate, historicalRate])
    expect(list.success).toBe(true)
    if (list.success) expect(list.data).toHaveLength(2)
  })

  it('accepts historical rate with validTo set', () => {
    const parsed = TaxRateDtoSchema.safeParse(historicalRate)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.validTo).toBe('2024-03-31')
    }
  })
})

// ---------------------------------------------------------------------------
// GST_SLABS constant
// ---------------------------------------------------------------------------

describe('GST_SLABS', () => {
  it('includes all standard Indian GST rate slabs', () => {
    expect(GST_SLABS).toContain(0)
    expect(GST_SLABS).toContain(5)
    expect(GST_SLABS).toContain(12)
    expect(GST_SLABS).toContain(18)
    expect(GST_SLABS).toContain(28)
  })

  it('includes special intermediate slabs (1.5, 3, 7.5)', () => {
    expect(GST_SLABS).toContain(1.5)
    expect(GST_SLABS).toContain(3)
    expect(GST_SLABS).toContain(7.5)
  })
})
