/**
 * AuthFeatures.test.tsx — Task #20
 * Tests for:
 *  1. UserPreferencesSettings (GET/PATCH /auth/me/preferences)
 *  2. DevicesSettings (GET /auth/devices, DELETE /auth/devices/:id)
 *  3. TwoFaSettings (GET /auth/me/2fa/status, enroll, confirm, disable)
 *  4. ForgotPasswordPage (POST /auth/password/forgot)
 *  5. ResetPasswordPage (POST /auth/password/reset)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import React from 'react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// QRCodeSVG mock — renders a simple placeholder so DOM tests pass without canvas
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <div data-testid="qr-code" data-value={value}>QR Code</div>
  ),
}))

import * as settingsApi from '@/lib/settingsApi'
import * as devicesApi from '@/lib/devicesApi'
import { toast } from 'sonner'

import { UserPreferencesSettings } from '@/pages/settings/sections/UserPreferencesSettings'
import { DevicesSettings } from '@/pages/settings/sections/DevicesSettings'
import { TwoFaSettings } from '@/pages/settings/sections/TwoFaSettings'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function wrap(component: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>{component}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ── 1. UserPreferencesSettings ─────────────────────────────────────────────────

describe('UserPreferencesSettings', () => {
  beforeEach(() => {
    vi.spyOn(settingsApi, 'getUserPreferences').mockResolvedValue({
      preferredLanguage: 'en',
      theme: 'SYSTEM',
      pushNotificationsEnabled: true,
      smsNotificationsEnabled: false,
      emailNotificationsEnabled: true,
      whatsappNotificationsEnabled: false,
    })
    vi.spyOn(settingsApi, 'updateUserPreferences').mockResolvedValue(undefined)
  })

  it('renders the preferences title', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => {
      expect(screen.getByText('My Preferences')).toBeInTheDocument()
    })
  })

  it('calls getUserPreferences on mount', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => {
      expect(settingsApi.getUserPreferences).toHaveBeenCalled()
    })
  })

  it('renders theme select', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /theme/i })).toBeInTheDocument()
    })
  })

  it('renders language select', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /language/i })).toBeInTheDocument()
    })
  })

  it('renders all four notification toggles', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => {
      expect(screen.getByText('Push notifications')).toBeInTheDocument()
      expect(screen.getByText('SMS notifications')).toBeInTheDocument()
      expect(screen.getByText('Email notifications')).toBeInTheDocument()
      expect(screen.getByText('WhatsApp notifications')).toBeInTheDocument()
    })
  })

  it('Save button calls updateUserPreferences', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => screen.getByText('Save Preferences'))
    fireEvent.click(screen.getByText('Save Preferences'))
    await waitFor(() => {
      expect(settingsApi.updateUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'SYSTEM', preferredLanguage: 'en' })
      )
    })
  })

  it('shows success toast after save', async () => {
    wrap(<UserPreferencesSettings />)
    await waitFor(() => screen.getByText('Save Preferences'))
    fireEvent.click(screen.getByText('Save Preferences'))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Preferences saved')
    })
  })
})

// ── 2. DevicesSettings ────────────────────────────────────────────────────────

describe('DevicesSettings', () => {
  const mockDevices: devicesApi.Device[] = [
    {
      id: 'dev-1',
      deviceId: 'abc123',
      deviceName: 'My iPhone',
      platform: 'iOS',
      osVersion: '17.0',
      appVersion: '2.1.0',
      isActive: true,
      lastActiveAt: '2026-06-01T10:00:00Z',
      boundAt: '2026-01-15T08:30:00Z',
    },
    {
      id: 'dev-2',
      deviceId: 'def456',
      deviceName: null,
      platform: 'Android',
      osVersion: '14',
      appVersion: null,
      isActive: false,
      lastActiveAt: null,
      boundAt: '2026-03-20T12:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.spyOn(devicesApi, 'getDevices').mockResolvedValue(mockDevices)
    vi.spyOn(devicesApi, 'revokeDevice').mockResolvedValue(undefined)
  })

  it('renders Logged-in Devices title', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => {
      expect(screen.getByText('Logged-in Devices')).toBeInTheDocument()
    })
  })

  it('calls getDevices on mount', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => {
      expect(devicesApi.getDevices).toHaveBeenCalled()
    })
  })

  it('renders device names', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => {
      expect(screen.getByText('My iPhone')).toBeInTheDocument()
      // The nameless device shows platform as name — "Android" appears in both
      // name span and platform detail, so getAllByText is appropriate
      const androidEls = screen.getAllByText('Android')
      expect(androidEls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders platform for device without name', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => {
      const androidEls = screen.getAllByText('Android')
      expect(androidEls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders Active badge for active device', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
  })

  it('renders Revoke buttons', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => {
      const revokeButtons = screen.getAllByText('Revoke')
      expect(revokeButtons.length).toBe(2)
    })
  })

  it('calls revokeDevice when Revoke is clicked', async () => {
    wrap(<DevicesSettings />)
    await waitFor(() => screen.getAllByText('Revoke'))
    fireEvent.click(screen.getAllByText('Revoke')[0]!)
    await waitFor(() => {
      expect(devicesApi.revokeDevice).toHaveBeenCalledWith('dev-1')
    })
  })

  it('shows empty state when no devices', async () => {
    vi.spyOn(devicesApi, 'getDevices').mockResolvedValue([])
    wrap(<DevicesSettings />)
    await waitFor(() => {
      expect(screen.getByText('No devices found')).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    vi.spyOn(devicesApi, 'getDevices').mockRejectedValue(new Error('Network error'))
    wrap(<DevicesSettings />)
    await waitFor(() => {
      expect(screen.getByText(/could not load devices/i)).toBeInTheDocument()
    })
  })
})

// ── 3. TwoFaSettings ──────────────────────────────────────────────────────────

describe('TwoFaSettings — disabled state', () => {
  beforeEach(() => {
    vi.spyOn(settingsApi, 'get2FaStatus').mockResolvedValue({ enabled: false, confirmedAt: null })
    vi.spyOn(settingsApi, 'enroll2Fa').mockResolvedValue({
      otpauthUri: 'otpauth://totp/SnapAccount:test@example.com?secret=ABCDEF&issuer=SnapAccount',
      base32Secret: 'ABCDEFGH',
    })
  })

  it('renders Two-Factor Authentication title', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument()
    })
  })

  it('calls get2FaStatus on mount', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(settingsApi.get2FaStatus).toHaveBeenCalled()
    })
  })

  it('shows Disabled badge when 2FA is off', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })
  })

  it('shows "2FA is not enabled" message', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('2FA is not enabled')).toBeInTheDocument()
    })
  })

  it('shows Enable 2FA button', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('Enable 2FA')).toBeInTheDocument()
    })
  })

  it('calls enroll2Fa when Enable 2FA is clicked', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => screen.getByText('Enable 2FA'))
    fireEvent.click(screen.getByText('Enable 2FA'))
    await waitFor(() => {
      expect(settingsApi.enroll2Fa).toHaveBeenCalled()
    })
  })

  it('shows QR code dialog after enroll', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => screen.getByText('Enable 2FA'))
    fireEvent.click(screen.getByText('Enable 2FA'))
    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })
  })

  it('shows base32 secret in enroll dialog', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => screen.getByText('Enable 2FA'))
    fireEvent.click(screen.getByText('Enable 2FA'))
    await waitFor(() => {
      expect(screen.getByText('ABCDEFGH')).toBeInTheDocument()
    })
  })
})

describe('TwoFaSettings — enabled state', () => {
  beforeEach(() => {
    vi.spyOn(settingsApi, 'get2FaStatus').mockResolvedValue({
      enabled: true,
      confirmedAt: '2026-05-01T10:00:00Z',
    })
    vi.spyOn(settingsApi, 'disable2Fa').mockResolvedValue(undefined)
  })

  it('shows Enabled badge when 2FA is on', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })
  })

  it('shows "2FA is active" message', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('2FA is active on your account')).toBeInTheDocument()
    })
  })

  it('shows Disable 2FA button', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => {
      expect(screen.getByText('Disable 2FA')).toBeInTheDocument()
    })
  })

  it('opens disable dialog when Disable 2FA is clicked', async () => {
    wrap(<TwoFaSettings />)
    await waitFor(() => screen.getByText('Disable 2FA'))
    fireEvent.click(screen.getByText('Disable 2FA'))
    await waitFor(() => {
      expect(screen.getByText('Disable Two-Factor Authentication')).toBeInTheDocument()
    })
  })
})

// ── 4. ForgotPasswordPage ─────────────────────────────────────────────────────

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.spyOn(settingsApi, 'forgotPassword').mockResolvedValue(undefined)
  })

  it('renders forgot password title', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByText('Forgot your password?')).toBeInTheDocument()
  })

  it('renders email input', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
  })

  it('renders Send reset link button', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByText('Send reset link')).toBeInTheDocument()
  })

  it('shows validation error for empty email', async () => {
    wrap(<ForgotPasswordPage />)
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => {
      expect(screen.getByText('Email address is required')).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid email', async () => {
    wrap(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'not-an-email' },
    })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument()
    })
  })

  it('calls forgotPassword with valid email', async () => {
    wrap(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => {
      expect(settingsApi.forgotPassword).toHaveBeenCalledWith('test@example.com')
    })
  })

  it('shows success message after submit', async () => {
    wrap(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument()
    })
  })

  it('shows generic success even on API error (anti-enumeration)', async () => {
    vi.spyOn(settingsApi, 'forgotPassword').mockRejectedValue(new Error('500'))
    wrap(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => {
      // Should still show success
      expect(screen.getByText('Check your email')).toBeInTheDocument()
    })
  })

  it('renders back to sign in link', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByText('Back to sign in')).toBeInTheDocument()
  })
})

// ── 5. ResetPasswordPage ──────────────────────────────────────────────────────

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.spyOn(settingsApi, 'resetPassword').mockResolvedValue(undefined)
  })

  function wrapReset(token?: string) {
    const path = token ? `/reset-password?token=${token}` : '/reset-password'
    return render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('renders reset password title', () => {
    wrapReset('abc123')
    expect(screen.getByText('Set a new password')).toBeInTheDocument()
  })

  it('renders new password input', () => {
    wrapReset('abc123')
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
  })

  it('renders confirm password input', () => {
    wrapReset('abc123')
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
  })

  it('shows error when password is too short', async () => {
    wrapReset('abc123')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByText('Reset password'))
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    })
  })

  it('shows error when passwords do not match', async () => {
    wrapReset('abc123')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Password123!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Different1!' } })
    fireEvent.click(screen.getByText('Reset password'))
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('calls resetPassword with token and password on valid submit', async () => {
    wrapReset('mytoken123')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword1!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword1!' } })
    fireEvent.click(screen.getByText('Reset password'))
    await waitFor(() => {
      expect(settingsApi.resetPassword).toHaveBeenCalledWith('mytoken123', 'NewPassword1!')
    })
  })

  it('shows success message after successful reset', async () => {
    wrapReset('mytoken123')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword1!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword1!' } })
    fireEvent.click(screen.getByText('Reset password'))
    await waitFor(() => {
      expect(screen.getByText('Password reset successfully')).toBeInTheDocument()
    })
  })

  it('shows no-token error when token is missing from URL', async () => {
    wrapReset()
    await waitFor(() => {
      expect(screen.getByText(/no reset token found/i)).toBeInTheDocument()
    })
  })

  it('shows password strength indicator when typing', async () => {
    wrapReset('abc123')
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'StrongPass1!' },
    })
    await waitFor(() => {
      // Strength bar segments render
      const strengthBars = document.querySelectorAll('.h-1.flex-1.rounded-full')
      expect(strengthBars.length).toBeGreaterThan(0)
    })
  })

  it('renders back to sign in link', () => {
    wrapReset('abc123')
    expect(screen.getByText('Back to sign in')).toBeInTheDocument()
  })
})

// ── 6. settingsApi — new functions are exported correctly ─────────────────────

describe('settingsApi — new exports', () => {
  it('exports getUserPreferences', () => {
    expect(typeof settingsApi.getUserPreferences).toBe('function')
  })

  it('exports updateUserPreferences', () => {
    expect(typeof settingsApi.updateUserPreferences).toBe('function')
  })

  it('exports get2FaStatus', () => {
    expect(typeof settingsApi.get2FaStatus).toBe('function')
  })

  it('exports enroll2Fa', () => {
    expect(typeof settingsApi.enroll2Fa).toBe('function')
  })

  it('exports confirm2Fa', () => {
    expect(typeof settingsApi.confirm2Fa).toBe('function')
  })

  it('exports disable2Fa', () => {
    expect(typeof settingsApi.disable2Fa).toBe('function')
  })

  it('exports forgotPassword', () => {
    expect(typeof settingsApi.forgotPassword).toBe('function')
  })

  it('exports resetPassword', () => {
    expect(typeof settingsApi.resetPassword).toBe('function')
  })
})

// ── 7. devicesApi — exports ───────────────────────────────────────────────────

describe('devicesApi — exports', () => {
  it('exports getDevices', () => {
    expect(typeof devicesApi.getDevices).toBe('function')
  })

  it('exports revokeDevice', () => {
    expect(typeof devicesApi.revokeDevice).toBe('function')
  })
})
