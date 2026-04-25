/**
 * ThemeContext — Phase 6F full test suite
 * Track F4 · dark mode · AsyncStorage persistence · LIGHT/DARK token swaps
 *
 * Covers:
 *   - Default preference is 'system'
 *   - Jest resolves system to light → isDark = false, LIGHT_TOKENS
 *   - setTheme('dark') switches isDark to true, applies DARK_TOKENS canvas/brand500
 *   - setTheme('light') after dark reverts to LIGHT_TOKENS
 *   - setTheme persists to AsyncStorage with correct key
 *   - Loads persisted 'dark' preference from AsyncStorage on mount
 *   - LIGHT_TOKENS vs DARK_TOKENS: canvas and brand500 differ
 */

import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';

// Prevent real Axios calls from debounced server sync in setTheme
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

// ── Consumer component ────────────────────────────────────────────────────────

function ThemeConsumer() {
  const { isDark, preference, tokens } = useTheme();
  return (
    <>
      <Text testID="pref">{preference}</Text>
      <Text testID="isDark">{String(isDark)}</Text>
      <Text testID="canvas">{tokens.canvas}</Text>
      <Text testID="brand500">{tokens.brand500}</Text>
      <Text testID="textPrimary">{tokens.textPrimary}</Text>
      <Text testID="textPrimaryDark">{tokens.textSecondary}</Text>
    </>
  );
}

// Toggler uses Pressable so fireEvent.press works reliably
function ThemeToggler() {
  const { setTheme, preference } = useTheme();
  return (
    <>
      <Text testID="pref">{preference}</Text>
      <Pressable testID="toggleDark" onPress={() => setTheme('dark')} />
      <Pressable testID="toggleLight" onPress={() => setTheme('light')} />
      <Pressable testID="toggleSystem" onPress={() => setTheme('system')} />
    </>
  );
}

function TogglerWithConsumer() {
  const { setTheme, isDark, tokens } = useTheme();
  return (
    <>
      <Text testID="isDark">{String(isDark)}</Text>
      <Text testID="canvas">{tokens.canvas}</Text>
      <Text testID="brand500">{tokens.brand500}</Text>
      <Pressable testID="toggleDark" onPress={() => setTheme('dark')} />
      <Pressable testID="toggleLight" onPress={() => setTheme('light')} />
      <Pressable testID="toggleSystem" onPress={() => setTheme('system')} />
    </>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // no stored pref
  });

  // ── defaults ─────────────────────────────────────────────────────────────

  it('default preference is system', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('pref').props.children).toBe('system');
    });
  });

  it('in Jest (system = light), isDark is false', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('false');
    });
  });

  it('LIGHT_TOKENS canvas is #F8FAFC', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('canvas').props.children).toBe('#F8FAFC');
    });
  });

  it('LIGHT_TOKENS brand500 is #6366F1', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('brand500').props.children).toBe('#6366F1');
    });
  });

  it('LIGHT_TOKENS textPrimary is #0F172A', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('textPrimary').props.children).toBe('#0F172A');
    });
  });

  // ── setTheme dark ─────────────────────────────────────────────────────────
  // Note: ThemeProvider loads persisted preference from AsyncStorage on mount.
  // We must wait for that async load to complete before pressing toggleDark,
  // otherwise the `loadPreference().then(setPreference)` chain can race and
  // override the `setTheme('dark')` call with 'system'.

  it('setTheme("dark") switches isDark to true', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <TogglerWithConsumer />
      </ThemeProvider>,
    );

    // Wait for mount effect (AsyncStorage load) to settle
    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('false');
    });

    await act(async () => {
      fireEvent.press(getByTestId('toggleDark'));
    });

    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('true');
    });
  });

  it('setTheme("dark") applies DARK_TOKENS canvas (#0F172A)', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <TogglerWithConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('canvas').props.children).toBe('#F8FAFC');
    });

    await act(async () => {
      fireEvent.press(getByTestId('toggleDark'));
    });

    await waitFor(() => {
      expect(getByTestId('canvas').props.children).toBe('#0F172A');
    });
  });

  it('setTheme("dark") applies DARK_TOKENS brand500 (#818CF8)', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <TogglerWithConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('brand500').props.children).toBe('#6366F1'); // light
    });

    await act(async () => {
      fireEvent.press(getByTestId('toggleDark'));
    });

    await waitFor(() => {
      expect(getByTestId('brand500').props.children).toBe('#818CF8');
    });
  });

  // ── setTheme light ────────────────────────────────────────────────────────

  it('setTheme("light") after dark reverts to LIGHT_TOKENS', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <TogglerWithConsumer />
      </ThemeProvider>,
    );

    // Wait for mount settle
    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('false');
    });

    await act(async () => { fireEvent.press(getByTestId('toggleDark')); });
    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('true');
    });

    await act(async () => { fireEvent.press(getByTestId('toggleLight')); });
    await waitFor(() => {
      expect(getByTestId('canvas').props.children).toBe('#F8FAFC');
      expect(getByTestId('isDark').props.children).toBe('false');
    });
  });

  // ── AsyncStorage persistence ──────────────────────────────────────────────

  it('setTheme("dark") persists to AsyncStorage key @snapaccount/theme_preference', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeToggler />
      </ThemeProvider>,
    );

    await act(async () => { fireEvent.press(getByTestId('toggleDark')); });

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@snapaccount/theme_preference',
        'dark',
      );
    });
  });

  it('setTheme("system") persists "system" to AsyncStorage', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeToggler />
      </ThemeProvider>,
    );

    await act(async () => { fireEvent.press(getByTestId('toggleSystem')); });

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@snapaccount/theme_preference',
        'system',
      );
    });
  });

  it('loads persisted "dark" from AsyncStorage on mount → isDark true', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('dark');

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('true');
      expect(getByTestId('canvas').props.children).toBe('#0F172A');
    });
  });

  it('loads persisted "light" from AsyncStorage on mount → isDark false', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('light');

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('isDark').props.children).toBe('false');
      expect(getByTestId('canvas').props.children).toBe('#F8FAFC');
    });
  });
});
