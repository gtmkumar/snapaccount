/**
 * ChatInboxPage — Phase 6F smoke tests
 * Covers: filter by category, status, search; bulk-resolve trigger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as chatApi from '@/lib/chatApi'
import ChatInboxPage from '@/pages/chat/ChatInboxPage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useChatHub', () => ({
  useChatHub: vi.fn(() => ({
    isConnected: false,
    joinThread: vi.fn(),
    leaveThread: vi.fn(),
  })),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

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
      <MemoryRouter initialEntries={['/chat']}>
        <ChatInboxPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const makeThread = (overrides: Partial<chatApi.ThreadSummary> = {}): chatApi.ThreadSummary => ({
  threadId: 'thread-001',
  category: 'general',
  status: 'open',
  subject: 'Test subject',
  unreadCount: 2,
  lastMessageAt: '2024-03-01T10:00:00Z',
  assignedToUserId: null,
  ...overrides,
})

const mockListResponse = {
  items: [
    makeThread({ threadId: 'thread-001', category: 'general', status: 'open', subject: 'GST query' }),
    makeThread({ threadId: 'thread-002', category: 'loan', status: 'pending-user', subject: 'Loan help', unreadCount: 0 }),
    makeThread({ threadId: 'thread-003', category: 'gst-notice', status: 'escalated', subject: 'Notice received', unreadCount: 1 }),
  ],
  totalCount: 3,
  pageNumber: 1,
  pageSize: 50,
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(chatApi, 'listThreads').mockResolvedValue(mockListResponse)
  vi.spyOn(chatApi, 'markThreadRead').mockResolvedValue(undefined)
  vi.spyOn(chatApi, 'resolveThread').mockResolvedValue(undefined)
  vi.spyOn(chatApi, 'assignThread').mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Thread list rendering
// ---------------------------------------------------------------------------

describe('ChatInboxPage', () => {
  it('renders page title', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Chat')).toBeInTheDocument())
  })

  it('renders thread subjects after data loads', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('GST query')).toBeInTheDocument()
      expect(screen.getByText('Loan help')).toBeInTheDocument()
      expect(screen.getByText('Notice received')).toBeInTheDocument()
    })
  })

  it('shows unread badge count for threads with unread messages', async () => {
    renderPage()
    await waitFor(() => {
      // Inbox header shows total unread thread count — two threads have unreadCount > 0
      const badges = screen.getAllByText(/2|1/)
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  it('renders Compose button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Compose')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Filter by status
  // ---------------------------------------------------------------------------

  it('renders status filter buttons', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('open')).toBeInTheDocument()
      expect(screen.getByText('resolved')).toBeInTheDocument()
    })
  })

  it('clicking a status filter chip updates active filter styling', async () => {
    renderPage()
    await waitFor(() => screen.getByText('open'))

    const openFilter = screen.getByRole('button', { name: 'open' })
    fireEvent.click(openFilter)
    // After click, button should have brand-primary style
    expect(openFilter.className).toMatch(/bg-\[var\(--brand-primary\)\]/)
  })

  it('clicking the All filter resets status filter', async () => {
    renderPage()
    await waitFor(() => screen.getByText('All'))

    const allBtn = screen.getByRole('button', { name: 'All' })
    fireEvent.click(allBtn)
    expect(allBtn.className).toMatch(/bg-\[var\(--brand-primary\)\]/)
  })

  // ---------------------------------------------------------------------------
  // Filter by category
  // ---------------------------------------------------------------------------

  it('renders category chips', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'loan' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'general' })).toBeInTheDocument()
    })
  })

  it('clicking a category chip filters thread list client-side', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    // Click "loan" category — only Loan help should remain visible
    const loanChip = screen.getByRole('button', { name: 'loan' })
    fireEvent.click(loanChip)
    expect(loanChip.className).toMatch(/bg-amber-500/)

    // Wait for the new query to resolve and filtered results to show
    await waitFor(() => {
      expect(screen.getByText('Loan help')).toBeInTheDocument()
    })
    // "GST query" is in general category — should be filtered out
    expect(screen.queryByText('GST query')).not.toBeInTheDocument()
  })

  it('clicking a selected category chip deselects it', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    const loanChip = screen.getByRole('button', { name: 'loan' })
    fireEvent.click(loanChip)
    fireEvent.click(loanChip) // toggle off

    // all threads visible again
    expect(screen.getByText('GST query')).toBeInTheDocument()
    expect(screen.getByText('Loan help')).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  it('search input filters threads by subject', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    const searchInput = screen.getByPlaceholderText('Search threads…')
    fireEvent.change(searchInput, { target: { value: 'Loan' } })

    expect(screen.queryByText('GST query')).not.toBeInTheDocument()
    expect(screen.getByText('Loan help')).toBeInTheDocument()
  })

  it('search returns empty state with Clear filters button when no match', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    const searchInput = screen.getByPlaceholderText('Search threads…')
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } })

    await waitFor(() => {
      expect(screen.getByText('Clear filters')).toBeInTheDocument()
    })
  })

  it('clicking Clear filters resets search and status filter', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    const searchInput = screen.getByPlaceholderText('Search threads…')
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } })

    await waitFor(() => screen.getByText('Clear filters'))
    fireEvent.click(screen.getByText('Clear filters'))

    await waitFor(() => {
      expect(screen.getByText('GST query')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Bulk resolve trigger
  // ---------------------------------------------------------------------------

  it('shows bulk toolbar when thread checkbox is checked', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    // Make the checkbox visible via hover isn't possible in jsdom — use aria-label
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    fireEvent.click(checkboxes.find(c => c.getAttribute('aria-label')?.startsWith('Select thread'))!)

    await waitFor(() => {
      expect(screen.getByText(/1 selected/)).toBeInTheDocument()
      expect(screen.getByText('Resolve')).toBeInTheDocument()
    })
  })

  it('Resolve bulk action calls resolveThread for each selected id', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes.find(c => c.getAttribute('aria-label')?.startsWith('Select thread'))!)

    await waitFor(() => screen.getByText('Resolve'))
    fireEvent.click(screen.getByText('Resolve'))

    await waitFor(() => {
      expect(chatApi.resolveThread).toHaveBeenCalled()
      // TanStack Query passes (variables, context) to mutationFn; verify first arg
      const firstCallArgs = (chatApi.resolveThread as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(firstCallArgs[0]).toBe('thread-001')
    })
  })

  it('Clear button in bulk toolbar deselects all', async () => {
    renderPage()
    await waitFor(() => screen.getByText('GST query'))

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes.find(c => c.getAttribute('aria-label')?.startsWith('Select thread'))!)
    await waitFor(() => screen.getByText('Clear'))

    fireEvent.click(screen.getByText('Clear'))
    await waitFor(() => {
      expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  it('shows error message when listThreads fails', async () => {
    vi.spyOn(chatApi, 'listThreads').mockRejectedValue(new Error('Network error'))

    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load threads/)).toBeInTheDocument()
    })
  })

  it('Retry button calls refetch after error', async () => {
    const listSpy = vi.spyOn(chatApi, 'listThreads').mockRejectedValue(new Error('Network error'))
    const _callsBefore = listSpy.mock.calls.length
    renderPage()
    await waitFor(() => screen.getByText('Retry'))
    const callsAfterLoad = listSpy.mock.calls.length
    fireEvent.click(screen.getByText('Retry'))
    // After click, listThreads should have been called at least once more
    await waitFor(() => {
      expect(listSpy.mock.calls.length).toBeGreaterThan(callsAfterLoad)
    })
  })
})
