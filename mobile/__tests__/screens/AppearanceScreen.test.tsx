/**
 * AppearanceScreen — DG-MOBUX-02.
 * Covers: three localized radio cards render, the active preference is marked
 * selected, and tapping a card calls setTheme (which flips the selected card).
 *
 * Uses the REAL ThemeProvider + REAL i18n bundle so the test exercises the
 * actual setTheme wiring and localized copy (not stubbed keys).
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AppearanceScreen } from '../../src/screens/profile/AppearanceScreen';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

import '../../src/i18n';

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as never;

function renderScreen() {
  return render(
    <ThemeProvider>
      <AppearanceScreen navigation={mockNavigation} />
    </ThemeProvider>,
  );
}

describe('AppearanceScreen', () => {
  it('renders three localized theme options', () => {
    const { getByText, getByTestId } = renderScreen();
    expect(getByTestId('appearance-options')).toBeTruthy();
    expect(getByText('System')).toBeTruthy();
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('Dark')).toBeTruthy();
    // Footer guidance copy from the real bundle
    expect(getByText(/Choose System to follow your phone's theme\./)).toBeTruthy();
  });

  it('marks System selected by default (system-following preference)', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('appearance-option-system').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('appearance-option-dark').props.accessibilityState.selected).toBe(false);
  });

  it('selecting Dark updates the selected card (setTheme wired)', async () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('appearance-option-dark'));

    await waitFor(() => {
      expect(getByTestId('appearance-option-dark').props.accessibilityState.selected).toBe(true);
      expect(getByTestId('appearance-option-system').props.accessibilityState.selected).toBe(false);
    });
  });
});
