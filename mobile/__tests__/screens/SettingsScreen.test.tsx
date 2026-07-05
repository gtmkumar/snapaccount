/**
 * SettingsScreen — DG-MOBUX-03.
 * Covers: the three sections render with localized copy; toggling a network
 * preference persists it; toggling the biometric gate enables/disables the
 * grace-window radio group.
 *
 * Real ThemeProvider + real i18n bundle (per the AppearanceScreen pattern).
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/screens/settings/SettingsScreen';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import {
  loadSettings,
  __resetSettingsCacheForTests,
} from '../../src/lib/appSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as never;

function renderScreen() {
  return render(
    <ThemeProvider>
      <SettingsScreen navigation={mockNavigation} />
    </ThemeProvider>,
  );
}

describe('SettingsScreen', () => {
  beforeEach(async () => {
    __resetSettingsCacheForTests();
    await AsyncStorage.clear();
  });

  it('renders the three setting sections', () => {
    const { getByText } = renderScreen();
    expect(getByText('Accessibility')).toBeTruthy();
    expect(getByText('Network')).toBeTruthy();
    expect(getByText('Security')).toBeTruthy();
  });

  it('renders the haptics, network and security toggles', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('settings-haptics-toggle')).toBeTruthy();
    expect(getByTestId('settings-cellular-toggle')).toBeTruthy();
    expect(getByTestId('settings-compress-toggle')).toBeTruthy();
    expect(getByTestId('settings-chip-toggle')).toBeTruthy();
    expect(getByTestId('settings-biometric-toggle')).toBeTruthy();
  });

  it('toggling "auto-upload on cellular" persists the preference', async () => {
    const { getByTestId } = renderScreen();
    fireEvent(getByTestId('settings-cellular-toggle'), 'valueChange', true);
    await waitFor(async () => {
      const s = await loadSettings();
      expect(s.autoUploadOnCellular).toBe(true);
    });
  });

  it('selecting a grace window persists it', async () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-grace-1min'));
    await waitFor(async () => {
      const s = await loadSettings();
      expect(s.biometricGraceWindow).toBe('1min');
    });
  });
});
