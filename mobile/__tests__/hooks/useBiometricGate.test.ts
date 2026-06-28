/**
 * useBiometricGate — M4 (GAP-063) + DG-MOBUX-07 (grace window + refusal flow).
 * Tests cover:
 *  1. Happy path: hardware + enrolled → authenticateAsync → resolves true
 *  2. Auth failure → first-refusal retry Alert; decline retry → resolves false
 *  3. Auth failure → retry → success on retry → resolves true
 *  4. No hardware: falls back to Alert-confirm → resolves true on confirm
 *  5. Hardware present, not enrolled: falls back to Alert-confirm
 *  6. Grace window: a second trigger on the same flowKey skips the prompt
 *  7. Security setting OFF: gate passes through without prompting
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

// Settings store — control requireBiometricSensitive / graceWindow per test.
let mockSettings = {
  autoUploadOnCellular: false,
  compressBeforeUpload: true,
  showNetworkChip: true,
  requireBiometricSensitive: true,
  biometricGraceWindow: '5min' as const,
};
jest.mock('../../src/lib/appSettings', () => ({
  loadSettings: () => Promise.resolve(mockSettings),
  GRACE_WINDOW_MS: { '5min': 5 * 60 * 1000, '1min': 60 * 1000, never: 0 },
}));

// expo-local-authentication is mapped via jest moduleNameMapper to the mock at
// src/__mocks__/expoLocalAuthentication.ts — import after mocking react-native.
import * as LocalAuthentication from 'expo-local-authentication';
import {
  useBiometricGate,
  __resetBiometricGraceForTests,
} from '../../src/hooks/useBiometricGate';

const mockHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
const mockAuthenticate = LocalAuthentication.authenticateAsync as jest.Mock;

/** Alert handler that taps the first non-cancel ("retry"/"confirm") button. */
const tapConfirm = (
  _title: string,
  _msg: string,
  buttons: Array<{ text: string; style?: string; onPress?: () => void }>,
) => {
  const confirm = buttons.find((b) => b.style !== 'cancel');
  confirm?.onPress?.();
};
/** Alert handler that taps the cancel button. */
const tapCancel = (
  _title: string,
  _msg: string,
  buttons: Array<{ text: string; style?: string; onPress?: () => void }>,
) => {
  const cancel = buttons.find((b) => b.style === 'cancel');
  cancel?.onPress?.();
};

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockResolvedValue(true);
  mockAuthenticate.mockResolvedValue({ success: true });
  mockAlertImpl = () => {};
  mockSettings = {
    autoUploadOnCellular: false,
    compressBeforeUpload: true,
    showNetworkChip: true,
    requireBiometricSensitive: true,
    biometricGraceWindow: '5min',
  };
  __resetBiometricGraceForTests();
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

  it('first refusal shows a retry Alert; declining the retry resolves false', async () => {
    mockAuthenticate.mockResolvedValue({ success: false, error: 'user_cancel' });
    // The refusal Alert is the only Alert here — tap Cancel to give up.
    mockAlertImpl = tapCancel;
    const { result } = renderHook(() => useBiometricGate());
    let passed = true;
    await act(async () => {
      passed = await result.current.trigger();
    });
    expect(passed).toBe(false);
  });

  it('refusal → retry → success on retry resolves true', async () => {
    mockAuthenticate
      .mockResolvedValueOnce({ success: false, error: 'user_cancel' })
      .mockResolvedValueOnce({ success: true });
    mockAlertImpl = tapConfirm; // tap "Try again"
    const { result } = renderHook(() => useBiometricGate());
    let passed = false;
    await act(async () => {
      passed = await result.current.trigger();
    });
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    expect(passed).toBe(true);
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
    mockAlertImpl = tapConfirm;

    const { result } = renderHook(() => useBiometricGate());
    let passed = false;
    await act(async () => {
      passed = await result.current.trigger();
    });

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(passed).toBe(true);
  });

  it('falls back to Alert when no hardware — cancel then decline retry resolves false', async () => {
    mockHasHardware.mockResolvedValue(false);
    mockAlertImpl = tapCancel; // cancel the fallback confirm, then cancel the retry

    const { result } = renderHook(() => useBiometricGate());
    let passed = true;
    await act(async () => {
      passed = await result.current.trigger();
    });

    expect(passed).toBe(false);
  });

  it('grace window: a second trigger on the same flowKey skips re-prompting', async () => {
    const { result } = renderHook(() => useBiometricGate());
    await act(async () => {
      await result.current.trigger({ flowKey: 'loan.submit' });
    });
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);

    // Second call within the 5-min grace must NOT prompt again.
    let passed = false;
    await act(async () => {
      passed = await result.current.trigger({ flowKey: 'loan.submit' });
    });
    expect(passed).toBe(true);
    expect(mockAuthenticate).toHaveBeenCalledTimes(1); // still 1 — grace honoured
  });

  it('forcePrompt ignores the grace window', async () => {
    const { result } = renderHook(() => useBiometricGate());
    await act(async () => {
      await result.current.trigger({ flowKey: 'account.delete' });
    });
    await act(async () => {
      await result.current.trigger({ flowKey: 'account.delete', forcePrompt: true });
    });
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
  });

  it('passes through without prompting when the Security setting is off', async () => {
    mockSettings.requireBiometricSensitive = false;
    const { result } = renderHook(() => useBiometricGate());
    let passed = false;
    await act(async () => {
      passed = await result.current.trigger({ flowKey: 'gst.approve' });
    });
    expect(passed).toBe(true);
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });
});
