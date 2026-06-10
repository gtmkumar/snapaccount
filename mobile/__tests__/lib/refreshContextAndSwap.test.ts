/**
 * refreshContextAndSwap() — GAP-007 / BUG-5
 *
 * Verifies:
 *  1. On success: calls POST /auth/token/refresh-context, swaps the access token
 *     in the auth store, and returns true.
 *  2. On failure: returns false, does NOT update the access token, does NOT throw
 *     (graceful fallback — onboarding / invite accept must not be blocked).
 *  3. SecureStore persistence: setItemAsync is called (store persists via SecureStore
 *     adapter); AsyncStorage.setItem is NOT called.
 *
 * Same mock setup as api.interceptor.test.ts (global.fetch no-op to avoid the
 * expo/virtual/streams crash; react-native Platform stub; expo-constants stub).
 */

// ── Mocks (before any non-jest imports) ──────────────────────────────────────

jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// expo-secure-store and @react-native-async-storage/async-storage are mapped via
// moduleNameMapper in package.json — no explicit jest.mock() needed here.

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  } as Response),
);

// ── Imports ───────────────────────────────────────────────────────────────────

import { apiClient, refreshContextAndSwap } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const user = {
  id: 'u1',
  firebaseUid: 'f1',
  phone: '+919999999999',
  userType: 'business_owner' as const,
  profileComplete: true,
  aadhaarVerified: false,
  createdAt: '2026-01-01T00:00:00Z',
};

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.getState().setAuthenticated('old-access-token', user, 'original-refresh-token');
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
});

afterEach(() => {
  useAuthStore.getState().signOut();
});

// ── Success path ──────────────────────────────────────────────────────────────

describe('success — token swap', () => {
  it('calls POST /auth/token/refresh-context with no body', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { accessToken: 'new-org-token', expiresAt: '2026-06-10T22:00:00Z' },
      status: 200,
      headers: {},
      config: {},
      statusText: 'OK',
    });

    await refreshContextAndSwap();

    expect(postSpy).toHaveBeenCalledWith('/auth/token/refresh-context');
    postSpy.mockRestore();
  });

  it('returns true on success', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { accessToken: 'new-token', expiresAt: '2026-06-10T22:00:00Z' },
      status: 200,
      headers: {},
      config: {},
      statusText: 'OK',
    });

    const result = await refreshContextAndSwap();

    expect(result).toBe(true);
    postSpy.mockRestore();
  });

  it('atomically swaps firebaseToken in the auth store', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { accessToken: 'org-scoped-token', expiresAt: '2026-06-10T22:00:00Z' },
      status: 200,
      headers: {},
      config: {},
      statusText: 'OK',
    });

    await refreshContextAndSwap();

    expect(useAuthStore.getState().firebaseToken).toBe('org-scoped-token');
    postSpy.mockRestore();
  });

  it('does NOT rotate the refresh token (refresh-context contract)', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { accessToken: 'new-access', expiresAt: '2026-06-10T22:00:00Z' },
      status: 200,
      headers: {},
      config: {},
      statusText: 'OK',
    });

    await refreshContextAndSwap();

    // The opaque refresh token must be unchanged
    expect(useAuthStore.getState().refreshToken).toBe('original-refresh-token');
    postSpy.mockRestore();
  });

  it('uses SecureStore (not AsyncStorage) for token persistence', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage')
      .default as typeof import('@react-native-async-storage/async-storage').default;

    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();

    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { accessToken: 'persisted-token', expiresAt: '2026-06-10T22:00:00Z' },
      status: 200,
      headers: {},
      config: {},
      statusText: 'OK',
    });

    await refreshContextAndSwap();
    // Let the persist middleware's async write settle
    await Promise.resolve();

    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    postSpy.mockRestore();
  });
});

// ── Failure / graceful fallback ───────────────────────────────────────────────

describe('failure — graceful fallback', () => {
  it('returns false when the API call throws (network error)', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockRejectedValueOnce(
      new Error('Network Error'),
    );

    const result = await refreshContextAndSwap();

    expect(result).toBe(false);
    postSpy.mockRestore();
  });

  it('does NOT update the access token when the call fails', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockRejectedValueOnce(
      new Error('500 Internal Server Error'),
    );

    await refreshContextAndSwap();

    // Token must remain unchanged — fallback to existing (org-less) token
    expect(useAuthStore.getState().firebaseToken).toBe('old-access-token');
    postSpy.mockRestore();
  });

  it('does NOT throw — caller flow must not be blocked on failure', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockRejectedValueOnce(
      new Error('401 Unauthorized'),
    );

    // Must resolve (not reject) even when the API call fails
    await expect(refreshContextAndSwap()).resolves.toBe(false);
    postSpy.mockRestore();
  });

  it('does NOT sign the user out on failure', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockRejectedValueOnce(
      new Error('Timeout'),
    );

    await refreshContextAndSwap();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    postSpy.mockRestore();
  });
});
