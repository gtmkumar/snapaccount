/**
 * AcceptInviteScreen — GAP-065 invite-token resume through the auth flow.
 *
 * Covers:
 *  - logged OUT + deep-link token → token persisted (survives the auth remount)
 *  - "Sign in to accept" persists the token before navigating to PhoneEntry
 *  - Decline clears any persisted token
 *  - Accept success (logged in) clears the persisted token so resume never replays
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockStorePendingInviteToken = jest.fn(() => Promise.resolve());
const mockClearPendingInviteToken = jest.fn(() => Promise.resolve());
jest.mock('../../src/lib/pendingInvite', () => ({
  storePendingInviteToken: (...args: unknown[]) => mockStorePendingInviteToken(...(args as [])),
  clearPendingInviteToken: () => mockClearPendingInviteToken(),
}));

const mockValidateInviteToken = jest.fn();
const mockAcceptInvite = jest.fn();
jest.mock('../../src/lib/team', () => ({
  validateInviteToken: (...args: unknown[]) => mockValidateInviteToken(...(args as [])),
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...(args as [])),
}));

const mockRefreshContextAndSwap = jest.fn(() => Promise.resolve(true));
const mockFetchOrganizations = jest.fn(() => Promise.resolve([]));
jest.mock('../../src/lib/api', () => ({
  refreshContextAndSwap: () => mockRefreshContextAndSwap(),
  fetchOrganizations: () => mockFetchOrganizations(),
  getApiError: () => ({ message: 'err', statusCode: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { AcceptInviteScreen } from '../../src/screens/auth/AcceptInviteScreen';
import { useAuthStore } from '../../src/store/authStore';

const TOKEN = 'inv_resume_token_123';

const VALID_PREVIEW = {
  isValid: true,
  organizationName: 'Sharma Traders',
  roleName: 'org-member',
  roleDisplayName: 'Member',
  email: 'invitee@example.com',
};

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
  } as never;
}

function makeRoute(token?: string) {
  return { params: token ? { token } : undefined, key: 'k', name: 'AcceptInvite' } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateInviteToken.mockResolvedValue(VALID_PREVIEW);
});

describe('AcceptInviteScreen — GAP-065 resume', () => {
  it('logged OUT + deep-link token → persists the token for post-auth resume', async () => {
    useAuthStore.setState({ isAuthenticated: false });

    render(<AcceptInviteScreen navigation={makeNavigation()} route={makeRoute(TOKEN)} />);

    await waitFor(() => {
      expect(mockStorePendingInviteToken).toHaveBeenCalledWith(TOKEN);
    });
  });

  it('logged IN + deep-link token → does NOT persist (no auth flow to survive)', async () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(<AcceptInviteScreen navigation={makeNavigation()} route={makeRoute(TOKEN)} />);

    await waitFor(() => {
      expect(mockValidateInviteToken).toHaveBeenCalledWith(TOKEN);
    });
    expect(mockStorePendingInviteToken).not.toHaveBeenCalled();
  });

  it('"Sign in to accept" persists the token and navigates to PhoneEntry', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const navigation = makeNavigation();

    const { findByText } = render(
      <AcceptInviteScreen navigation={navigation} route={makeRoute(TOKEN)} />,
    );

    fireEvent.press(await findByText('mobile.auth.invite.signInCta'));

    expect(mockStorePendingInviteToken).toHaveBeenCalledWith(TOKEN);
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('PhoneEntry');
  });

  it('Decline clears the persisted token and goes back', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const navigation = makeNavigation();

    const { findByText } = render(
      <AcceptInviteScreen navigation={navigation} route={makeRoute(TOKEN)} />,
    );

    fireEvent.press(await findByText('mobile.auth.invite.declineCta'));

    expect(mockClearPendingInviteToken).toHaveBeenCalled();
    expect((navigation as { goBack: jest.Mock }).goBack).toHaveBeenCalled();
  });

  it('Accept success clears the persisted token (resume can never replay)', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAcceptInvite.mockResolvedValue({
      organizationId: 'org-1',
      organizationName: 'Sharma Traders',
    });

    const { findByText } = render(
      <AcceptInviteScreen navigation={makeNavigation()} route={makeRoute(TOKEN)} />,
    );

    fireEvent.press(await findByText('mobile.auth.invite.acceptCta'));

    await waitFor(() => {
      expect(mockClearPendingInviteToken).toHaveBeenCalled();
    });
    expect(mockAcceptInvite).toHaveBeenCalledWith(TOKEN);
    alertSpy.mockRestore();
  });
});
