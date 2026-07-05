/**
 * useAuthLocalLogin.test.tsx
 *
 * Tests the real useAuth hook (not mocked) for the LOCAL_AUTH path:
 *
 * 1. TOKEN FIELD FIX: /auth/local/login returns `token` (not `accessToken`).
 *    setToken must be called with data.token, never undefined.
 *
 * 2. 2FA CHALLENGE BRANCH: when requires2fa=true the hook exposes
 *    twoFaChallenge.pending=true and does NOT store a token or a user.
 *    submit2FaChallenge then completes the flow.
 *
 * NOTE: vi.mock() is hoisted — do NOT mock @/hooks/useAuth in this file,
 * because we need the real implementation. The LoginPage mock file handles that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

import api from '@/lib/api'
import * as authToken from '@/lib/authToken'
import { useAuth } from '@/hooks/useAuth'

const mockPost = vi.spyOn(api, 'post')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function wrapHook() {
  return renderHook(() => useAuth(), { wrapper: makeWrapper() })
}

// ── 1. Token field fix ────────────────────────────────────────────────────────

describe('useAuth LOCAL_AUTH — token field (data.token, not data.accessToken)', () => {
  let setTokenSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'false')
    localStorage.clear()
    setTokenSpy = vi.spyOn(authToken, 'setToken')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('calls setToken with data.token (not undefined accessToken)', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: 'real-jwt-abc123',
        userId: 'user-1',
        email: 'admin@test.com',
        fullName: 'Test Admin',
        roles: ['SUPER_ADMIN'],
        permissions: [],
        requires2fa: false,
        challengeToken: null,
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('admin@test.com', 'password')
    })

    expect(setTokenSpy).toHaveBeenCalledWith('real-jwt-abc123')
    expect(setTokenSpy).not.toHaveBeenCalledWith(undefined)
  })

  it('does not restore a zombie session when user exists but token is missing', () => {
    localStorage.setItem('sa_admin_user', JSON.stringify({
      uid: 'user-zombie',
      email: 'ghost@test.com',
      displayName: 'Ghost',
      photoURL: null,
      role: 'SUPER_ADMIN',
    }))

    const { result } = wrapHook()

    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('sa_admin_user')).toBeNull()
  })

  it('stores user in localStorage after successful login', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: 'jwt-xyz',
        userId: 'user-42',
        email: 'ops@test.com',
        fullName: 'Ops Manager',
        roles: ['OPERATIONS_MANAGER'],
        permissions: [],
        requires2fa: false,
        challengeToken: null,
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('ops@test.com', 'pass')
    })

    const stored = JSON.parse(localStorage.getItem('sa_admin_user') ?? 'null') as { uid: string; role: string } | null
    expect(stored).not.toBeNull()
    expect(stored?.uid).toBe('user-42')
    expect(stored?.role).toBe('OPERATIONS_MANAGER')
  })

  it('sets user in state after successful login', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: 'jwt-ok',
        userId: 'user-99',
        email: 'ca@test.com',
        fullName: 'CA User',
        roles: ['CA'],
        permissions: [],
        requires2fa: false,
        challengeToken: null,
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('ca@test.com', 'pass')
    })

    expect(result.current.user).not.toBeNull()
    expect(result.current.user?.uid).toBe('user-99')
    expect(result.current.user?.role).toBe('CA')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('does NOT call setToken when login fails', async () => {
    mockPost.mockRejectedValueOnce(
      Object.assign(new Error('401'), { response: { data: { error: 'Invalid credentials' } } })
    )

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('bad@test.com', 'wrong')
    })

    expect(setTokenSpy).not.toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.error).toBe('Invalid credentials')
  })

  it('POSTs to /auth/local/login with email and password', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: 'any-token',
        userId: 'u1',
        email: 'x@y.com',
        fullName: 'X',
        roles: ['SUPER_ADMIN'],
        permissions: [],
        requires2fa: false,
        challengeToken: null,
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('x@y.com', 'secret')
    })

    expect(mockPost).toHaveBeenCalledWith('/auth/local/login', {
      email: 'x@y.com',
      password: 'secret',
    })
  })
})

// ── 2. 2FA challenge branch ───────────────────────────────────────────────────

describe('useAuth LOCAL_AUTH — requires2fa branch', () => {
  let setTokenSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true')
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'false')
    localStorage.clear()
    setTokenSpy = vi.spyOn(authToken, 'setToken')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('sets twoFaChallenge.pending=true when requires2fa is true', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'user-2fa',
        email: 'admin2fa@test.com',
        fullName: 'Admin 2FA',
        roles: ['SUPER_ADMIN'],
        permissions: [],
        requires2fa: true,
        challengeToken: 'challenge-abc',
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('admin2fa@test.com', 'pass')
    })

    expect(result.current.twoFaChallenge).not.toBeNull()
    expect(result.current.twoFaChallenge?.pending).toBe(true)
    expect(result.current.twoFaChallenge?.challengeToken).toBe('challenge-abc')
  })

  it('does NOT call setToken during the 2FA challenge step', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'user-2fa',
        email: null,
        fullName: null,
        roles: ['SUPER_ADMIN'],
        permissions: [],
        requires2fa: true,
        challengeToken: 'challenge-tok',
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('admin2fa@test.com', 'pass')
    })

    expect(setTokenSpy).not.toHaveBeenCalled()
  })

  it('leaves user=null during the 2FA challenge step', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'user-2fa',
        email: null,
        fullName: null,
        roles: [],
        permissions: [],
        requires2fa: true,
        challengeToken: 'ch-tok',
      },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('admin2fa@test.com', 'pass')
    })

    expect(result.current.user).toBeNull()
  })

  it('submit2FaChallenge POSTs /auth/2fa/challenge with challengeToken and code', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'u-2fa',
        email: null,
        fullName: null,
        roles: [],
        permissions: [],
        requires2fa: true,
        challengeToken: 'ch-secret-99',
      },
    })
    mockPost.mockResolvedValueOnce({
      data: { token: 'final-token', userId: 'u-2fa' },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('a@b.com', 'pw')
    })
    await act(async () => {
      await result.current.submit2FaChallenge('123456')
    })

    expect(mockPost).toHaveBeenCalledWith('/auth/2fa/challenge', {
      challengeToken: 'ch-secret-99',
      code: '123456',
    })
  })

  it('submit2FaChallenge stores the final token after success', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'u-2fa',
        email: null,
        fullName: null,
        roles: [],
        permissions: [],
        requires2fa: true,
        challengeToken: 'ch-tok',
      },
    })
    mockPost.mockResolvedValueOnce({
      data: { token: 'final-jwt-456', userId: 'u-2fa' },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('a@b.com', 'pw')
    })
    await act(async () => {
      await result.current.submit2FaChallenge('654321')
    })

    expect(setTokenSpy).toHaveBeenCalledWith('final-jwt-456')
  })

  it('submit2FaChallenge sets user and clears twoFaChallenge on success', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'u-2fa',
        email: null,
        fullName: null,
        roles: [],
        permissions: [],
        requires2fa: true,
        challengeToken: 'ch-tok',
      },
    })
    mockPost.mockResolvedValueOnce({
      data: { token: 'final-jwt', userId: 'u-2fa' },
    })

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('a@b.com', 'pw')
    })
    await act(async () => {
      await result.current.submit2FaChallenge('123456')
    })

    expect(result.current.twoFaChallenge).toBeNull()
    expect(result.current.user).not.toBeNull()
    expect(result.current.user?.uid).toBe('u-2fa')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('submit2FaChallenge sets error on wrong code (user and challenge stay)', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        token: null,
        userId: 'u-2fa',
        email: null,
        fullName: null,
        roles: [],
        permissions: [],
        requires2fa: true,
        challengeToken: 'ch-tok',
      },
    })
    mockPost.mockRejectedValueOnce(
      Object.assign(new Error('400'), { response: { data: { error: 'Invalid TOTP code' } } })
    )

    const { result } = wrapHook()

    await act(async () => {
      await result.current.signInWithEmailPassword('a@b.com', 'pw')
    })
    await act(async () => {
      await result.current.submit2FaChallenge('000000')
    })

    expect(result.current.user).toBeNull()
    expect(result.current.error).toBe('Invalid TOTP code')
    // challenge must still be pending so the user can retry without re-entering password
    expect(result.current.twoFaChallenge?.pending).toBe(true)
  })
})
