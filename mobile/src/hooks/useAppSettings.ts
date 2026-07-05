/**
 * useAppSettings — live, subscribed view of the non-sensitive preference store.
 * DG-MOBUX-03 / -05 / -07.
 *
 * Returns the current AppSettings plus an `update` helper. Re-renders whenever
 * any setting changes (including from another screen) via the appSettings
 * pub/sub, so the NetworkSheet, NetworkQualityChip and biometric gate all stay
 * in sync with the Settings screen.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  loadSettings,
  subscribeSettings,
  updateSetting,
  getCachedSettings,
  type AppSettings,
} from '../lib/appSettings';

export interface UseAppSettingsResult {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  /** True until the first AsyncStorage read resolves. */
  loading: boolean;
}

export function useAppSettings(): UseAppSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(getCachedSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSettings().then((s) => {
      if (active) {
        setSettings(s);
        setLoading(false);
      }
    });
    const unsubscribe = subscribeSettings((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
      updateSetting(key, value),
    [],
  );

  return { settings, update, loading };
}
