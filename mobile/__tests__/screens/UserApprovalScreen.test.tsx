/**
 * UserApprovalScreen — Phase 6D
 * Updated: SEC-048 real biometric via expo-local-authentication
 * Tests: Approve disabled until scroll-to-bottom; biometric (LocalAuthentication or Alert fallback);
 *        on approve calls submitFilingForReview and navigates.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

import { submitFilingForReview } from '../../src/api/itr';
const mockSubmit = submitFilingForReview as jest.Mock;

jest.mock('../../src/api/itr', () => ({
  submitFilingForReview: jest.fn(() => Promise.resolve()),
}));

import { UserApprovalScreen } from '../../src/screens/itr/UserApprovalScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = { params: { filingId: 'f1' } } as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Simulate user scrolling to the bottom of the disclaimer ScrollView */
function simulateScrollToBottom(screen: ReturnType<typeof render>) {
  const scrollView = screen.UNSAFE_getAllByType(
    require('react-native').ScrollView,
  )[0];
  fireEvent.scroll(scrollView, {
    nativeEvent: {
      contentOffset: { y: 900, x: 0 },
      contentSize: { height: 940, width: 400 },
      layoutMeasurement: { height: 400, width: 400 },
    },
  });
}

describe('UserApprovalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmit.mockResolvedValue(undefined);
  });

  it('renders header without crashing', () => {
    const { getByText } = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    expect(getByText('mobile.itr.approval.title')).toBeTruthy();
  });

  it('Approve button has disabled style (opacity 0.4) before scroll', () => {
    const screen = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    const approveBtn = screen.getByLabelText('mobile.itr.approval.approveCta');
    // style array includes approveBtnDisabled (opacity 0.4) when canApprove is false
    const flatStyle = [approveBtn.props.style].flat();
    const opacityStyle = flatStyle.find(
      (s: Record<string, unknown>) => s && typeof s === 'object' && 'opacity' in s,
    );
    expect(opacityStyle?.opacity).toBe(0.4);
  });

  it('pressing Approve without scroll shows scrollFirst Alert', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    fireEvent.press(screen.getByLabelText('mobile.itr.approval.approveCta'));
    expect(alertSpy).toHaveBeenCalledWith(
      'mobile.itr.approval.scrollFirst',
      'mobile.itr.approval.scrollFirstBody',
    );
  });

  it('SEC-048: biometric CTA visible after scroll; calls LocalAuthentication.authenticateAsync when hardware present', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

    const screen = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    simulateScrollToBottom(screen);
    await waitFor(() =>
      expect(screen.getByLabelText('mobile.itr.approval.biometricCta')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('mobile.itr.approval.biometricCta'));
    });
    await waitFor(() =>
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ disableDeviceFallback: false }),
      ),
    );
  });

  it('SEC-048: biometric CTA falls back to Alert when no hardware', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const screen = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    simulateScrollToBottom(screen);
    await waitFor(() =>
      expect(screen.getByLabelText('mobile.itr.approval.biometricCta')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('mobile.itr.approval.biometricCta'));
    });
    // useBiometricGate centralises the fallback Alert — uses mobile.biometric.fallback.* keys
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'mobile.biometric.fallback.title',
        'mobile.biometric.fallback.body',
        expect.arrayContaining([expect.objectContaining({ style: 'cancel' })]),
        expect.anything(),
      ),
    );
    alertSpy.mockRestore();
  });

  it('SEC-048: successful biometric then Approve calls submitFilingForReview', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

    const screen = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );

    simulateScrollToBottom(screen);
    await waitFor(() =>
      expect(screen.getByLabelText('mobile.itr.approval.biometricCta')).toBeTruthy(),
    );

    // handleBiometric is async — wrap in act so state update (setBiometricPassed) settles
    await act(async () => {
      fireEvent.press(screen.getByLabelText('mobile.itr.approval.biometricCta'));
    });

    // Biometric passed — now approve
    await act(async () => {
      fireEvent.press(screen.getByLabelText('mobile.itr.approval.approveCta'));
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('f1'));
    await waitFor(() =>
      expect(mockNavigation.navigate).toHaveBeenCalledWith('EVerification', { filingId: 'f1' }),
    );
  });

  it('shows verifyFirst Alert when scroll done but biometric not confirmed', async () => {
    // Use a fresh spy (no mockImplementation override) so Alert behaves normally
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(
      <Wrapper><UserApprovalScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    simulateScrollToBottom(screen);
    // biometric CTA appears but we do NOT press it
    await waitFor(() =>
      expect(screen.getByLabelText('mobile.itr.approval.biometricCta')).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('mobile.itr.approval.approveCta'));
    expect(alertSpy).toHaveBeenCalledWith(
      'mobile.itr.approval.verifyFirst',
      'mobile.itr.approval.verifyFirstBody',
    );
    alertSpy.mockRestore();
  });
});
