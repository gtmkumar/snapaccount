/**
 * useBiometricGate — M4 (GAP-063)
 * Tests cover:
 *  1. Happy path: hardware + enrolled → authenticateAsync → resolves true
 *  2. Auth failure: authenticateAsync returns { success: false } → resolves false
 *  3. No hardware: falls back to Alert-confirm → resolves true on confirm
 *  4. Hardware present, not enrolled: falls back to Alert-confirm → resolves false on cancel
 */

import { renderHook, act } from '@testing-library/react-native';

// ── Module mocks ─────────────────────────────────────────────────────────────

// Mutable implementation — name starts with "mock" so jest.mock factory can reference it.
let mockAlertImpl: (
  title: string,
  msg: string,
  buttons: Array<{ text: string; style?: string; onPress?: () => void }>,
  options?: unknown,
) => void = () => {};

jest.mock('react-native', () => ({
  Alert: {
    alert: (
      title: string,
      msg: string,
      buttons: Array<{ text: string; style?: string; onPress?: () => void }>,
      options?: unknown,
    ) => mockAlertImpl(title, msg, buttons, options),
  },
  Platform: { OS: 'ios' },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// expo-local-authentication is mapped via jest moduleNameMapper to the mock at
// src/__mocks__/expoLocalAuthentication.ts — import after mocking react-native.
import * as LocalAuthentication from 'expo-local-authentication';
import { useBiometricGate } from '../../src/hooks/useBiometricGate';

const mockHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
const mockAuthenticate = LocalAuthentication.authenticateAsync as jest.Mock;

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockResolvedValue(true);
  mockAuthenticate.mockResolvedValue({ success: true });
  mockAlertImpl = () => {};
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBiometricGate', () => {
  it('resolves true when biometric authentication succeeds', async () => {
    const { result } = renderHook(() => useBiometricGate());
    let passed = false;
    await act(async () => {
      passed = await result.current.trigger();
    });
    expect(mockAuthenticate).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
    expect(passed).toBe(true);
  });

  it('resolves false when authenticateAsync returns success: false', async () => {
    mockAuthenticate.mockResolvedValue({ success: false, error: 'user_cancel' });
    const { result } = renderHook(() => useBiometricGate());
    let passed = true;
    await act(async () => {
      passed = await result.current.trigger();
    });
    expect(passed).toBe(false);
  });

  it('passes custom promptMessage to authenticateAsync', async () => {
    const { result } = renderHook(() => useBiometricGate());
    await act(async () => {
      await result.current.trigger({ promptMessage: 'Confirm GST approval' });
    });
    expect(mockAuthenticate).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Confirm GST approval' }),
    );
  });

  it('falls back to Alert confirm when no biometric hardware — confirm resolves true', async () => {
    mockHasHardware.mockResolvedValue(false);

    // Simulate user tapping Confirm in the Alert
    mockAlertImpl = (_title, _msg, buttons) => {
      const confirm = buttons.find((b) => b.style !== 'cancel');
      confirm?.onPress?.();
    };

    const { result } = renderHook(() => useBiometricGate());
    let passed = false;
    await act(async () => {
      passed = await result.current.trigger();
    });

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(passed).toBe(true);
  });

  it('falls back to Alert when no hardware — cancel resolves false', async () => {
    mockHasHardware.mockResolvedValue(false);

    mockAlertImpl = (_title, _msg, buttons) => {
      const cancel = buttons.find((b) => b.style === 'cancel');
      cancel?.onPress?.();
    };

    const { result } = renderHook(() => useBiometricGate());
    let passed = true;
    await act(async () => {
      passed = await result.current.trigger();
    });

    expect(passed).toBe(false);
  });

  it('falls back to Alert when hardware present but not enrolled', async () => {
    mockHasHardware.mockResolvedValue(true);
    mockIsEnrolled.mockResolvedValue(false);
    let alertCalled = false;
    mockAlertImpl = () => { alertCalled = true; };

    const { result } = renderHook(() => useBiometricGate());
    await act(async () => {
      // Trigger but don't await — Alert doesn't resolve since we don't tap
      result.current.trigger().catch(() => {});
    });

    expect(alertCalled).toBe(true);
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });
});
