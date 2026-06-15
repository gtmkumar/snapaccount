/**
 * App.tsx provider-mounting regression test (W5-DARK-01).
 *
 * Live QA found that <ThemeProvider> was never mounted in App.tsx, so the
 * entire app silently rendered the light-token DEFAULT context value and the
 * system dark toggle did nothing. Every component test passed because (a)
 * suites either wrapped components in their own <ThemeProvider> or relied on
 * the silent default, and (b) nothing ever rendered the real <App />.
 *
 * This suite renders the REAL App component and asserts the theme context is
 * live above RootNavigator:
 *   - with the system scheme dark, the first auth screen (PhoneEntry — the
 *     exact screen QA screenshotted staying white) renders DARK_TOKENS
 *     surfaces;
 *   - when the Appearance listener fires with 'light', the surfaces flip to
 *     LIGHT_TOKENS;
 *   - the detached-useTheme console.error guard never fires.
 *
 * If anyone removes ThemeProvider from App.tsx again, isDark can never become
 * true and the dark-canvas assertions here fail.
 */

import React from 'react';
import { Appearance } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

// RNGH needs its native module at import time; only GestureHandlerRootView is
// used by App.tsx, so substitute a plain View for the jest environment.
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual('react-native');
  return { GestureHandlerRootView: View };
});

// expo-linear-gradient has no moduleNameMapper mock; SplashScreen imports it.
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});

// expo-image-picker has no moduleNameMapper mock; PermissionRequestsScreen
// (auth stack) imports it, which otherwise drags in the unmockable expo
// winter fetch runtime.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' }),
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' }),
  ),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

// socialAuth pulls native expo-apple-authentication / Google sign-in modules
// at import time — stub the surface PhoneEntry consumes.
jest.mock('../src/lib/socialAuth', () => ({
  SocialSignInCancelled: class SocialSignInCancelled extends Error {},
  SocialSignInUnavailable: class SocialSignInUnavailable extends Error {},
  isFirebaseConfigured: () => false,
  isAppleAvailable: jest.fn(() => Promise.resolve(false)),
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
}));

// The authenticated tab shell pulls in the entire screen graph (camera,
// pickers, SVG, …). This suite exercises the UNAUTHENTICATED path
// (Splash → PhoneEntry); tab-bar theming is pinned separately in
// __tests__/navigation/AppNavigatorTheme.test.tsx, so stub AppNavigator here.
jest.mock('../src/navigation/AppNavigator', () => ({
  AppNavigator: () => null,
}));

// Keep the debounced theme PATCH + any screen API call off the network.
jest.mock('../src/lib/api', () => {
  const apiClient = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  };
  return {
    __esModule: true,
    default: apiClient,
    apiClient,
    getApiError: jest.fn(() => ({ message: 'err' })),
    refreshAccessToken: jest.fn(() => Promise.resolve(false)),
    refreshContextAndSwap: jest.fn(() => Promise.resolve(false)),
    fetchOrganizations: jest.fn(() => Promise.resolve([])),
  };
});

import App from '../App';
import { DARK_TOKENS, LIGHT_TOKENS } from '../src/contexts/ThemeContext';

type Json = {
  props?: { style?: unknown };
  children?: Json[] | null;
} | null;

/** Recursively collect every backgroundColor used in the rendered host tree. */
function collectBackgroundColors(node: Json | Json[], out: Set<string>): Set<string> {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectBackgroundColors(n, out));
    return out;
  }
  const style = node.props?.style;
  const flat: Record<string, unknown>[] = [];
  const flatten = (s: unknown) => {
    if (!s) return;
    if (Array.isArray(s)) s.forEach(flatten);
    else if (typeof s === 'object') flat.push(s as Record<string, unknown>);
  };
  flatten(style);
  for (const s of flat) {
    if (typeof s.backgroundColor === 'string') out.add(s.backgroundColor);
  }
  if (node.children) collectBackgroundColors(node.children, out);
  return out;
}

jest.setTimeout(30000); // real-timer splash (~2s) + full App render per test

describe('App — ThemeProvider is mounted and live (W5-DARK-01)', () => {
  let appearanceListeners: ((p: { colorScheme: 'light' | 'dark' | null }) => void)[];
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    appearanceListeners = [];
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    jest
      .spyOn(Appearance, 'addChangeListener')
      .mockImplementation((listener: (p: { colorScheme: 'light' | 'dark' | null }) => void) => {
        appearanceListeners.push(listener);
        return { remove: jest.fn() } as never;
      });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Real timers: the Splash screen auto-replaces with PhoneEntry after ~2s,
  // so wait for the themed PhoneEntry surface to appear.
  async function renderAppPastSplash() {
    const tree = render(<App />);
    await waitFor(
      () => {
        const colors = collectBackgroundColors(tree.toJSON() as Json, new Set());
        expect(
          colors.has(DARK_TOKENS.raised) || colors.has(LIGHT_TOKENS.raised),
        ).toBe(true);
      },
      { timeout: 6000, interval: 250 },
    );
    return tree;
  }

  it('renders DARK_TOKENS surfaces when the system scheme is dark', async () => {
    const tree = await renderAppPastSplash();

    const colors = collectBackgroundColors(tree.toJSON() as Json, new Set());
    // PhoneEntry container uses tokens.raised — dark slate, not white.
    expect(colors.has(DARK_TOKENS.raised)).toBe(true);
    expect(colors.has(LIGHT_TOKENS.raised)).toBe(false);

    // The detached-provider guard must never fire from the real App tree.
    const detached = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes('[ThemeContext]'),
    );
    expect(detached).toBe(false);
  });

  it('flips the rendered surfaces when the system scheme changes to light', async () => {
    const tree = await renderAppPastSplash();
    expect(appearanceListeners.length).toBeGreaterThan(0);

    await act(async () => {
      appearanceListeners.forEach((l) => l({ colorScheme: 'light' }));
    });

    const colors = collectBackgroundColors(tree.toJSON() as Json, new Set());
    expect(colors.has(LIGHT_TOKENS.raised)).toBe(true);
    expect(colors.has(DARK_TOKENS.raised)).toBe(false);
  });
});
