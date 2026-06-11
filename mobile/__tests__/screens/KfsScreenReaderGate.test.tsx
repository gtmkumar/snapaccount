/**
 * KeyFactsStatementScreen — screen-reader scroll-gate (A11Y KFS-1, Blocker).
 * Closes X-5 / NEW-W2-002: asserts the legally-required acknowledgement gate
 * is satisfiable with a screen reader enabled, WITHOUT a visual scroll event,
 * and that the affordance does not exist for sighted (non-SR) users.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockKfs = {
  kfsId: 'kfs-001',
  applicationId: 'app-1',
  annualPercentageRate: 18.25,
  loanAmount: 500000,
  tenureMonths: 12,
  monthlyEmi: 45000,
  fees: [{ name: 'Processing fee', amount: 5000, type: 'one_time' }],
  repaymentSchedule: [
    { emiNumber: 1, dueDate: '2026-07-05', principal: 40000, interest: 5000, total: 45000, balance: 460000 },
  ],
  lenderName: 'Partner Bank',
  grievanceOfficerContact: 'grievance@partnerbank.in +91 9876543210',
  coolingOffDays: 3,
  hmacSignature: 'abcd'.repeat(16),
  generatedAt: '2026-06-10T10:00:00Z',
  acknowledgedAt: null,
  verified: true,
  signatureLast8: 'abcdabcd',
};

jest.mock('../../src/api/loans', () => ({
  getKfs: jest.fn(() => Promise.resolve(mockKfs)),
  generateKfs: jest.fn(() => Promise.resolve({})),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { KeyFactsStatementScreen } from '../../src/screens/loans/KeyFactsStatementScreen';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = { params: { applicationId: 'app-1' } } as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function mockScreenReader(enabled: boolean) {
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockResolvedValue(enabled);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
}

const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('KeyFactsStatementScreen — screen-reader gate (KFS-1)', () => {
  it('renders the reviewed-all affordance when a screen reader is enabled', async () => {
    mockScreenReader(true);
    const { findByTestId } = render(
      <KeyFactsStatementScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    expect(await findByTestId('kfs-sr-reviewed-all')).toBeTruthy();
  });

  it('does NOT render the affordance for non-screen-reader users', async () => {
    mockScreenReader(false);
    const { findByText, queryByTestId } = render(
      <KeyFactsStatementScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    // Wait for the KFS body to load first.
    await findByText('mobile.kfs.apr.label');
    expect(queryByTestId('kfs-sr-reviewed-all')).toBeNull();
  });

  it('satisfies the scroll-gate via the affordance without any scroll event', async () => {
    mockScreenReader(true);
    const { findByTestId, getByRole } = render(
      <KeyFactsStatementScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );

    // Wait for the KFS body to load (query resolution) before asserting.
    const affordance = await findByTestId('kfs-sr-reviewed-all');
    const checkbox = () => getByRole('checkbox');

    // Gate locked: acknowledgement checkbox disabled.
    expect(checkbox().props.accessibilityState.disabled).toBe(true);

    // Activate the reviewed-all affordance (no onScroll fired at all).
    fireEvent.press(affordance);

    await waitFor(() => {
      expect(checkbox().props.accessibilityState.disabled).toBe(false);
    });

    // Unlock is announced without a focus change (4.1.3).
    expect(announceSpy).toHaveBeenCalledWith('mobile.a11y.gateUnlocked');

    // Affordance disappears once the gate is satisfied.
    // (It only renders while screenReaderEnabled && !hasScrolledToBottom.)
  });

  it('after the SR gate, checking the box enables Continue with the SAME ack semantics', async () => {
    mockScreenReader(true);
    const { findByTestId, getByRole, getByLabelText } = render(
      <KeyFactsStatementScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.press(await findByTestId('kfs-sr-reviewed-all'));
    await waitFor(() =>
      expect(getByRole('checkbox').props.accessibilityState.disabled).toBe(false),
    );

    fireEvent.press(getByRole('checkbox'));

    const continueBtn = getByLabelText('mobile.kfs.cta.continue');
    await waitFor(() =>
      expect(continueBtn.props.accessibilityState.disabled).toBe(false),
    );

    // Continue navigates with the same kfsId payload as the visual path.
    fireEvent.press(continueBtn);
    expect((mockNavigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'LoanConsent',
      expect.objectContaining({ applicationId: 'app-1', kfsId: 'kfs-001', kfsVersion: 1 }),
    );
  });
});
