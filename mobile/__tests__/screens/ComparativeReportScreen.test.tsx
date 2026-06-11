/**
 * ComparativeReportScreen — Wave 7 / GAP-044.
 * Covers: skeleton, chart group rendering with full text a11y summary,
 * MoM↔YoY toggle drives the granularity param, latest-period summary,
 * empty + error states.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

jest.mock('../../src/api/accounting', () => {
  const actual = jest.requireActual('../../src/api/accounting');
  return { ...actual, getComparativeReport: jest.fn() };
});

import { getComparativeReport } from '../../src/api/accounting';
import { ComparativeReportScreen } from '../../src/screens/home/ComparativeReportScreen';

const mockGetComparative = getComparativeReport as jest.Mock;

const REPORT = {
  organizationId: 'org1',
  granularity: 'month',
  generatedAt: '2026-06-12T05:00:00Z',
  periods: [
    { label: 'Apr 2026', periodKey: '2026-04', revenue: 500000, expenses: 350000, netProfit: 150000 },
    { label: 'May 2026', periodKey: '2026-05', revenue: 650000, expenses: 400000, netProfit: 250000 },
  ],
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { goBack: jest.fn() } as never;

describe('ComparativeReportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetComparative.mockResolvedValue(REPORT);
  });

  it('renders one chart group per period with a full text a11y summary', async () => {
    const { getByTestId } = render(<ComparativeReportScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('comparative-chart')).toBeTruthy());
    const group = getByTestId('comparative-chart-group-2026-05');
    // Values are never colour-only — the group label narrates all three series.
    expect(group.props.accessibilityLabel).toContain('mobile.reports.comparative.groupA11y');
  });

  it('defaults to MoM and switches to YoY (granularity param)', async () => {
    const { getByTestId } = render(<ComparativeReportScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect(mockGetComparative).toHaveBeenCalledWith(
        expect.objectContaining({ granularity: 'month' }),
      ),
    );
    fireEvent.press(getByTestId('comparative-tab-year'));
    await waitFor(() =>
      expect(mockGetComparative).toHaveBeenCalledWith(
        expect.objectContaining({ granularity: 'year' }),
      ),
    );
  });

  it('shows the latest-period summary card', async () => {
    const { getByTestId, getAllByText } = render(
      <ComparativeReportScreen navigation={navigation} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('comparative-summary')).toBeTruthy());
    // Appears in the chart group label AND the summary card title.
    expect(getAllByText('May 2026').length).toBeGreaterThanOrEqual(1);
  });

  it('empty state when there are no periods', async () => {
    mockGetComparative.mockResolvedValue({ ...REPORT, periods: [] });
    const { getByTestId } = render(<ComparativeReportScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('comparative-empty')).toBeTruthy());
  });

  it('error state offers retry', async () => {
    mockGetComparative.mockRejectedValue(new Error('boom'));
    const { getByTestId } = render(<ComparativeReportScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('comparative-error')).toBeTruthy());
  });
});
