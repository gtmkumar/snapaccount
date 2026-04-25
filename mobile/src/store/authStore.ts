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

  // User data
  user: UserProfile | null;
  currentOrganization: Organization | null;
  organizations: Organization[];

  // Actions
  setAuthenticated: (token: string, user: UserProfile) => void;
  setUser: (user: UserProfile) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setCurrentOrganization: (org: Organization) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
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
      user: null,
      currentOrganization: null,
      organizations: [],

      setAuthenticated: (token, user) =>
        set({
          isAuthenticated: true,
          firebaseToken: token,
          user,
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

      signOut: () =>
        set({
          isAuthenticated: false,
          firebaseToken: null,
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
        // Note: firebaseToken NOT persisted — always refreshed from Firebase
      }),
    },
  ),
);
