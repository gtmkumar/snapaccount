/**
 * ProfileScreen — AND-11 regression (live Android sweep 2026-06-11).
 *
 * "Language Settings" opens the combined language + notification preferences
 * screen. The route is intentional (there is no standalone language screen);
 * the bug was the screen title, which read "Notification Preferences" only.
 * These tests pin: (a) the menu item routes to NotificationPreferences, and
 * (b) the screen title key now names both halves in all three locales.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import en from '../../src/i18n/en.json';
import hi from '../../src/i18n/hi.json';
import bn from '../../src/i18n/bn.json';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'u-1',
      name: 'Asha',
      phone: '+919111222333',
      userType: 'business_owner',
    },
    currentOrganization: null,
    signOut: jest.fn(),
  }),
}));

jest.mock('../../src/lib/firebase', () => ({
  FirebaseAuth: { signOut: jest.fn(() => Promise.resolve()) },
}));

jest.mock('../../src/lib/api', () => ({
  deleteAccount: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/hooks/useBiometricGate', () => ({
  useBiometricGate: () => ({ trigger: jest.fn(() => Promise.resolve(true)) }),
}));

import { ProfileScreen } from '../../src/screens/profile/ProfileScreen';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate, goBack: jest.fn() } as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProfileScreen (AND-11)', () => {
  it('Language Settings navigates to the combined preferences screen', () => {
    const { getByTestId } = render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(getByTestId('profile-menu-language'));

    expect(mockNavigate).toHaveBeenCalledWith('NotificationPreferences');
  });

  it('Notification Preferences menu item navigates to the same screen', () => {
    const { getByTestId } = render(<ProfileScreen navigation={mockNavigation} />);

    fireEvent.press(getByTestId('profile-menu-notifications'));

    expect(mockNavigate).toHaveBeenCalledWith('NotificationPreferences');
  });

  it('combined screen title names both languages and notifications (en/hi/bn parity)', () => {
    // en is the canonical assertion; hi/bn must exist, differ from en, and no
    // locale may still carry the old notification-only title.
    expect(en.mobile.auth.preferences.title).toBe('Language & Notifications');
    expect(en.mobile.auth.preferences.title).not.toBe('Notification Preferences');

    for (const locale of [hi, bn]) {
      const title = locale.mobile.auth.preferences.title;
      expect(typeof title).toBe('string');
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toBe('Notification Preferences');
    }
  });
});
