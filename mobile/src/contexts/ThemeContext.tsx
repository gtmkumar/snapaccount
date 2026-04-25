/**
 * ThemeContext — system-following dark mode with manual override.
 * Phase 6F · Track F4 · docs/design/mobile/ux/dark-mode-mobile.md
 *
 * - Reads preference from AsyncStorage (non-sensitive; theme pref is not secret).
 * - 'system' (default) follows Appearance API.
 * - Provides isDark boolean + setTheme(pref) + theme colors to children.
 * - PATCH /me/preferences {theme} debounced (best-effort, not blocking).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeTokens {
  canvas: string;
  raised: string;
  sunken: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  brand500: string;
  brand400: string;
  border: string;
  inputBg: string;
  skeleton1: string;
  skeleton2: string;
  shadowColor: string;
}

export interface ThemeContextValue {
  preference: ThemePreference;
  isDark: boolean;
  tokens: ThemeTokens;
  setTheme: (pref: ThemePreference) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token maps
// ─────────────────────────────────────────────────────────────────────────────

const LIGHT_TOKENS: ThemeTokens = {
  canvas: '#F8FAFC',
  raised: '#FFFFFF',
  sunken: '#F1F5F9',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  brand500: '#6366F1',
  brand400: '#818CF8',
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
  skeleton1: '#E2E8F0',
  skeleton2: '#F1F5F9',
  shadowColor: '#0F172A',
};

const DARK_TOKENS: ThemeTokens = {
  canvas: '#0F172A',
  raised: '#1E293B',
  sunken: '#0F172A',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#475569',
  brand500: '#818CF8',  // lifted saturation for dark bg
  brand400: '#A5B4FC',
  border: '#334155',
  inputBg: '#1E293B',
  skeleton1: '#1E293B',
  skeleton2: '#334155',
  shadowColor: '#000000',
};

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@snapaccount/theme_preference';

async function loadPreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'system';
}

async function savePreference(pref: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore storage errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  isDark: false,
  tokens: LIGHT_TOKENS,
  setTheme: () => undefined,
});

function resolveIsDark(
  pref: ThemePreference,
  systemScheme: ColorSchemeName,
): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return systemScheme === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted preference on mount
  useEffect(() => {
    loadPreference().then(setPreference);
  }, []);

  // Subscribe to system appearance changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const isDark = useMemo(
    () => resolveIsDark(preference, systemScheme),
    [preference, systemScheme],
  );

  const tokens = isDark ? DARK_TOKENS : LIGHT_TOKENS;

  const setTheme = useCallback((pref: ThemePreference) => {
    setPreference(pref);
    void savePreference(pref);

    // Debounced server sync — best effort, no blocking
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { apiClient } = require('../lib/api') as { apiClient: { patch: (url: string, data: unknown) => Promise<unknown> } };
        void apiClient.patch('/me/preferences', { theme: pref });
      } catch {
        // silent — local preference is source of truth
      }
    }, 1500);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, isDark, tokens, setTheme }),
    [preference, isDark, tokens, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Consume theme tokens and isDark flag anywhere in the tree. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
