/**
 * DocumentReviewPage — unit tests (Phase 7)
 *
 * All tests mock the `documentApi` module.
 * Covers: data loading, confidence colour coding, disabled approve/reject (contract gap B15).
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'

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

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('DocumentReviewPage (real API)', () => {
  beforeEach(() => {
    vi.spyOn(documentApi, 'getDocument').mockResolvedValue(mockDocWithOcr)
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

  it('Approve & Process button is disabled (contract gap B15)', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('invoice_march_2026.pdf')).toBeInTheDocument()
    })
    const approveButtons = screen.getAllByRole('button', { name: /Approve & Process/i })
    approveButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  it('Reject button is disabled (contract gap B15)', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('invoice_march_2026.pdf')).toBeInTheDocument()
    })
    const rejectButtons = screen.getAllByRole('button', { name: /Reject/i })
    rejectButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
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
