/**
 * Navigation shell theming (W5-DARK-01 follow-up).
 *
 * The bottom tab bar styles come from createThemedStyles (tokens.raised
 * background, tokens.textTertiary/brand500 icons+labels). This pins that the
 * shell actually responds to the theme when ThemeProvider is mounted above
 * it — i.e. the tab bar surface is dark in dark mode and light in light mode.
 *
 * The per-tab stacks are stubbed out so only the Tab.Navigator shell renders.
 */

import React from 'react';
import { Appearance } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { act, render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { userType: 'business_owner' } }),
}));

// Stub the heavy per-tab stacks — only the tab shell is under test.
jest.mock('../../src/navigation/HomeStack', () => ({ HomeStack: () => null }));
jest.mock('../../src/navigation/DocumentStack', () => ({ DocumentStack: () => null }));
jest.mock('../../src/navigation/GstStack', () => ({ GstStack: () => null }));
jest.mock('../../src/navigation/LoanStack', () => ({ LoanStack: () => null }));
jest.mock('../../src/navigation/ItrStack', () => ({ ItrStack: () => null }));
jest.mock('../../src/navigation/ChatStack', () => ({ ChatStack: () => null }));
jest.mock('../../src/navigation/MoreStack', () => ({ MoreStack: () => null }));

import { AppNavigator } from '../../src/navigation/AppNavigator';
import {
  DARK_TOKENS,
  LIGHT_TOKENS,
  ThemeProvider,
} from '../../src/contexts/ThemeContext';

type Json = {
  props?: { style?: unknown };
  children?: Json[] | null;
} | null;

function collectBackgroundColors(node: Json | Json[], out: Set<string>): Set<string> {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectBackgroundColors(n, out));
    return out;
  }
  const flat: Record<string, unknown>[] = [];
  const flatten = (s: unknown) => {
    if (!s) return;
    if (Array.isArray(s)) s.forEach(flatten);
    else if (typeof s === 'object') flat.push(s as Record<string, unknown>);
  };
  flatten(node.props?.style);
  for (const s of flat) {
    if (typeof s.backgroundColor === 'string') out.add(s.backgroundColor);
  }
  if (node.children) collectBackgroundColors(node.children, out);
  return out;
}

function renderShell() {
  return render(
    <ThemeProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </ThemeProvider>,
  );
}

describe('AppNavigator tab bar responds to theme', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses DARK_TOKENS.raised for the tab bar in dark mode', async () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    const tree = renderShell();
    await act(async () => {});

    const colors = collectBackgroundColors(tree.toJSON() as Json, new Set());
    expect(colors.has(DARK_TOKENS.raised)).toBe(true);
    expect(colors.has(LIGHT_TOKENS.raised)).toBe(false);
  });

  it('uses LIGHT_TOKENS.raised for the tab bar in light mode', async () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    const tree = renderShell();
    await act(async () => {});

    const colors = collectBackgroundColors(tree.toJSON() as Json, new Set());
    expect(colors.has(LIGHT_TOKENS.raised)).toBe(true);
    expect(colors.has(DARK_TOKENS.raised)).toBe(false);
  });
});
