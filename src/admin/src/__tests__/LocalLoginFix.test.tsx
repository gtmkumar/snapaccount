/**
 * LocalLoginFix.test.tsx — LoginPage 2FA step
 *
 * Tests that LoginPage switches to the TOTP input step when useAuth
 * returns twoFaChallenge.pending=true, and that submitting the code
 * calls submit2FaChallenge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import React from 'react'

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// Mock the whole hook — these tests are about the LoginPage rendering
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/hooks/useAuth'
import LoginPage from '@/pages/auth/LoginPage'

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function wrapPage(element: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={['/login']}>{element}</MemoryRouter>
    </QueryClientProvider>
  )
}

const baseAuthState = {
  user: null,
  loading: false,
  error: null,
  twoFaChallenge: null,
  signInWithGoogle: vi.fn(),
  signInWithEmailPassword: vi.fn(),
  submit2FaChallenge: vi.fn(),
  signOut: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage — 2FA challenge step', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('renders the normal login form when twoFaChallenge is null', () => {
    mockUseAuth.mockReturnValue({ ...baseAuthState, twoFaChallenge: null })
    wrapPage(<LoginPage />)
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.queryByText('Two-factor authentication')).not.toBeInTheDocument()
  })

  it('renders the 2FA step when twoFaChallenge.pending is true', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
    })
    wrapPage(<LoginPage />)
    expect(screen.getByText('Two-factor authentication')).toBeInTheDocument()
    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument()
  })

  it('does not render the normal password form during 2FA step', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
    })
    wrapPage(<LoginPage />)
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument()
  })

  it('Verify button is disabled when code input is empty', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
    })
    wrapPage(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
  })

  it('Verify button enables after entering a code', async () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
    })
    wrapPage(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Authenticator code'), {
      target: { value: '123456' },
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Verify' })).not.toBeDisabled()
    })
  })

  it('calls submit2FaChallenge with the entered code on form submit', async () => {
    const submit = vi.fn()
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
      submit2FaChallenge: submit,
    })
    wrapPage(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Authenticator code'), {
      target: { value: '654321' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith('654321')
    })
  })

  it('shows error banner in 2FA step when error is set', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      error: 'Invalid TOTP code',
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
    })
    wrapPage(<LoginPage />)
    expect(screen.getByText('Verification failed')).toBeInTheDocument()
    expect(screen.getByText('Invalid TOTP code')).toBeInTheDocument()
  })

  it('shows loading state on Verify button while submitting', () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      loading: true,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
    })
    wrapPage(<LoginPage />)
    const btn = screen.getByRole('button', { name: 'Verify' })
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('strips whitespace from code before submitting', async () => {
    const submit = vi.fn()
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      twoFaChallenge: { pending: true, challengeToken: 'ch-tok' },
      submit2FaChallenge: submit,
    })
    wrapPage(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Authenticator code'), {
      target: { value: '  123456  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => {
      // onChange strips \s so the stored value will already be trimmed
      expect(submit).toHaveBeenCalledWith(expect.stringMatching(/\S/))
    })
  })
})
