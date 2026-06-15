/**
 * Auth Zustand Store
 * Persists to expo-secure-store for encrypted storage of sensitive auth data
 */

import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UserType = 'business_owner' | 'employee' | null;

export interface UserProfile {
  id: string;
  firebaseUid: string;
  phone: string;
  email?: string;
  name?: string;
  userType: UserType;
  panNumber?: string;
  aadhaarVerified: boolean;
  profileComplete: boolean;
  avatarUrl?: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  gstin?: string;
  panNumber?: string;
  businessType?: string;
  address?: string;
  state?: string;
  pinCode?: string;
  industry?: string;
  annualTurnover?: number;
}

export interface AuthState {
  // Auth status
  isAuthenticated: boolean;
  isLoading: boolean;
  firebaseToken: string | null;

  // SEC-025: Refresh token for silent re-authentication.
  // Stored in SecureStore via the persist adapter (same security as firebaseToken).
  refreshToken: string | null;

  // User data
  user: UserProfile | null;
  currentOrganization: Organization | null;
  organizations: Organization[];

  // Actions
  setAuthenticated: (token: string, user: UserProfile, refreshToken?: string | null) => void;
  // Store the session token + user WITHOUT entering the app yet (used during
  // new-user onboarding so the wizard can make authenticated calls while the
  // Auth stack stays visible). Call markAuthenticated() to enter the app.
  setSession: (token: string, user: UserProfile, refreshToken?: string | null) => void;
  markAuthenticated: () => void;
  setUser: (user: UserProfile) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setCurrentOrganization: (org: Organization) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
  // Rotate tokens after a successful silent refresh.
  rotateTokens: (accessToken: string, newRefreshToken: string) => void;
  // GAP-007 / BUG-5: Swap ONLY the access token after a refresh-context call.
  // The opaque refresh token is NOT rotated — only the in-memory Bearer is updated.
  swapAccessToken: (accessToken: string) => void;
  signOut: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SecureStore adapter for zustand persist
// ─────────────────────────────────────────────────────────────────────────────

const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isLoading: true,
      firebaseToken: null,
      refreshToken: null,
      user: null,
      currentOrganization: null,
      organizations: [],

      setAuthenticated: (token, user, refreshToken = null) =>
        set({
          isAuthenticated: true,
          firebaseToken: token,
          refreshToken,
          user,
          isLoading: false,
        }),

      setSession: (token, user, refreshToken = null) =>
        set({
          firebaseToken: token,
          refreshToken,
          user,
          isLoading: false,
        }),

      markAuthenticated: () =>
        set({
          isAuthenticated: true,
          isLoading: false,
        }),

      setUser: (user) => set({ user }),

      setOrganizations: (orgs) =>
        set({
          organizations: orgs,
          currentOrganization: orgs[0] ?? null,
        }),

      setCurrentOrganization: (org) => set({ currentOrganization: org }),

      updateProfile: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setLoading: (loading) => set({ isLoading: loading }),

      rotateTokens: (accessToken, newRefreshToken) =>
        set({
          firebaseToken: accessToken,
          refreshToken: newRefreshToken,
        }),

      // GAP-007 / BUG-5: Re-mint org context without rotating the refresh token.
      // Only firebaseToken (the in-memory Bearer) is updated.
      // SecureStore persistence: firebaseToken is excluded from partialize, so
      // SecureStore is not written with the new token — the refreshToken persisted
      // in SecureStore is unchanged, preserving the ability to silently re-auth.
      swapAccessToken: (accessToken) =>
        set({ firebaseToken: accessToken }),

      signOut: () =>
        set({
          isAuthenticated: false,
          firebaseToken: null,
          refreshToken: null,
          user: null,
          currentOrganization: null,
          organizations: [],
          isLoading: false,
        }),
    }),
    {
      name: 'snapaccount-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        // SEC-023: Exclude panNumber from SecureStore persistence.
        // PAN is sensitive PII under DPDP Act 2023. Even though SecureStore
        // uses iOS Keychain / Android Keystore encryption, PAN should not be
        // persisted at rest on device — it must always be fetched from the
        // authenticated backend on session restore.
        user: state.user
          ? {
              ...state.user,
              panNumber: undefined, // Never persist PAN to SecureStore
            }
          : null,
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              panNumber: undefined, // Organization PAN also excluded
            }
          : null,
        organizations: state.organizations.map((org) => ({
          ...org,
          panNumber: undefined, // Strip PAN from all org entries
        })),
        // SEC-025: refreshToken IS persisted so the app can silently re-authenticate
        // on the next launch without forcing the user through OTP/password again.
        // SecureStore uses iOS Keychain / Android Keystore — encrypted at rest.
        // accessToken (firebaseToken) is NOT persisted — always re-issued via refresh.
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
