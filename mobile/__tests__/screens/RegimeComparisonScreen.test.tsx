/**
 * RegimeComparisonScreen — Phase 6D
 * Tests: RegimeBarChart renders with Old+New values; recommendation highlights cheaper regime;
 *        Choose CTA fires Alert then navigates to FilingSummary with chosen regime.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

jest.mock('../../src/components/shared/RegimeBarChart', () => {
  const { View, Text } = require('react-native');
  return {
    RegimeBarChart: (props: {
      oldTax: number;
      newTax: number;
      recommendedRegime: string;
      testID?: string;
    }) => (
      <View testID={props.testID ?? 'regime-bar-chart'}>
        <Text testID="old-tax-value">{props.oldTax}</Text>
        <Text testID="new-tax-value">{props.newTax}</Text>
        <Text testID="recommended-regime">{props.recommendedRegime}</Text>
      </View>
    ),
  };
});

jest.mock('../../src/lib/utils', () => ({
  formatINR: (n: number) => `₹${n.toLocaleString('en-IN')}`,
}));

import { compareRegimes, getTaxSlabs } from '../../src/api/itr';
const mockCompareRegimes = compareRegimes as jest.Mock;
const mockGetTaxSlabs = getTaxSlabs as jest.Mock;

const OLD_RESULT = {
  filingId: 'f1', grossTotalIncome: 1000000, taxableIncome: 850000,
  totalTaxPayable: 112500, payableOrRefund: 112500,
  computationHash: 'abc', regime: 'OLD' as const, assessmentYear: 'AY2025-26',
};
const NEW_RESULT = {
  filingId: 'f1', grossTotalIncome: 1000000, taxableIncome: 1000000,
  totalTaxPayable: 100000, payableOrRefund: 100000,
  computationHash: 'def', regime: 'NEW' as const, assessmentYear: 'AY2025-26',
};

jest.mock('../../src/api/itr', () => ({
  compareRegimes: jest.fn(),
  getTaxSlabs: jest.fn(),
}));

import { RegimeComparisonScreen } from '../../src/screens/itr/RegimeComparisonScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = { params: { filingId: 'f1', computeData: null } } as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('RegimeComparisonScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompareRegimes.mockResolvedValue({
      old: OLD_RESULT,
      new: NEW_RESULT,
      recommendedRegime: 'NEW',
      taxSaving: 12500,
    });
    mockGetTaxSlabs.mockResolvedValue({
      versionId: 'v2025', assessmentYear: 'AY2025-26', regime: 'NEW',
      slabsJson: [], standardDeduction: 75000, rebate87AIncomeLimit: 700000,
      rebate87AMaxAmount: 25000, cessRatePct: 4,
    });
  });

  it('renders header without crashing', () => {
    const { getByText } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    expect(getByText('mobile.itr.regimeComparison.title')).toBeTruthy();
  });

  it('renders RegimeBarChart with old and new tax values after data loads', async () => {
    const { getByTestId } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await waitFor(() => expect(getByTestId('regime-bar-chart')).toBeTruthy());
    expect(getByTestId('old-tax-value').props.children).toBe(112500);
    expect(getByTestId('new-tax-value').props.children).toBe(100000);
  });

  it('recommendation banner highlights the cheaper regime (NEW)', async () => {
    const { getByTestId } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await waitFor(() => expect(getByTestId('recommended-regime')).toBeTruthy());
    expect(getByTestId('recommended-regime').props.children).toBe('NEW');
  });

  it('Choose New Regime button triggers Alert with confirm action', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByLabelText } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await waitFor(() => expect(getByLabelText('mobile.itr.regimeComparison.chooseNew')).toBeTruthy());
    fireEvent.press(getByLabelText('mobile.itr.regimeComparison.chooseNew'));
    expect(alertSpy).toHaveBeenCalledWith(
      'mobile.itr.regimeComparison.confirmTitle',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ style: 'cancel' }),
        expect.objectContaining({ text: 'mobile.itr.regimeComparison.confirmCta' }),
      ]),
    );
  });

  it('Confirm in Alert navigates to FilingSummary with chosen regime', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      (_title, _msg, buttons) => {
        const confirm = (buttons as Array<{ text: string; onPress?: () => void }>).find(
          (b) => b.text === 'mobile.itr.regimeComparison.confirmCta',
        );
        confirm?.onPress?.();
      },
    );
    const { getByLabelText } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await waitFor(() => expect(getByLabelText('mobile.itr.regimeComparison.chooseOld')).toBeTruthy());
    fireEvent.press(getByLabelText('mobile.itr.regimeComparison.chooseOld'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('FilingSummary', { filingId: 'f1', regime: 'OLD' });
    alertSpy.mockRestore();
  });

  it('shows error state when compareRegimes rejects', async () => {
    mockCompareRegimes.mockRejectedValue(new Error('network error'));
    const { getByText } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await waitFor(() => expect(getByText('mobile.itr.regimeComparison.error')).toBeTruthy());
  });
});
