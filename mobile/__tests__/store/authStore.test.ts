/**
 * authStore — unit tests for refresh-token fields (SEC-025)
 * and account-deletion signOut behaviour (DPDP-001).
 */

// The moduleNameMapper in package.json already maps expo-secure-store to
// src/__mocks__/secureStore.ts, so we don't need an explicit jest.mock() here.
// Adding one with require() inside the factory causes an infinite recursion
// because the factory is itself subject to the mapper.

import { useAuthStore } from '../../src/store/authStore';

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
});
