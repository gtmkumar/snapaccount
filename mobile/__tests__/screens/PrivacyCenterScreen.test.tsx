/**
 * PrivacyCenterScreen — AND-08 regression (live Android sweep 2026-06-11).
 *
 * The screen crashed with `TypeError: Cannot read property 'filter' of
 * undefined` when the consents API returned `{ items: undefined }`. It must
 * now render an empty/unavailable summary state instead of red-screening,
 * and keep every privacy action reachable.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyConsents = jest.fn();
const mockListMyDataCorrections = jest.fn();

jest.mock('../../src/api/privacy', () => ({
  getMyConsents: () => mockGetMyConsents(),
  listMyDataCorrections: () => mockListMyDataCorrections(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { PrivacyCenterScreen } from '../../src/screens/profile/PrivacyCenterScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PrivacyCenterScreen (AND-08)', () => {
  it('renders empty state instead of crashing when items is undefined', async () => {
    // The exact malformed shape from the live sweep: object without items array.
    mockGetMyConsents.mockResolvedValue({ items: undefined });
    mockListMyDataCorrections.mockResolvedValue({ items: undefined });

    const { getByText, findByTestId, queryByText } = render(
      <PrivacyCenterScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    // Screen chrome renders (no red screen)
    expect(getByText('mobile.privacy.center.title')).toBeTruthy();

    // Unavailable-summary notice appears once the malformed data lands
    expect(await findByTestId('privacy-summary-unavailable')).toBeTruthy();

    // All privacy actions remain reachable
    expect(getByText('mobile.privacy.center.nav.consents')).toBeTruthy();
    expect(getByText('mobile.privacy.center.nav.export')).toBeTruthy();
    expect(getByText('mobile.privacy.center.nav.correction')).toBeTruthy();
    expect(getByText('mobile.privacy.center.nav.deletion')).toBeTruthy();

    // No consent-count badge is fabricated from the malformed payload
    expect(queryByText(/consentsCount/)).toBeNull();
  });

  it('renders without crashing when the consents API rejects', async () => {
    mockGetMyConsents.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );
    mockListMyDataCorrections.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );

    const { getByText, findByTestId } = render(
      <PrivacyCenterScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByTestId('privacy-summary-unavailable')).toBeTruthy();
    expect(getByText('mobile.privacy.center.nav.consents')).toBeTruthy();
  });

  it('shows the consent summary badge for a well-formed response', async () => {
    mockGetMyConsents.mockResolvedValue({
      items: [
        { purposeCode: 'MARKETING', purposeLabel: 'Marketing', description: '', status: 'GRANTED', grantedAt: '2026-01-01T00:00:00Z', consentTextVersion: 'v1' },
        { purposeCode: 'ANALYTICS', purposeLabel: 'Analytics', description: '', status: 'WITHDRAWN', grantedAt: '2026-01-01T00:00:00Z', consentTextVersion: 'v1' },
      ],
    });
    mockListMyDataCorrections.mockResolvedValue({ items: [] });

    const { findByText, queryByTestId } = render(
      <PrivacyCenterScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(
      await findByText('mobile.privacy.center.nav.consentsCount({"active":1,"withdrawn":1})'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(queryByTestId('privacy-summary-unavailable')).toBeNull(),
    );
  });
});
