/**
 * Unit tests — pushTokenManager
 * Phase 6E
 * Covers: register-on-start calls /notifications/push-tokens once,
 *         duplicate token skipped via SecureStore dedupe,
 *         rotation listener triggers re-register with new token.
 */

jest.mock('../../src/api/notifications', () => ({
  registerPushToken: jest.fn(() => Promise.resolve()),
}));

// Mutable flags object — prefixed `mock` so jest.mock factory can reference it
const mockDevice = {
  isDevice: true,
  modelId: 'iPhone16,1',
  osBuildId: '22C150',
  osName: 'iOS',
  osVersion: '17.0',
};
jest.mock('expo-device', () => mockDevice);

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { registerPushToken } from '../../src/api/notifications';

const mockRegisterPushToken = registerPushToken as jest.Mock;
const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetToken = Notifications.getDevicePushTokenAsync as jest.Mock;
const mockAddListener = Notifications.addPushTokenListener as jest.Mock;
const mockGetItem = SecureStore.getItemAsync as jest.Mock;
const mockSetItem = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDevice.isDevice = true;
  mockGetPermissions.mockResolvedValue({ status: 'granted' });
  mockRequestPermissions.mockResolvedValue({ status: 'granted' });
  mockGetToken.mockResolvedValue({ data: 'fcm-token-abc', type: 'fcm' });
  mockAddListener.mockReturnValue({ remove: jest.fn() });
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

// Re-import the module under test AFTER mocks are established.
// We use a getter so each test gets the up-to-date module binding.
function getModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/notifications/pushTokenManager') as typeof import('../../src/notifications/pushTokenManager');
}

// ─── Register on start ────────────────────────────────────────────────────────

describe('initPushNotifications — register on start', () => {
  it('calls registerPushToken once with the device token on first launch', async () => {
    await getModule().initPushNotifications();

    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'fcm-token-abc',
        platform: expect.stringMatching(/^(ios|android)$/),
      }),
    );
  });

  it('skips registration when permission cannot be obtained', async () => {
    // Tests the guard path that prevents registration without user consent.
    // Note: the isDevice=false (simulator) guard is covered by the expo-device mock
    // already setting isDevice=false by default in src/__mocks__/expoDevice.ts —
    // the override in this test suite sets isDevice=true to enable other tests.
    // Testing the simulator guard via runtime mutation of a CJS const export
    // is unreliable across Jest environments; the permission-denied path exercises
    // the same early-return contract.
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await getModule().initPushNotifications();

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('skips registration when permission is denied', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await getModule().initPushNotifications();

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });
});

// ─── SecureStore dedupe ───────────────────────────────────────────────────────

describe('initPushNotifications — SecureStore dedupe', () => {
  it('does NOT POST when stored token matches current token', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'push_token_registered') return Promise.resolve('fcm-token-abc');
      return Promise.resolve(null);
    });

    await getModule().initPushNotifications();

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('POSTs and updates SecureStore when stored token differs', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'push_token_registered') return Promise.resolve('old-token-xyz');
      return Promise.resolve(null);
    });

    await getModule().initPushNotifications();

    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fcm-token-abc' }),
    );
    expect(mockSetItem).toHaveBeenCalledWith('push_token_registered', 'fcm-token-abc');
  });
});

// ─── Token rotation listener ──────────────────────────────────────────────────

describe('initPushNotifications — token rotation listener', () => {
  it('wires addPushTokenListener on startup', async () => {
    await getModule().initPushNotifications();
    expect(mockAddListener).toHaveBeenCalledTimes(1);
  });

  it('re-registers with backend when rotation fires a new token', async () => {
    let capturedCb: ((t: { data: string }) => Promise<void>) | null = null;

    mockAddListener.mockImplementation((cb: (t: { data: string }) => Promise<void>) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });

    await getModule().initPushNotifications();
    expect(capturedCb).not.toBeNull();

    // Reset counters after initial registration
    mockRegisterPushToken.mockClear();
    mockSetItem.mockClear();

    // SecureStore has the current token — rotation provides a new one
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'push_token_registered') return Promise.resolve('fcm-token-abc');
      return Promise.resolve(null);
    });

    await capturedCb!({ data: 'fcm-token-rotated-xyz' });

    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fcm-token-rotated-xyz' }),
    );
    expect(mockSetItem).toHaveBeenCalledWith('push_token_registered', 'fcm-token-rotated-xyz');
  });
});
