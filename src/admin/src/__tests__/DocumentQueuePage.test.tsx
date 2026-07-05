/**
 * DocumentQueuePage — unit tests (Phase 7 rewrite, DG-DOC-04)
 *
 * DG-DOC-04: page was rewritten to use getAdminDocumentQueue
 * (GET /documents/admin/queue) instead of listDocuments.
 * Mocks and fixtures updated accordingly.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

// ── RBAC mock ───────────────────────────────────────────────────────────────
const { perms } = vi.hoisted(() => ({
  perms: { loaded: true, granted: new Set<string>(['document.read', 'document.update']) },
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

// ── API mock — target getAdminDocumentQueue (DG-DOC-04) ─────────────────────
import * as documentApi from '@/lib/documentApi'

import DocumentQueuePage from '@/pages/documents/DocumentQueuePage'

// ── Fixtures — AdminDocumentQueueItem shape (has server SLA fields) ─────────
const recentUpload = new Date(Date.now() - 2 * 3600000).toISOString()
const overdueUpload = new Date(Date.now() - 30 * 3600000).toISOString() // > 24h ago

const mockQueuePage: documentApi.AdminDocumentQueuePage = {
  items: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      fileName: 'invoice_sharma.pdf',
      status: 'OCR_COMPLETE',
      categoryCode: 'PURCHASE',
      categoryName: 'Purchase Bill',
      vendorName: 'Sharma Trading Co.',
      amount: 45000,
      documentDate: '2026-03-31',
      uploadedAt: recentUpload,
      slaDeadline: new Date(Date.now() + 20 * 3600000).toISOString(), // 20h from now
      slaHoursRemaining: 20,
      isOverdue: false,
      organizationId: 'org-0001-0000-0000-000000000001',
      ocrConfidence: 0.92,
    },
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      fileName: 'bank_statement_march.pdf',
      status: 'UPLOADED',
      categoryCode: null,
      categoryName: null,
      vendorName: null,
      amount: null,
      documentDate: null,
      uploadedAt: overdueUpload,
      slaDeadline: new Date(Date.now() - 6 * 3600000).toISOString(), // 6h overdue
      slaHoursRemaining: -6,
      isOverdue: true,
      organizationId: 'org-0001-0000-0000-000000000001',
      ocrConfidence: null,
    },
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000003',
      fileName: 'expense_receipt.jpg',
      status: 'IN_REVIEW',
      categoryCode: 'EXPENSE',
      categoryName: 'Expense Receipt',
      vendorName: 'Patel Textiles',
      amount: 12500,
      documentDate: '2026-03-28',
      uploadedAt: recentUpload,
      slaDeadline: new Date(Date.now() + 10 * 3600000).toISOString(),
      slaHoursRemaining: 10,
      isOverdue: false,
      organizationId: 'org-0001-0000-0000-000000000001',
      ocrConfidence: 0.67,
    },
  ],
  totalCount: 3,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <DocumentQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('DocumentQueuePage (real API)', () => {
  beforeEach(() => {
    perms.loaded = true
    perms.granted = new Set<string>(['document.read', 'document.update'])
    // DG-DOC-04: page calls getAdminDocumentQueue, not listDocuments
    vi.spyOn(documentApi, 'getAdminDocumentQueue').mockResolvedValue(mockQueuePage)
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByText('Document Queue')).toBeInTheDocument()
  })

  it('calls getAdminDocumentQueue API on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(documentApi.getAdminDocumentQueue).toHaveBeenCalled()
    })
  })

  it('renders document rows from the API response', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    expect(screen.getByText('invoice_sharma.pdf')).toBeInTheDocument()
    expect(screen.getByText('Patel Textiles')).toBeInTheDocument()
  })

  it('renders OCR_COMPLETE, UPLOADED and IN_REVIEW status badges', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    const statuses = screen.getAllByText(/OCR Complete|Uploaded|In Review/)
    expect(statuses.length).toBeGreaterThan(0)
  })

  it('shows SLA overdue badge for documents with isOverdue=true', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    // Item 2 has isOverdue=true — server sets the flag, SlaChip renders "Overdue"
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('shows SLA breach alert banner when overdue documents exist', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('SLA Breaches Detected')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows total count in subtitle from API response', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/3 documents pending review/)).toBeInTheDocument()
    })
  })

  it('status filter select exists and can be changed', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    const statusSelect = screen.getByRole('combobox', { name: /status/i })
    expect(statusSelect).toBeInTheDocument()
    fireEvent.change(statusSelect, { target: { value: 'UPLOADED' } })
    expect((statusSelect as HTMLSelectElement).value).toBe('UPLOADED')
  })

  it('OCR confidence filter select exists', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    const ocrSelect = screen.getByRole('combobox', { name: /OCR Confidence/i })
    expect(ocrSelect).toBeInTheDocument()
  })

  it('renders Review buttons for each row when user has document.read', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    const reviewButtons = screen.getAllByRole('button', { name: 'Review' })
    expect(reviewButtons.length).toBeGreaterThan(0)
  })

  it('renders Assign buttons when user has document.update', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    const assignButtons = screen.getAllByRole('button', { name: 'Assign' })
    expect(assignButtons.length).toBeGreaterThan(0)
  })

  it('hides Review/Assign/Export buttons when user has no document permissions', async () => {
    perms.granted = new Set<string>()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Export/i })).not.toBeInTheDocument()
  })

  it('shows Review but hides Assign for read-only user', async () => {
    perms.granted = new Set<string>(['document.read'])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: 'Review' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
  })

  it('shows an error banner and retry when getAdminDocumentQueue rejects', async () => {
    vi.spyOn(documentApi, 'getAdminDocumentQueue').mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Failed to load document queue')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('re-calls getAdminDocumentQueue with status param when filter changes', async () => {
    renderPage()
    // Wait for initial data to appear before changing filter
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
    const statusSelect = screen.getByRole('combobox', { name: /status/i })
    fireEvent.change(statusSelect, { target: { value: 'UPLOADED' } })
    await waitFor(() => {
      expect(documentApi.getAdminDocumentQueue).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'UPLOADED' }),
      )
    })
  })
})
