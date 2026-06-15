/**
 * OrganizationSwitcherScreen — GAP-045 multi-organization switching.
 *
 * Covers:
 *  - lists the orgs returned by GET /auth/organizations
 *  - marks the current org as selected (radio semantics)
 *  - selecting another org: store currentOrganization updates,
 *    refresh-context is called with the chosen org id, then goBack
 *  - tapping the current org just goes back (no refresh)
 *  - single-membership note renders when only one org exists
 *  - falls back to store orgs when the server list is empty (fetch failure)
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetchOrganizations = jest.fn();
const mockRefreshContextAndSwap = jest.fn();

jest.mock('../../src/lib/api', () => ({
  fetchOrganizations: () => mockFetchOrganizations(),
  refreshContextAndSwap: (...args: unknown[]) => mockRefreshContextAndSwap(...args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { OrganizationSwitcherScreen } from '../../src/screens/profile/OrganizationSwitcherScreen';
import { useAuthStore } from '../../src/store/authStore';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

const ORG_A = { id: 'org-a', name: 'Sharma Traders', gstin: '07AAAAA0000A1Z5' };
const ORG_B = { id: 'org-b', name: 'Sharma Exports', gstin: '27BBBBB1111B2Z6' };

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshContextAndSwap.mockResolvedValue(true);
  useAuthStore.setState({
    organizations: [ORG_A],
    currentOrganization: ORG_A,
  });
});

describe('OrganizationSwitcherScreen (GAP-045)', () => {
  it('lists all server organizations with the current one selected', async () => {
    mockFetchOrganizations.mockResolvedValue([ORG_A, ORG_B]);

    const { findByTestId } = render(
      <OrganizationSwitcherScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    // Row B only exists once the server membership list resolves (row A is
    // already there from the store fallback) — await it first.
    const rowB = await findByTestId('org-row-org-b');
    const rowA = await findByTestId('org-row-org-a');
    expect(rowA.props.accessibilityState?.selected).toBe(true);
    expect(rowB.props.accessibilityState?.selected).toBe(false);
  });

  it('switching org updates the store, re-mints context with the org id, and goes back', async () => {
    mockFetchOrganizations.mockResolvedValue([ORG_A, ORG_B]);

    const { findByTestId } = render(
      <OrganizationSwitcherScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.press(await findByTestId('org-row-org-b'));

    await waitFor(() => {
      expect((mockNavigation as { goBack: jest.Mock }).goBack).toHaveBeenCalled();
    });
    expect(mockRefreshContextAndSwap).toHaveBeenCalledWith('org-b');
    expect(useAuthStore.getState().currentOrganization?.id).toBe('org-b');
    // The full membership list stays in the store for the next switch.
    expect(useAuthStore.getState().organizations.map((o) => o.id)).toEqual([
      'org-a',
      'org-b',
    ]);
  });

  it('tapping the current org goes back without re-minting context', async () => {
    mockFetchOrganizations.mockResolvedValue([ORG_A, ORG_B]);

    const { findByTestId } = render(
      <OrganizationSwitcherScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.press(await findByTestId('org-row-org-a'));

    await waitFor(() => {
      expect((mockNavigation as { goBack: jest.Mock }).goBack).toHaveBeenCalled();
    });
    expect(mockRefreshContextAndSwap).not.toHaveBeenCalled();
    expect(useAuthStore.getState().currentOrganization?.id).toBe('org-a');
  });

  it('shows the single-membership note when only one org exists', async () => {
    mockFetchOrganizations.mockResolvedValue([ORG_A]);

    const { findByText } = render(
      <OrganizationSwitcherScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByText('mobile.orgSwitcher.singleOrgNote')).toBeTruthy();
  });

  it('falls back to store organizations when the server list is empty', async () => {
    // fetchOrganizations returns [] on any failure (lib/api contract).
    mockFetchOrganizations.mockResolvedValue([]);
    useAuthStore.setState({ organizations: [ORG_A, ORG_B], currentOrganization: ORG_B });

    const { findByTestId } = render(
      <OrganizationSwitcherScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByTestId('org-row-org-a')).toBeTruthy();
    expect((await findByTestId('org-row-org-b')).props.accessibilityState?.selected).toBe(true);
  });
});
