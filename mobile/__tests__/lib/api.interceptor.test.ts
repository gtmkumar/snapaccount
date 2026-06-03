/**
 * api.ts interceptor tests — refresh-token rotation + account deletion
 *
 * SEC-025: Refresh-token rotation
 * DPDP-001: Account deletion (Right to Erasure)
 *
 * We test the interceptor by calling its rejected handler directly with
 * fabricated AxiosError objects. We do NOT make real HTTP calls.
 *
 * axios/lib/adapters/fetch.js crashes on import in the jest environment because
 * expo/virtual/streams conflicts with Node's built-in ReadableStream. We avoid
 * this by mocking 'axios' before it is imported, then re-building a minimal
 * axios instance whose interceptors we can exercise.
 */

// ── Mocks (must be declared before any non-jest imports) ─────────────────

jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// expo-secure-store is mapped via moduleNameMapper in package.json.

// Block the fetch adapter crash: axios will fall back to XMLHttpRequest or
// throw — neither matters because we never let a request reach the adapter
// in these tests. We do this by providing a no-op fetch global.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
);

// ── Imports ───────────────────────────────────────────────────────────────

import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

// Import apiClient AFTER global.fetch is set so axios does not crash.
import { apiClient, deleteAccount } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeAxiosError(status: number, url = '/some/endpoint'): AxiosError {
  const config: InternalAxiosRequestConfig & { _retry?: boolean } = {
    url,
    headers: new AxiosHeaders({ Authorization: 'Bearer old-token' }),
    _retry: false,
  } as InternalAxiosRequestConfig & { _retry?: boolean };

  const err = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config);
  err.response = {
    status,
    data: {},
    headers: {},
    config,
    statusText: String(status),
  };
  return err;
}

/** The last registered response interceptor (the one added by api.ts). */
function getInterceptor() {
  const handlers = (apiClient.interceptors.response as unknown as {
    handlers: Array<{ fulfilled?: unknown; rejected?: (e: unknown) => Promise<unknown> }>;
  }).handlers;
  const interceptor = handlers[handlers.length - 1];
  if (!interceptor?.rejected) throw new Error('Interceptor not found');
  return interceptor.rejected;
}

// ── Setup ─────────────────────────────────────────────────────────────────

const user = {
  id: 'u1',
  firebaseUid: 'f1',
  phone: '+919999999999',
  userType: 'business_owner' as const,
  profileComplete: true,
  aadhaarVerified: false,
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  useAuthStore.getState().setAuthenticated('access-token-1', user, 'refresh-token-1');
  jest.clearAllMocks();
  // Re-seed global.fetch for each test.
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true, status: 200, json: () => Promise.resolve({}),
  });
});

afterEach(() => {
  useAuthStore.getState().signOut();
});

// ── Non-401 errors pass through ───────────────────────────────────────────

describe('non-401 errors', () => {
  it('re-rejects 403 without touching the auth store', async () => {
    const reject = getInterceptor();
    await expect(reject(makeAxiosError(403))).rejects.toBeDefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('re-rejects 500 without touching the auth store', async () => {
    const reject = getInterceptor();
    await expect(reject(makeAxiosError(500))).rejects.toBeDefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

// ── 401 guard conditions ──────────────────────────────────────────────────

describe('401 guard conditions', () => {
  it('signs out when 401 comes from /auth/token/refresh (prevent infinite loop)', async () => {
    const reject = getInterceptor();
    await expect(
      reject(makeAxiosError(401, '/auth/token/refresh')),
    ).rejects.toBeDefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('signs out when no refreshToken is stored', async () => {
    useAuthStore.setState({ refreshToken: null });
    const reject = getInterceptor();
    await expect(reject(makeAxiosError(401))).rejects.toBeDefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('signs out when _retry is already true (no double-retry)', async () => {
    const err = makeAxiosError(401);
    (err.config as { _retry?: boolean })._retry = true;
    const reject = getInterceptor();
    await expect(reject(err)).rejects.toBeDefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ── Successful token rotation ─────────────────────────────────────────────

describe('successful token rotation', () => {
  it('calls POST /auth/token/refresh with stored refreshToken and rotates tokens', async () => {
    const postSpy = jest.spyOn(apiClient, 'post')
      // First call = refresh endpoint.
      .mockResolvedValueOnce({
        data: {
          accessToken: 'access-token-2',
          newRefreshToken: 'refresh-token-2',
          expiresAt: '2026-12-31T00:00:00Z',
        },
        status: 200,
        headers: {},
        config: {},
        statusText: 'OK',
      });

    // The interceptor calls `apiClient(originalConfig)` for the retry.
    // Mock at the adapter level: patch global.fetch to return 200 for the retry.
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ retried: true }),
      text: () => Promise.resolve(JSON.stringify({ retried: true })),
    });

    const reject = getInterceptor();
    // The retry may succeed or fail depending on how axios serialises the
    // config — we care only about the store mutations before the retry fires.
    try {
      await reject(makeAxiosError(401, '/documents/list'));
    } catch {
      // Tolerate any error from the retry step.
    }

    expect(postSpy).toHaveBeenCalledWith('/auth/token/refresh', { token: 'refresh-token-1' });
    expect(useAuthStore.getState().firebaseToken).toBe('access-token-2');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-token-2');

    postSpy.mockRestore();
  });

  it('signs out when the refresh POST call itself rejects', async () => {
    const postSpy = jest.spyOn(apiClient, 'post')
      .mockRejectedValueOnce(new Error('Network error'));

    const reject = getInterceptor();
    await expect(reject(makeAxiosError(401, '/accounting/ledger'))).rejects.toBeDefined();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    postSpy.mockRestore();
  });
});

// ── deleteAccount ─────────────────────────────────────────────────────────

describe('deleteAccount', () => {
  it('calls DELETE /auth/account', async () => {
    const deleteSpy = jest.spyOn(apiClient, 'delete')
      .mockResolvedValueOnce({
        status: 204,
        data: undefined,
        headers: {},
        config: {},
        statusText: 'No Content',
      });

    await deleteAccount();

    expect(deleteSpy).toHaveBeenCalledWith('/auth/account');
    deleteSpy.mockRestore();
  });

  it('propagates errors from DELETE /auth/account', async () => {
    const deleteSpy = jest.spyOn(apiClient, 'delete')
      .mockRejectedValueOnce(new Error('server error'));

    await expect(deleteAccount()).rejects.toThrow('server error');
    deleteSpy.mockRestore();
  });
});
