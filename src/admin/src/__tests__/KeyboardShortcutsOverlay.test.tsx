/**
 * KeyboardShortcutsOverlay — Phase 6F component tests
 * Covers: ? opens cheat-sheet; ESC closes; lists at least 8 shortcuts.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { KeyboardShortcutsOverlay } from '@/components/ui/KeyboardShortcutsOverlay'
import { KeyboardShortcutsProvider, useKeyboardShortcuts } from '@/contexts/KeyboardShortcutsContext'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'user-001', email: 'dev@snapaccount.in', displayName: 'Dev', role: 'SUPER_ADMIN' },
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  })),
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Helpers — inject overlay with context pre-opened
// ---------------------------------------------------------------------------

function OpenedOverlay() {
  const { openCheatSheet } = useKeyboardShortcuts()
  return (
    <>
      <button onClick={openCheatSheet}>Open</button>
      <KeyboardShortcutsOverlay />
    </>
  )
}

function renderOverlay() {
  return render(
    <MemoryRouter>
      <KeyboardShortcutsProvider>
        <OpenedOverlay />
      </KeyboardShortcutsProvider>
    </MemoryRouter>
  )
}

function openCheatSheet() {
  fireEvent.click(screen.getByText('Open'))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KeyboardShortcutsOverlay', () => {
  it('is hidden by default', () => {
    renderOverlay()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows overlay after openCheatSheet is called', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('overlay has correct aria-label', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Keyboard shortcuts')
    })
  })

  // ---------------------------------------------------------------------------
  // ? key opens cheat-sheet
  // ---------------------------------------------------------------------------

  it('pressing ? on document opens cheat-sheet', async () => {
    renderOverlay()
    fireEvent.keyDown(document, { key: '?' })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // ESC closes
  // ---------------------------------------------------------------------------

  it('pressing ESC closes the overlay', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('clicking backdrop closes the overlay', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))

    const backdrop = document.querySelector('[aria-hidden="true"]')
    if (backdrop) fireEvent.click(backdrop)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('clicking the X close button closes the overlay', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))

    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Shortcut listing
  // ---------------------------------------------------------------------------

  it('lists at least 8 shortcuts', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))

    // Count unique shortcut labels — each row renders a span with the label text
    const shortcutLabels = [
      'Go to Dashboard',
      'Open command palette',
      'Open this cheat sheet',
      'Close modal / drawer / palette',
      'Next row',
      'Previous row',
      'Open selected row',
      'Refresh',
    ]
    // At least 8 of these should be visible
    const found = shortcutLabels.filter(label => {
      try {
        screen.getByText(label)
        return true
      } catch {
        return false
      }
    })
    expect(found.length).toBeGreaterThanOrEqual(8)
  })

  it('renders Navigation section', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })

  it('renders Universal section', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))
    expect(screen.getByText('Universal')).toBeInTheDocument()
  })

  it('renders List / DataTable section', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))
    expect(screen.getByText('List / DataTable')).toBeInTheDocument()
  })

  it('shows role label for SUPER_ADMIN', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => {
      expect(screen.getByText(/SUPER_ADMIN/)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Filter shortcuts
  // ---------------------------------------------------------------------------

  it('filter input narrows displayed shortcuts', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))

    const filterInput = screen.getByPlaceholderText(/Filter shortcuts/i)
    fireEvent.change(filterInput, { target: { value: 'Dashboard' } })

    await waitFor(() => {
      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
      // Navigation-unrelated shortcuts should be hidden
      expect(screen.queryByText('Next row')).not.toBeInTheDocument()
    })
  })

  it('filter with no match shows empty message', async () => {
    renderOverlay()
    openCheatSheet()

    await waitFor(() => screen.getByRole('dialog'))

    const filterInput = screen.getByPlaceholderText(/Filter shortcuts/i)
    fireEvent.change(filterInput, { target: { value: 'xyznonexistent' } })

    await waitFor(() => {
      expect(screen.getByText(/No shortcuts match/i)).toBeInTheDocument()
    })
  })
})
