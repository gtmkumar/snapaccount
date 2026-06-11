/**
 * ThemeContext — system-following dark mode with manual override.
 * Phase 6F · Track F4 · docs/design/mobile/ux/dark-mode-mobile.md
 *
 * - Reads preference from AsyncStorage (non-sensitive; theme pref is not secret).
 * - 'system' (default) follows Appearance API.
 * - Provides isDark boolean + setTheme(pref) + theme colors to children.
 * - PATCH /auth/me/preferences {theme} debounced (best-effort, not blocking).
 *   The backend enum is LIGHT|DARK|SYSTEM, so the local lowercase preference is
 *   mapped to upper-case before syncing.
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

/**
 * Named elevation style (design-elevation-spec §1.3 / tokens.json shadow.xs..xl).
 * Spread into a card style: `{ ...tokens.elevation1 }`. Dark mode swaps
 * shadowColor to pure black so shadows stay visible on dark canvases.
 */
export interface ElevationStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ThemeTokens {
  canvas: string;
  raised: string;
  sunken: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Disabled-only text (a11y §4: neutral-400 is never meaningful text). */
  textDisabled: string;
  /** Text/icons on solid brand fills (buttons). */
  textOnBrand: string;
  brand500: string;
  brand400: string;
  /** Solid CTA fill — keeps ≥4.5:1 with textOnBrand in BOTH modes. */
  brandCta: string;
  /** Pressed state for brandCta fills. */
  brandCtaPressed: string;
  /** Solid destructive CTA fill — white text stays ≥4.5:1 in both modes. */
  errorCta: string;
  /** Module accents (tokens.json module.*) — lifted in dark, ≥4.5:1 as text. */
  gstAccent: string;
  itrAccent: string;
  loanAccent: string;
  border: string;
  inputBg: string;
  skeleton1: string;
  skeleton2: string;
  shadowColor: string;

  // ── Tinted surfaces (design-elevation-spec §2.3) ──────────────────────────
  // Regulated cards (KFS APR hero, net-disbursal, cooling-off, privacy intro)
  // use a tint background + a tint-foreground pair validated ≥4.5:1 in both
  // light and dark (see __tests__/contexts/ThemeTokenContrast.test.ts).
  brandTint: string;
  brandTintBorder: string;
  brandFg: string;
  successTint: string;
  successTintBorder: string;
  successFg: string;
  warningTint: string;
  warningTintBorder: string;
  warningFg: string;
  errorTint: string;
  errorTintBorder: string;
  errorFg: string;
  infoTint: string;
  infoFg: string;

