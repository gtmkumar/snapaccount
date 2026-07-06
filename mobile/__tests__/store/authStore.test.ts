/**
 * authStore — unit tests for refresh-token fields (SEC-025)
 * and account-deletion signOut behaviour (DPDP-001).
 */

// The moduleNameMapper in package.json already maps expo-secure-store to
// src/__mocks__/secureStore.ts, so we don't need an explicit jest.mock() here.
// Adding one with require() inside the factory causes an infinite recursion
// because the factory is itself subject to the mapper.

import { useAuthStore } from '../../src/store/authStore';
import { queryClient } from '../../src/lib/queryClient';

const user = {
  id: 'u1',
  firebaseUid: 'f1',
  phone: '+919999999999',
  userType: 'business_owner' as const,
  profileComplete: true,
  aadhaarVerified: false,
  createdAt: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  useAuthStore.getState().signOut();
});

describe('setAuthenticated', () => {
  it('stores refreshToken when provided', () => {
    useAuthStore.getState().setAuthenticated('access-1', user, 'refresh-1');
    const state = useAuthStore.getState();
    expect(state.firebaseToken).toBe('access-1');
    expect(state.refreshToken).toBe('refresh-1');
    expect(state.isAuthenticated).toBe(true);
  });

  it('defaults refreshToken to null when omitted', () => {
    useAuthStore.getState().setAuthenticated('access-1', user);
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});

describe('setSession', () => {
  it('stores refreshToken when provided', () => {
    useAuthStore.getState().setSession('access-2', user, 'refresh-2');
    const state = useAuthStore.getState();
    expect(state.firebaseToken).toBe('access-2');
    expect(state.refreshToken).toBe('refresh-2');
    // setSession must NOT mark isAuthenticated = true (onboarding flow)
    expect(state.isAuthenticated).toBe(false);
  });

  it('defaults refreshToken to null when omitted', () => {
    useAuthStore.getState().setSession('access-2', user);
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});

describe('rotateTokens', () => {
  it('updates both accessToken and refreshToken atomically', () => {
    useAuthStore.getState().setAuthenticated('old-access', user, 'old-refresh');
    useAuthStore.getState().rotateTokens('new-access', 'new-refresh');
    const state = useAuthStore.getState();
    expect(state.firebaseToken).toBe('new-access');
    expect(state.refreshToken).toBe('new-refresh');
    // Must not alter other fields
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('u1');
  });
});

describe('signOut', () => {
  it('clears firebaseToken, refreshToken, and user', () => {
    useAuthStore.getState().setAuthenticated('access-3', user, 'refresh-3');
    useAuthStore.getState().signOut();
    const state = useAuthStore.getState();
    expect(state.firebaseToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  // Regression: a fresh user signing in on the same running app instance must
  // never see the previous user's cached server state ("fake data"). signOut
  // must purge the TanStack Query cache, not just the auth fields.
  it('clears the TanStack Query cache so the next user sees no stale data', () => {
    queryClient.setQueryData(['dashboard-metrics', undefined, 'FY2025-26'], {
      totalSales: 999999,
    });
    expect(
      queryClient.getQueryData(['dashboard-metrics', undefined, 'FY2025-26']),
    ).toBeDefined();

    useAuthStore.getState().signOut();

    expect(
      queryClient.getQueryData(['dashboard-metrics', undefined, 'FY2025-26']),
    ).toBeUndefined();
  });
});

// GAP-007 / BUG-5 — swapAccessToken (refresh-context, no refresh-token rotation)
describe('swapAccessToken', () => {
  it('updates firebaseToken without touching refreshToken', () => {
    useAuthStore.getState().setAuthenticated('old-access', user, 'original-refresh');
    useAuthStore.getState().swapAccessToken('new-org-access');
    const state = useAuthStore.getState();
    expect(state.firebaseToken).toBe('new-org-access');
    // refreshToken must be unchanged — refresh-context does not rotate it
    expect(state.refreshToken).toBe('original-refresh');
  });

  it('does not alter isAuthenticated or user fields', () => {
    useAuthStore.getState().setAuthenticated('old-access', user, 'rt');
    useAuthStore.getState().swapAccessToken('fresh-access');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('u1');
  });

  it('uses SecureStore (not AsyncStorage) — setItemAsync called, AsyncStorage.setItem not', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage')
      .default as typeof import('@react-native-async-storage/async-storage').default;

    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();

    useAuthStore.getState().setAuthenticated('token-a', user, 'refresh-a');
    useAuthStore.getState().swapAccessToken('token-b');

    // Allow the persist middleware's async write to settle.
    await Promise.resolve();

    // The store's SecureStore adapter must have been called (persist middleware).
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    // AsyncStorage must NOT have been used — tokens go through SecureStore only.
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
