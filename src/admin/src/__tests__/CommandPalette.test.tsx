/**
 * CommandPalette — Phase 6F component tests
 * Covers: opens on cmd+k; debounced search hits /search; keyboard nav; recent items.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { CommandPaletteProvider } from '@/contexts/CommandPaletteContext'
import * as api from '@/lib/api'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'user-001', email: 'dev@snapaccount.in', displayName: 'Dev', role: 'SYSTEM_ADMIN' },
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  })),
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))

const mockSearchResponse = {
  query: 'gst',
  results: [
    { type: 'return', id: 'return-001', title: 'GSTR-3B March 2024', subtitle: 'ACME Corp', url: '/gst/returns/return-001' },
    { type: 'notice', id: 'notice-001', title: 'GST Notice #NTC001', subtitle: 'ACME Corp', url: '/gst/notices/notice-001' },
  ],
  totalCount: 2,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderPalette(isOpen = true, onClose = vi.fn()) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <CommandPaletteProvider>
          <CommandPalette _isOpen={isOpen} _onClose={onClose} />
        </CommandPaletteProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  // Mock the api module's get method
  vi.spyOn(api.default, 'get').mockResolvedValue({ data: mockSearchResponse })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandPalette', () => {
  it('renders search input when open', () => {
    renderPalette(true)
    expect(screen.getByPlaceholderText(/Search anything/i)).toBeInTheDocument()
  })

  it('renders as dialog with correct aria attributes', () => {
    renderPalette(true)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-label', 'Command palette')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('does not render when closed', () => {
    renderPalette(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking backdrop calls onClose', () => {
    const onClose = vi.fn()
    renderPalette(true, onClose)
    const backdrop = document.querySelector('[aria-hidden="true"]')
    if (backdrop) fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('Esc key calls onClose', () => {
    const onClose = vi.fn()
    renderPalette(true, onClose)

    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Search hits /search endpoint
  // ---------------------------------------------------------------------------

  it('shows suggested actions when query is empty', () => {
    renderPalette(true)
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
  })

  it('typing 2+ chars triggers search query', async () => {
    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'gst' } })

    await waitFor(() => {
      expect(api.default.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({ params: { q: 'gst', types: undefined } })
      )
    })
  })

  it('search results are rendered after query', async () => {
    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'gst' } })

    await waitFor(() => {
      expect(screen.getByText('GSTR-3B March 2024')).toBeInTheDocument()
      expect(screen.getByText('GST Notice #NTC001')).toBeInTheDocument()
    })
  })

  it('typing 1 char does NOT trigger search', async () => {
    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'g' } })

    await waitFor(() => {
      expect(api.default.get).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Filter chips
  // ---------------------------------------------------------------------------

  it('renders filter chips', () => {
    renderPalette(true)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'user' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'loan' })).toBeInTheDocument()
  })

  it('selecting a filter chip sends type param to search', async () => {
    renderPalette(true)
    fireEvent.click(screen.getByRole('button', { name: 'loan' }))

    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'loan query' } })

    await waitFor(() => {
      expect(api.default.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({ params: { q: 'loan query', types: 'loan' } })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  it('ArrowDown moves selection to next item', async () => {
    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'gst' } })

    await waitFor(() => screen.getByText('GSTR-3B March 2024'))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // selectedIndex moves to 1 — second item should be highlighted
    const items = screen.getAllByRole('option')
    expect(items[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowUp at top does not go negative', async () => {
    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'gst' } })

    await waitFor(() => screen.getByText('GSTR-3B March 2024'))

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const items = screen.getAllByRole('option')
    // Should stay at index 0
    expect(items[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowDown + ArrowDown moves to second item', async () => {
    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'gst' } })

    await waitFor(() => screen.getByText('GSTR-3B March 2024'))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // would go to index 2 but max is 1
    const items = screen.getAllByRole('option')
    // Still on last item
    expect(items[items.length - 1]).toHaveAttribute('aria-selected', 'true')
  })

  // ---------------------------------------------------------------------------
  // Recent items in localStorage
  // ---------------------------------------------------------------------------

  it('shows recent items from localStorage on open', () => {
    localStorage.setItem('snapaccount.cmdk.recent', JSON.stringify([
      { type: 'user', id: 'u-1', label: 'Recent User Item', secondary: 'ID u-1', url: '/users/u-1', openedAt: Date.now() },
    ]))

    renderPalette(true)
    expect(screen.getByText('Recent User Item')).toBeInTheDocument()
  })

  it('shows Recent section heading when items exist', () => {
    localStorage.setItem('snapaccount.cmdk.recent', JSON.stringify([
      { type: 'user', id: 'u-1', label: 'Cached Item', secondary: '', url: '/users/u-1', openedAt: Date.now() },
    ]))

    renderPalette(true)
    expect(screen.getByText(/Recent/i)).toBeInTheDocument()
  })

  it('shows empty placeholder when no recent items and no query', () => {
    localStorage.clear()
    renderPalette(true)
    expect(screen.getByText(/Type a name, PAN, GSTIN/i)).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Keyboard hints in footer
  // ---------------------------------------------------------------------------

  it('shows keyboard navigation hint in footer', () => {
    renderPalette(true)
    expect(screen.getByText('navigate')).toBeInTheDocument()
    expect(screen.getByText('open')).toBeInTheDocument()
    expect(screen.getByText('close')).toBeInTheDocument()
  })

  it('shows combobox role on search input', () => {
    renderPalette(true)
    const input = screen.getByRole('combobox')
    expect(input).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it('shows no-results message when search returns empty', async () => {
    vi.spyOn(api.default, 'get').mockResolvedValue({ data: { query: 'xyz', results: [], totalCount: 0 } })

    renderPalette(true)
    const input = screen.getByPlaceholderText(/Search anything/i)
    fireEvent.change(input, { target: { value: 'xyz' } })

    await waitFor(() => {
      expect(screen.getByText(/No matches for/)).toBeInTheDocument()
    })
  })
})
