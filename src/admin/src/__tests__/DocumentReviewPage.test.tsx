/**
 * DocumentReviewPage — unit tests
 *
 * All tests mock the `documentApi` module.
 * Covers: data loading, OCR confidence display, review-decision mutations
 * (approve, reject, request-clarification, archive), RBAC permission gating,
 * modal validation, and error states.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'

// ── RBAC mock — user has document.review AND document.archive ─────────────────
const { perms } = vi.hoisted(() => ({
  perms: {
    loaded: true,
    granted: new Set<string>(['document.review', 'document.archive', 'document.read']),
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

import * as documentApi from '@/lib/documentApi'
import DocumentReviewPage from '@/pages/documents/DocumentReviewPage'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const mockDocumentId = 'dddddddd-0000-0000-0000-000000000001'

const mockDocWithOcr: documentApi.DocumentDetail = {
  id: mockDocumentId,
  userId: 'uuuuuuuu-0000-0000-0000-000000000001',
  fileName: 'invoice_march_2026.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 512000,
  status: 'OCR_COMPLETE',
  storageUrl: null,
  amount: 53100,
  vendorName: 'Sharma Trading Co.',
  documentDate: '2026-03-31',
  uploadedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  ocrConfidence: 0.87,
  ocrConfidenceLevel: 'GREEN',
  fields: [
    { name: 'invoiceNumber', value: 'INV-2026-00234', confidence: 0.95 },
    { name: 'invoiceDate', value: '31/03/2026', confidence: 0.88 },
    { name: 'vendorGstin', value: '27AABCS1429B1ZB', confidence: 0.91 },
    { name: 'taxableAmount', value: '45000', confidence: 0.60 }, // yellow band
    { name: 'paymentMode', value: 'Bank Transfer', confidence: 0.43 }, // red band
  ],
}

const mockDocNoOcr: documentApi.DocumentDetail = {
  ...mockDocWithOcr,
  ocrConfidence: null,
  ocrConfidenceLevel: null,
  fields: null,
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function renderPage(docId = mockDocumentId) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[`/documents/${docId}`]}>
        <Routes>
          <Route path="/documents/:id" element={<DocumentReviewPage />} />
          <Route path="/documents" element={<div>Queue</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests — data loading ──────────────────────────────────────────────────────
describe('DocumentReviewPage — data loading', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
    vi.spyOn(documentApi, 'approveDocument').mockResolvedValue({ message: 'approved' })
    vi.spyOn(documentApi, 'rejectDocument').mockResolvedValue({ message: 'rejected' })
    vi.spyOn(documentApi, 'requestDocumentClarification').mockResolvedValue({ message: 'sent' })
    vi.spyOn(documentApi, 'archiveDocument').mockResolvedValue({ message: 'archived' })
  })

  it('calls getDocument with the route param id on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(documentApi.getDocument).toHaveBeenCalledWith(mockDocumentId)
    })
  })

  it('renders the document filename in the header after load', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('invoice_march_2026.pdf')).toBeInTheDocument()
    })
  })

  it('renders vendor name when present', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sharma Trading Co.')).toBeInTheDocument()
    })
  })

  it('renders all OCR field names', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('invoiceNumber')).toBeInTheDocument()
      expect(screen.getByText('vendorGstin')).toBeInTheDocument()
      expect(screen.getByText('taxableAmount')).toBeInTheDocument()
    })
  })

  it('renders the OCR confidence percentage (87%)', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('OCR 87%')).toBeInTheDocument()
    })
  })

  it('renders confidence percentages for individual fields', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('95%')).toBeInTheDocument() // invoiceNumber confidence
      expect(screen.getByText('43%')).toBeInTheDocument() // paymentMode confidence
    })
  })

  it('shows low-confidence fields count badge', async () => {
    renderPage()
    await waitFor(() => {
      // taxableAmount (60% — yellow) + paymentMode (43% — red) = 2 fields < 80%
      expect(screen.getByText(/2 fields need review/)).toBeInTheDocument()
    })
  })

  it('renders "No OCR fields extracted yet" when fields are null', async () => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocNoOcr)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No OCR fields extracted yet')).toBeInTheDocument()
    })
  })

  it('renders loading state while fetching', () => {
    vi.spyOn(documentApi, 'getDocument').mockImplementation(
      () => new Promise(() => undefined), // never resolves
    )
    renderPage()
    expect(screen.getByText('Loading document…')).toBeInTheDocument()
  })

  it('renders error state when getDocument rejects', async () => {
    vi.spyOn(documentApi, 'getDocument').mockRejectedValue(new Error('Not found'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Failed to load document')).toBeInTheDocument()
    })
  })

  it('renders image when storageUrl is present', async () => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue({
      ...mockDocWithOcr,
      storageUrl: 'https://storage.googleapis.com/bucket/test.pdf',
    })
    renderPage()
    await waitFor(() => {
      const img = screen.getByRole('img', { name: 'invoice_march_2026.pdf' })
      expect(img).toBeInTheDocument()
      expect((img as HTMLImageElement).src).toContain('storage.googleapis.com')
    })
  })

  it('shows placeholder when storageUrl is null', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Document image viewer')).toBeInTheDocument()
    })
  })
})

// ── Tests — action buttons visible when user has permissions ──────────────────
describe('DocumentReviewPage — action buttons (with document.review + document.archive)', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
    vi.spyOn(documentApi, 'approveDocument').mockResolvedValue({ message: 'approved' })
    vi.spyOn(documentApi, 'rejectDocument').mockResolvedValue({ message: 'rejected' })
    vi.spyOn(documentApi, 'requestDocumentClarification').mockResolvedValue({ message: 'sent' })
    vi.spyOn(documentApi, 'archiveDocument').mockResolvedValue({ message: 'archived' })
  })

  it('renders Approve & Process buttons (enabled, gated by document.review)', async () => {
    renderPage()
    await waitFor(() => {
      const approveButtons = screen.getAllByRole('button', { name: /Approve & Process/i })
      expect(approveButtons.length).toBeGreaterThanOrEqual(1)
      approveButtons.forEach((btn) => expect(btn).not.toBeDisabled())
    })
  })

  it('renders Reject buttons (enabled, gated by document.review)', async () => {
    renderPage()
    await waitFor(() => {
      const rejectButtons = screen.getAllByRole('button', { name: /^Reject$/i })
      expect(rejectButtons.length).toBeGreaterThanOrEqual(1)
      rejectButtons.forEach((btn) => expect(btn).not.toBeDisabled())
    })
  })

  it('renders Request Clarification button', async () => {
    renderPage()
    await waitFor(() => {
      const clarifyButtons = screen.getAllByRole('button', { name: /Request Clarification/i })
      expect(clarifyButtons.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders Archive button', async () => {
    renderPage()
    await waitFor(() => {
      const archiveButtons = screen.getAllByRole('button', { name: /Archive/i })
      expect(archiveButtons.length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ── Tests — approve mutation ──────────────────────────────────────────────────
describe('DocumentReviewPage — approve mutation', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
    vi.spyOn(documentApi, 'approveDocument').mockResolvedValue({ message: 'approved' })
    vi.spyOn(documentApi, 'rejectDocument').mockResolvedValue({ message: 'rejected' })
    vi.spyOn(documentApi, 'requestDocumentClarification').mockResolvedValue({ message: 'sent' })
    vi.spyOn(documentApi, 'archiveDocument').mockResolvedValue({ message: 'archived' })
  })

  it('calls approveDocument when Approve & Process clicked', async () => {
    renderPage()
    const approveBtn = (await screen.findAllByRole('button', { name: /Approve & Process/i }))[0]
    fireEvent.click(approveBtn)
    await waitFor(() => {
      expect(documentApi.approveDocument).toHaveBeenCalledWith(mockDocumentId)
    })
  })
})

// ── Tests — reject modal ──────────────────────────────────────────────────────
describe('DocumentReviewPage — reject modal', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
    vi.spyOn(documentApi, 'approveDocument').mockResolvedValue({ message: 'approved' })
    vi.spyOn(documentApi, 'rejectDocument').mockResolvedValue({ message: 'rejected' })
    vi.spyOn(documentApi, 'requestDocumentClarification').mockResolvedValue({ message: 'sent' })
    vi.spyOn(documentApi, 'archiveDocument').mockResolvedValue({ message: 'archived' })
  })

  it('opens reject modal when Reject clicked', async () => {
    renderPage()
    const rejectBtn = (await screen.findAllByRole('button', { name: /^Reject$/i }))[0]
    fireEvent.click(rejectBtn)
    await waitFor(() => {
      expect(screen.getByText('Reject Document')).toBeInTheDocument()
    })
  })

  it('shows validation error when submitting empty reason', async () => {
    renderPage()
    const rejectBtn = (await screen.findAllByRole('button', { name: /^Reject$/i }))[0]
    fireEvent.click(rejectBtn)
    await waitFor(() => screen.getByText('Reject Document'))

    const confirmBtn = screen.getByRole('button', { name: /Confirm Reject/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText('A rejection reason is required')).toBeInTheDocument()
    })
    expect(documentApi.rejectDocument).not.toHaveBeenCalled()
  })

  it('calls rejectDocument with reason when modal submitted', async () => {
    renderPage()
    const rejectBtn = (await screen.findAllByRole('button', { name: /^Reject$/i }))[0]
    fireEvent.click(rejectBtn)
    await waitFor(() => screen.getByText('Reject Document'))

    fireEvent.change(screen.getByPlaceholderText(/Explain why this document/i), {
      target: { value: 'Poor image quality' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Confirm Reject/i }))

    await waitFor(() => {
      expect(documentApi.rejectDocument).toHaveBeenCalledWith(mockDocumentId, 'Poor image quality')
    })
  })
})

// ── Tests — clarification modal ───────────────────────────────────────────────
describe('DocumentReviewPage — clarification modal', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
    vi.spyOn(documentApi, 'approveDocument').mockResolvedValue({ message: 'approved' })
    vi.spyOn(documentApi, 'rejectDocument').mockResolvedValue({ message: 'rejected' })
    vi.spyOn(documentApi, 'requestDocumentClarification').mockResolvedValue({ message: 'sent' })
    vi.spyOn(documentApi, 'archiveDocument').mockResolvedValue({ message: 'archived' })
  })

  it('opens clarification modal when Request Clarification clicked', async () => {
    renderPage()
    // Wait for the document to load
    await screen.findByText('invoice_march_2026.pdf')
    // Click the first Request Clarification button (footer panel)
    const clarifyBtns = screen.getAllByRole('button', { name: /Request Clarification/i })
    fireEvent.click(clarifyBtns[0])
    // The modal has a Send Request button as proof it opened
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send Request/i })).toBeInTheDocument()
    })
  })

  it('shows validation error when submitting empty message', async () => {
    renderPage()
    await screen.findByText('invoice_march_2026.pdf')
    const clarifyBtns = screen.getAllByRole('button', { name: /Request Clarification/i })
    fireEvent.click(clarifyBtns[0])
    await waitFor(() => screen.getByRole('button', { name: /Send Request/i }))

    fireEvent.click(screen.getByRole('button', { name: /Send Request/i }))

    await waitFor(() => {
      expect(screen.getByText('A message is required')).toBeInTheDocument()
    })
    expect(documentApi.requestDocumentClarification).not.toHaveBeenCalled()
  })

  it('calls requestDocumentClarification with message when submitted', async () => {
    renderPage()
    await screen.findByText('invoice_march_2026.pdf')
    const clarifyBtns = screen.getAllByRole('button', { name: /Request Clarification/i })
    fireEvent.click(clarifyBtns[0])
    await waitFor(() => screen.getByRole('button', { name: /Send Request/i }))

    fireEvent.change(screen.getByPlaceholderText(/Describe what clarification/i), {
      target: { value: 'Please provide a clearer scan' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Send Request/i }))

    await waitFor(() => {
      expect(documentApi.requestDocumentClarification).toHaveBeenCalledWith(
        mockDocumentId,
        'Please provide a clearer scan',
      )
    })
  })
})

// ── Tests — archive confirm modal ─────────────────────────────────────────────
describe('DocumentReviewPage — archive confirm modal', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
    vi.spyOn(documentApi, 'approveDocument').mockResolvedValue({ message: 'approved' })
    vi.spyOn(documentApi, 'rejectDocument').mockResolvedValue({ message: 'rejected' })
    vi.spyOn(documentApi, 'requestDocumentClarification').mockResolvedValue({ message: 'sent' })
    vi.spyOn(documentApi, 'archiveDocument').mockResolvedValue({ message: 'archived' })
  })

  it('opens archive confirm modal when Archive clicked', async () => {
    renderPage()
    await screen.findByText('invoice_march_2026.pdf')
    const archiveBtns = screen.getAllByRole('button', { name: /Archive/i })
    fireEvent.click(archiveBtns[0])
    await waitFor(() => {
      expect(screen.getByText('Archive document?')).toBeInTheDocument()
    })
  })

  it('calls archiveDocument when archive confirmed via modal', async () => {
    renderPage()
    await screen.findByText('invoice_march_2026.pdf')
    const archiveBtns = screen.getAllByRole('button', { name: /Archive/i })
    fireEvent.click(archiveBtns[0])
    // Wait for modal to appear (has the title heading)
    await waitFor(() => screen.getByText('Archive document?'))

    // The modal confirmation button is the one inside the dialog footer
    // After modal opens there will be multiple Archive buttons — pick the last one (modal confirm)
    const allArchiveBtns = screen.getAllByRole('button', { name: /Archive/i })
    fireEvent.click(allArchiveBtns[allArchiveBtns.length - 1])

    await waitFor(() => {
      expect(documentApi.archiveDocument).toHaveBeenCalledWith(mockDocumentId)
    })
  })
})
