/**
 * appSettings — non-sensitive user preference store (DG-MOBUX-03 / -05 / -07).
 *
 * AsyncStorage is intentional here: these are UX preferences, NOT secrets.
 * Secrets (auth tokens, KYC) live in Expo SecureStore per the project rule —
 * none of those are stored here.
 *
 * Settings covered:
 *   - haptics          (delegated to useHaptics' own key for back-compat)
 *   - autoUploadOnCellular  (Network: allow background uploads on cellular)
 *   - compressBeforeUpload  (Network: aggressive compression on slow/cellular)
 *   - showNetworkChip       (Network: surface the TopBar quality chip)
 *   - requireBiometricSensitive (Security: gate sensitive flows)
 *   - biometricGraceWindow  (Security: 5min | 1min | never)
 *
 * A lightweight pub/sub lets live screens (NetworkSheet, NetworkQualityChip)
 * react to changes without prop-drilling.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Keys ─────────────────────────────────────────────────────────────────────

const PREFIX = '@snapaccount/settings/';

export const SETTINGS_KEYS = {
  autoUploadOnCellular: `${PREFIX}autoUploadOnCellular`,
  compressBeforeUpload: `${PREFIX}compressBeforeUpload`,
  showNetworkChip: `${PREFIX}showNetworkChip`,
  requireBiometricSensitive: `${PREFIX}requireBiometricSensitive`,
  biometricGraceWindow: `${PREFIX}biometricGraceWindow`,
} as const;

export type BiometricGraceWindow = '5min' | '1min' | 'never';

/** Grace window value → milliseconds. 'never' = 0 (always re-prompt). */
export const GRACE_WINDOW_MS: Record<BiometricGraceWindow, number> = {
  '5min': 5 * 60 * 1000,
  '1min': 60 * 1000,
  never: 0,
};

export interface AppSettings {
  autoUploadOnCellular: boolean;
  compressBeforeUpload: boolean;
  showNetworkChip: boolean;
  requireBiometricSensitive: boolean;
  biometricGraceWindow: BiometricGraceWindow;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoUploadOnCellular: false, // default OFF — respect the user's data plan
  compressBeforeUpload: true, // default ON — saves data + speeds uploads
  showNetworkChip: true,
  requireBiometricSensitive: true,
  biometricGraceWindow: '5min',
};

// ── In-memory cache + pub/sub ──────────────────────────────────────────────────

let _cache: AppSettings | null = null;
type Listener = (s: AppSettings) => void;
const listeners = new Set<Listener>();

function notify(s: AppSettings): void {
  listeners.forEach((l) => {
    try {
      l(s);
    } catch {
      // a listener throwing must not break the others
    }
  });
}

/** Subscribe to settings changes. Returns an unsubscribe fn. */
export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  return raw === 'true';
}

/** Load all settings (cached after first read). */
export async function loadSettings(): Promise<AppSettings> {
  if (_cache !== null) return _cache;
  try {
    const entries = await AsyncStorage.multiGet([
      SETTINGS_KEYS.autoUploadOnCellular,
      SETTINGS_KEYS.compressBeforeUpload,
      SETTINGS_KEYS.showNetworkChip,
      SETTINGS_KEYS.requireBiometricSensitive,
      SETTINGS_KEYS.biometricGraceWindow,
    ]);
    const map = Object.fromEntries(entries) as Record<string, string | null>;
    const grace = map[SETTINGS_KEYS.biometricGraceWindow];
    _cache = {
      autoUploadOnCellular: parseBool(
        map[SETTINGS_KEYS.autoUploadOnCellular],
        DEFAULT_SETTINGS.autoUploadOnCellular,
      ),
      compressBeforeUpload: parseBool(
        map[SETTINGS_KEYS.compressBeforeUpload],
        DEFAULT_SETTINGS.compressBeforeUpload,
      ),
      showNetworkChip: parseBool(
        map[SETTINGS_KEYS.showNetworkChip],
        DEFAULT_SETTINGS.showNetworkChip,
      ),
      requireBiometricSensitive: parseBool(
        map[SETTINGS_KEYS.requireBiometricSensitive],
        DEFAULT_SETTINGS.requireBiometricSensitive,
      ),
      biometricGraceWindow:
        grace === '5min' || grace === '1min' || grace === 'never'
          ? grace
          : DEFAULT_SETTINGS.biometricGraceWindow,
    };
    return _cache;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Synchronous read of the cached settings (DEFAULT until first loadSettings). */
export function getCachedSettings(): AppSettings {
  return _cache ?? { ...DEFAULT_SETTINGS };
}

/** Update a single setting; persists, updates cache, and notifies subscribers. */
export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, [key]: value };
  _cache = next;
  notify(next);
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS[key], String(value));
  } catch {
    // persistence best-effort; cache already reflects the change
  }
}

/** Test-only: reset the in-memory cache so each test starts clean. */
export function __resetSettingsCacheForTests(): void {
  _cache = null;
  listeners.clear();
}
