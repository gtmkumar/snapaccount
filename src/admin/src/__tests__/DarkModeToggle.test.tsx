/**
 * DarkModeToggle / ThemeContext — Phase 6F component tests
 * Covers: toggle persists to localStorage; system-following default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import React from 'react'

// ---------------------------------------------------------------------------
// Test component — exposes ThemeContext API
// ---------------------------------------------------------------------------

function ThemeTestUI() {
  const { preference, effectiveTheme, setPreference, cycleTheme } = useTheme()
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button onClick={() => setPreference('light')} aria-label="set-light">Light</button>
      <button onClick={() => setPreference('dark')} aria-label="set-dark">Dark</button>
      <button onClick={() => setPreference('system')} aria-label="set-system">System</button>
      <button onClick={cycleTheme} aria-label="cycle">Cycle</button>
    </div>
  )
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <ThemeTestUI />
    </ThemeProvider>
  )
}

// ---------------------------------------------------------------------------
// Helpers — mock matchMedia
// ---------------------------------------------------------------------------

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// Stub BroadcastChannel to avoid "not defined" errors in jsdom
class MockBroadcastChannel {
  constructor(_name: string) {}
  postMessage = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  close = vi.fn()
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark')
  mockMatchMedia(false) // default: light system preference
  ;(window as unknown as { BroadcastChannel: typeof MockBroadcastChannel }).BroadcastChannel = MockBroadcastChannel
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThemeContext / DarkModeToggle', () => {
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  it('defaults to system preference when localStorage is empty', () => {
    renderTheme()
    expect(screen.getByTestId('preference').textContent).toBe('system')
  })

  it('restores stored preference from localStorage', () => {
    localStorage.setItem('snapaccount.theme', 'dark')
    renderTheme()
    expect(screen.getByTestId('preference').textContent).toBe('dark')
  })

  it('effectiveTheme is light when system is light', () => {
    mockMatchMedia(false)
    renderTheme()
    // preference=system, system=light → effective=light
    expect(screen.getByTestId('effective').textContent).toBe('light')
  })

  it('effectiveTheme is dark when system prefers dark', () => {
    mockMatchMedia(true)
    renderTheme()
    // preference=system, system=dark → effective=dark
    expect(screen.getByTestId('effective').textContent).toBe('dark')
  })

  // ---------------------------------------------------------------------------
  // setPreference persists to localStorage
  // ---------------------------------------------------------------------------

  it('setPreference("dark") stores "dark" in localStorage', async () => {
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }))

    await waitFor(() => {
      expect(localStorage.getItem('snapaccount.theme')).toBe('dark')
    })
  })

  it('setPreference("light") stores "light" in localStorage', async () => {
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-light' }))

    await waitFor(() => {
      expect(localStorage.getItem('snapaccount.theme')).toBe('light')
    })
  })

  it('setPreference("system") stores "system" in localStorage', async () => {
    localStorage.setItem('snapaccount.theme', 'dark')
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-system' }))

    await waitFor(() => {
      expect(localStorage.getItem('snapaccount.theme')).toBe('system')
    })
  })

  // ---------------------------------------------------------------------------
  // effectiveTheme reflects chosen preference
  // ---------------------------------------------------------------------------

  it('effectiveTheme becomes dark after setPreference("dark")', async () => {
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }))

    await waitFor(() => {
      expect(screen.getByTestId('effective').textContent).toBe('dark')
    })
  })

  it('effectiveTheme becomes light after setPreference("light")', async () => {
    localStorage.setItem('snapaccount.theme', 'dark')
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-light' }))

    await waitFor(() => {
      expect(screen.getByTestId('effective').textContent).toBe('light')
    })
  })

  // ---------------------------------------------------------------------------
  // DOM — data-theme and dark class
  // ---------------------------------------------------------------------------

  it('sets data-theme="dark" on html element when preference is dark', async () => {
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }))

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('removes data-theme from html element when preference is light', async () => {
    localStorage.setItem('snapaccount.theme', 'dark')
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-light' }))

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    })
  })

  it('adds "dark" class to html element when dark mode active', async () => {
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }))

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('removes "dark" class from html element when light mode', async () => {
    localStorage.setItem('snapaccount.theme', 'dark')
    renderTheme()
    fireEvent.click(screen.getByRole('button', { name: 'set-light' }))

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // cycleTheme
  // ---------------------------------------------------------------------------

  it('cycleTheme advances from light → dark', async () => {
    localStorage.setItem('snapaccount.theme', 'light')
    renderTheme()

    fireEvent.click(screen.getByRole('button', { name: 'cycle' }))

    await waitFor(() => {
      expect(screen.getByTestId('preference').textContent).toBe('dark')
    })
  })

  it('cycleTheme advances from dark → system', async () => {
    localStorage.setItem('snapaccount.theme', 'dark')
    renderTheme()

    fireEvent.click(screen.getByRole('button', { name: 'cycle' }))

    await waitFor(() => {
      expect(screen.getByTestId('preference').textContent).toBe('system')
    })
  })

  it('cycleTheme advances from system → light', async () => {
    localStorage.setItem('snapaccount.theme', 'system')
    renderTheme()

    fireEvent.click(screen.getByRole('button', { name: 'cycle' }))

    await waitFor(() => {
      expect(screen.getByTestId('preference').textContent).toBe('light')
    })
  })
})
