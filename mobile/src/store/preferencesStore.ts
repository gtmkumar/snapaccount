/**
 * User Preferences Zustand Store
 * Language, theme, notification settings — persisted to AsyncStorage (non-sensitive)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AppLanguage =
  | 'en'
  | 'hi'
  | 'bn'
  | 'gu'
  | 'ta'
  | 'te'
  | 'kn'
  | 'mr'
  | 'ml'
  | 'pa'
  | 'or';

export type AppTheme = 'light'; // dark mode future

export interface NotificationPreferences {
  gstDeadlines: boolean;
  itrReminders: boolean;
  documentStatus: boolean;
  loanUpdates: boolean;
  chatMessages: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
}

export interface PreferencesState {
  language: AppLanguage;
  theme: AppTheme;
  notifications: NotificationPreferences;
  hasCompletedOnboarding: boolean;
  hasSelectedLanguage: boolean;
  hasGrantedPermissions: boolean;

  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
  updateNotifications: (updates: Partial<NotificationPreferences>) => void;
  setOnboardingComplete: () => void;
  setLanguageSelected: () => void;
  setPermissionsGranted: () => void;
  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Language metadata
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUAGES: Record<AppLanguage, { label: string; nativeLabel: string }> = {
  en: { label: 'English', nativeLabel: 'English' },
  hi: { label: 'Hindi', nativeLabel: 'हिंदी' },
  bn: { label: 'Bengali', nativeLabel: 'বাংলা' },
  gu: { label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  ta: { label: 'Tamil', nativeLabel: 'தமிழ்' },
  te: { label: 'Telugu', nativeLabel: 'తెలుగు' },
  kn: { label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  mr: { label: 'Marathi', nativeLabel: 'मराठी' },
  ml: { label: 'Malayalam', nativeLabel: 'മലയാളം' },
  pa: { label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
  or: { label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

const defaultNotifications: NotificationPreferences = {
  gstDeadlines: true,
  itrReminders: true,
  documentStatus: true,
  loanUpdates: true,
  chatMessages: true,
  pushEnabled: true,
  smsEnabled: true,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      language: 'en',
      theme: 'light',
      notifications: defaultNotifications,
      hasCompletedOnboarding: false,
      hasSelectedLanguage: false,
      hasGrantedPermissions: false,

      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      updateNotifications: (updates) =>
        set((state) => ({
          notifications: { ...state.notifications, ...updates },
        })),
      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),
      setLanguageSelected: () => set({ hasSelectedLanguage: true }),
      setPermissionsGranted: () => set({ hasGrantedPermissions: true }),
      reset: () =>
        set({
          language: 'en',
          theme: 'light',
          notifications: defaultNotifications,
          hasCompletedOnboarding: false,
          hasSelectedLanguage: false,
          hasGrantedPermissions: false,
        }),
    }),
    {
      name: 'snapaccount-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
