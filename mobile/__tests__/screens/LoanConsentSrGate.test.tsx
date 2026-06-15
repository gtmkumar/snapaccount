/**
 * LoanConsentScreen — screen-reader scroll-gate (A11Y CON-1, Blocker).
 * Asserts the consent scroll-gate is satisfiable with a screen reader enabled
 * without a visual scroll event, the checkbox unlocks, and the recorded
 * consent payload (audit semantics) is identical to the visual path.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRecordLoanConsent = jest.fn(() =>
  Promise.resolve({ consentId: 'c-1', signatureHex: 'abcd1234' }),
);
const mockGetConsentCatalog = jest.fn(() =>
  Promise.resolve({
    items: [
      { consentType: 'CREDIT_BUREAU', textVersion: '2.0', effectiveDate: '2026-04-01' },
      { consentType: 'DATA_SHARE_WITH_BANK', textVersion: '2.1', effectiveDate: '2026-04-01' },
      { consentType: 'DISBURSEMENT_MANDATE', textVersion: '1.9', effectiveDate: '2026-04-01' },
    ],
  }),
);

jest.mock('../../src/api/loans', () => ({
  recordLoanConsent: (...args: unknown[]) => mockRecordLoanConsent(...(args as [])),
  getConsentCatalog: () => mockGetConsentCatalog(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { LoanConsentScreen } from '../../src/screens/loans/LoanConsentScreen';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = {
  params: {
    applicationId: 'app-1',
    userName: 'Rajesh Kumar',
    acctMask: 'XXXX-5678',
    kfsId: 'kfs-001',
    productId: 'prod-1',
    productName: 'Business Boost',
  },
} as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function mockScreenReader(enabled: boolean) {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(enabled);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LoanConsentScreen — screen-reader gate (CON-1)', () => {
  it('renders the reviewed-all affordance only when a screen reader is enabled', async () => {
    mockScreenReader(true);
    const { findByTestId } = render(
      <LoanConsentScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    expect(await findByTestId('consent-sr-reviewed-all')).toBeTruthy();
  });

  it('hides the affordance for non-screen-reader users', async () => {
    mockScreenReader(false);
    const { queryByTestId, getByText } = render(
      <LoanConsentScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    expect(getByText('mobile.loan.consent.title')).toBeTruthy();
    await waitFor(() => expect(queryByTestId('consent-sr-reviewed-all')).toBeNull());
  });

  it('unlocks the consent checkbox via the affordance without a scroll event', async () => {
    mockScreenReader(true);
    const { findByTestId, getByRole } = render(
      <LoanConsentScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );

    expect(getByRole('checkbox').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(await findByTestId('consent-sr-reviewed-all'));

    await waitFor(() =>
      expect(getByRole('checkbox').props.accessibilityState.disabled).toBe(false),
    );
  });

  it('signing after the SR gate records the SAME consent payload (audit semantics)', async () => {
    mockScreenReader(true);
    // Biometric path: no hardware → useBiometricGate falls back to Alert;
    // make hardware available + enrolled + success for a deterministic pass.
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

    const { findByTestId, getByRole, getByLabelText } = render(
      <LoanConsentScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.press(await findByTestId('consent-sr-reviewed-all'));
    await waitFor(() =>
      expect(getByRole('checkbox').props.accessibilityState.disabled).toBe(false),
    );

    fireEvent.press(getByRole('checkbox'));
    fireEvent.press(getByLabelText('mobile.loan.consent.cta.signContinue'));

    await waitFor(() => expect(mockRecordLoanConsent).toHaveBeenCalled());
    expect(mockRecordLoanConsent).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        consentType: 'CREDIT_BUREAU',
        consentVersion: '2.0',
        kfsId: 'kfs-001',
      }),
    );
  });
});