  // ── Named elevations (tokens.json shadow.xs..xl) ──────────────────────────
  elevation0: ElevationStyle;
  elevation1: ElevationStyle;
  elevation2: ElevationStyle;
  elevation3: ElevationStyle;
  elevation4: ElevationStyle;
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

/** tokens.json shadow.xs..xl mapped to elevation0..4 with a themable color. */
function buildElevations(shadowColor: string): Pick<
  ThemeTokens,
  'elevation0' | 'elevation1' | 'elevation2' | 'elevation3' | 'elevation4'
> {
  return {
    elevation0: { shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    elevation1: { shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    elevation2: { shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    elevation3: { shadowColor, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8 },
    elevation4: { shadowColor, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.16, shadowRadius: 48, elevation: 16 },
  };
}

export const LIGHT_TOKENS: ThemeTokens = {
  canvas: '#F8FAFC',
  raised: '#FFFFFF',
  sunken: '#F1F5F9',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textDisabled: '#94A3B8',
  textOnBrand: '#FFFFFF',
  brand500: '#6366F1',
  brand400: '#818CF8',
  brandCta: '#4F46E5',
  brandCtaPressed: '#4338CA',
  errorCta: '#E11D48',
  gstAccent: '#7C3AED',
  itrAccent: '#0E7490',  // cyan-700 — cyan-600 fails 4.5:1 as text on white
  loanAccent: '#C2410C', // orange-700 — #EA580C fill keeps for icons, text needs 700
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
  skeleton1: '#E2E8F0',
  skeleton2: '#F1F5F9',
  shadowColor: '#0F172A',
  // Tints: *[50] surface + *[700] foreground (a11y §4 — ≥4.5:1 on tint)
  brandTint: '#EEF2FF',
  brandTintBorder: '#E0E7FF',
  brandFg: '#4338CA',
  successTint: '#ECFDF5',
  successTintBorder: '#D1FAE5',
  successFg: '#047857',
  warningTint: '#FFFBEB',
  warningTintBorder: '#FDE68A',
  warningFg: '#B45309',
  errorTint: '#FFF1F2',
  errorTintBorder: '#FFE4E6',
  errorFg: '#BE123C',
  infoTint: '#E0F2FE',
  infoFg: '#0369A1',
  ...buildElevations('#0F172A'),
};

export const DARK_TOKENS: ThemeTokens = {
  canvas: '#0F172A',
  raised: '#1E293B',
  sunken: '#0F172A',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  // tokens.json v2.1.0: dark tertiary overridden to neutral-400 — neutral-500
  // (#64748B) failed WCAG (3.07:1 on raised). Tertiary therefore EQUALS
  // secondary in colour in dark mode; distinguish by weight/size, not colour.
  textTertiary: '#94A3B8',
  textDisabled: '#475569',
  textOnBrand: '#0F172A', // dark mode: lifted indigo fill needs dark label (≥4.5:1)
  brand500: '#818CF8',  // lifted saturation for dark bg
  brand400: '#A5B4FC',
  brandCta: '#818CF8',  // lifted fill: ≥3:1 vs canvas AND ≥4.5:1 with textOnBrand
  brandCtaPressed: '#A5B4FC',
  errorCta: '#E11D48',  // white-on-fill 4.7:1; fill vs dark canvas 3.8:1
  gstAccent: '#A78BFA', // violet-400 lifted
  itrAccent: '#22D3EE', // cyan-400 lifted
  loanAccent: '#FB923C', // orange-400 lifted
  border: '#334155',
  inputBg: '#1E293B',
  skeleton1: '#1E293B',
  skeleton2: '#334155',
  shadowColor: '#000000',
  // Tints: *[900/950] surface + lifted *[300] foreground (validated ≥4.5:1)
  brandTint: '#1E1B4B',
  brandTintBorder: '#312E81',
  brandFg: '#A5B4FC',
  successTint: '#064E3B',
  successTintBorder: '#065F46',
  successFg: '#6EE7B7',
  warningTint: '#78350F',
  warningTintBorder: '#92400E',
  warningFg: '#FCD34D',
  errorTint: '#881337',
  errorTintBorder: '#9F1239',
  errorFg: '#FDA4AF',
  infoTint: '#0C4A6E',
  infoFg: '#7DD3FC',
  ...buildElevations('#000000'),
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
  systemScheme: ColorSchemeName | null,
): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return systemScheme === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null>(
    () => Appearance.getColorScheme() ?? null,
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

    // Debounced server sync — best effort, no blocking. The backend ThemePreference
    // enum is LIGHT|DARK|SYSTEM, so map the lowercase local pref before PATCHing.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const theme = pref.toUpperCase(); // 'system' → 'SYSTEM', etc.
      // Lazy import keeps ThemeContext free of an eager api-client dependency.
      void import('../lib/api')
        .then(({ apiClient }) => apiClient.patch('/auth/me/preferences', { theme }))
        .catch(() => {
          // silent — local preference is source of truth
        });
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

/**
 * Factory for theme-aware StyleSheets (design-elevation-spec §2 migration
 * pattern). Builds the sheet once per token set (LIGHT_TOKENS / DARK_TOKENS
 * are stable identities, so the WeakMap holds at most two entries) and any
 * component in the file can call the returned hook.
 *
 *   const useStyles = createThemedStyles((tk) => StyleSheet.create({ ... }));
 *   // inside a component:
 *   const styles = useStyles();
 */
export function createThemedStyles<T>(builder: (tokens: ThemeTokens) => T): () => T {
  const cache = new WeakMap<ThemeTokens, T>();
  return function useThemedStyles(): T {
    const { tokens } = useTheme();
    let sheet = cache.get(tokens);
    if (!sheet) {
      sheet = builder(tokens);
      cache.set(tokens, sheet);
    }
    return sheet;
  };
}
