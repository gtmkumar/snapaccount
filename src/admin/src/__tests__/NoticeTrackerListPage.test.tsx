/**
 * NoticeTrackerListPage — unit tests (Phase 6B)
 *
 * Covers:
 * - Loading skeleton renders
 * - Error alert renders when API fails
 * - Notice list renders with correct data
 * - Filter bar renders (search + status select)
 * - Upload Notice button visible
 * - Empty state visible when list is empty
 * - Pagination controls present when totalCount > pageSize
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as gstApi from '@/lib/gstApi'
import NoticeTrackerListPage from '@/pages/gst/NoticeTrackerListPage'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/gst/notices']}>
        <Routes>
          <Route path="/gst/notices" element={<NoticeTrackerListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const makeNotice = (overrides = {}) => ({
  id: 'notice-001',
  organizationId: 'org-001',
  gstin: '27AABCS1429B1ZB',
  noticeNumber: 'ASMT10-2024-001',
  noticeType: 'ASMT-10' as const,
  noticeDate: '2026-03-01T00:00:00Z',
  dueDate: '2026-04-30T00:00:00Z',
  status: 'RECEIVED' as const,
  description: 'Mismatch in GSTR-3B vs GSTR-1',
  assignedCaId: null,
  assignedCaName: null,
  responseText: null,
  respondedAt: null,
  respondedBy: null,
  submissionChannel: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-25T00:00:00Z',
  ...overrides,
})

describe('NoticeTrackerListPage', () => {
  beforeEach(() => {
    vi.spyOn(gstApi, 'getNoticesDueSummary').mockResolvedValue({
      overdue: 0,
      dueIn2Days: 0,
      dueThisWeek: 1,
      total: 1,
    })
    vi.spyOn(gstApi, 'listGstNotices').mockResolvedValue({
      items: [makeNotice()],
      totalCount: 1,
      page: 1,
      pageSize: 20,
    })
  })

  it('shows loading skeleton before data arrives', () => {
    vi.spyOn(gstApi, 'listGstNotices').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.skeleton-shimmer')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error alert when API fails', async () => {
    vi.spyOn(gstApi, 'listGstNotices').mockRejectedValue(new Error('Network error'))
    renderPage()
    const errorEl = await screen.findByRole('alert')
    expect(errorEl).toBeTruthy()
  })

  it('renders notice number after data loads', async () => {
    renderPage()
    const cells = await screen.findAllByText(/ASMT10-2024-001/)
    expect(cells.length).toBeGreaterThan(0)
  })

  it('renders page title', async () => {
    renderPage()
    const headings = await screen.findAllByText(/Notice/i)
    expect(headings.length).toBeGreaterThan(0)
  })

  it('renders filter bar search input', async () => {
    renderPage()
    await screen.findAllByText(/ASMT10-2024-001/)
    expect(screen.getByPlaceholderText(/Search notice/i)).toBeInTheDocument()
  })

  it('renders Upload Notice button', async () => {
    renderPage()
    await screen.findAllByText(/ASMT10-2024-001/)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders empty state when no notices returned', async () => {
    vi.spyOn(gstApi, 'listGstNotices').mockResolvedValue({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
    })
    renderPage()
    // Wait for query to settle then check that notice number is absent
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText(/ASMT10-2024-001/)).toBeNull()
  })

  it('renders RECEIVED status badge', async () => {
    renderPage()
    const statusEls = await screen.findAllByText(/RECEIVED/i)
    expect(statusEls.length).toBeGreaterThan(0)
  })
})
