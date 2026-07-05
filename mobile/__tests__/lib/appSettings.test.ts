/**
 * appSettings — DG-MOBUX-03/05/07 preference store.
 * Covers defaults, persistence round-trip, and pub/sub notification.
 */

import {
  loadSettings,
  updateSetting,
  subscribeSettings,
  DEFAULT_SETTINGS,
  GRACE_WINDOW_MS,
  __resetSettingsCacheForTests,
} from '../../src/lib/appSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('appSettings', () => {
  beforeEach(async () => {
    __resetSettingsCacheForTests();
    await AsyncStorage.clear();
  });

  it('returns defaults when nothing is persisted', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.requireBiometricSensitive).toBe(true);
    expect(s.autoUploadOnCellular).toBe(false);
    expect(s.biometricGraceWindow).toBe('5min');
  });

  it('persists and reloads a boolean setting', async () => {
    await updateSetting('autoUploadOnCellular', true);
    __resetSettingsCacheForTests();
    const s = await loadSettings();
    expect(s.autoUploadOnCellular).toBe(true);
  });

  it('persists the grace window enum', async () => {
    await updateSetting('biometricGraceWindow', '1min');
    __resetSettingsCacheForTests();
    const s = await loadSettings();
    expect(s.biometricGraceWindow).toBe('1min');
  });

  it('notifies subscribers on change', async () => {
    await loadSettings();
    const seen: boolean[] = [];
    const unsub = subscribeSettings((next) => seen.push(next.showNetworkChip));
    await updateSetting('showNetworkChip', false);
    expect(seen).toContain(false);
    unsub();
  });

  it('maps grace windows to the expected milliseconds', () => {
    expect(GRACE_WINDOW_MS['5min']).toBe(300000);
    expect(GRACE_WINDOW_MS['1min']).toBe(60000);
    expect(GRACE_WINDOW_MS.never).toBe(0);
  });
});
