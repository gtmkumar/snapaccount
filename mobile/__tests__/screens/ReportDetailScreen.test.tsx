/**
 * Smoke tests — ReportDetailScreen (DG-DASH-03)
 * Verifies the screen fetches GET /accounting/reports/{type} via getReportRows
 * (not the dead /reports/{slug} path), maps rows, and gates unsupported slugs.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetReportRows = jest.fn();

jest.mock('../../src/api/accounting', () => {
  const actual = jest.requireActual('../../src/api/accounting');
  return {
    ...actual,
    getReportRows: (...args: unknown[]) => mockGetReportRows(...args),
  };
});

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

import { ReportDetailScreen } from '../../src/screens/home/ReportDetailScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

function renderScreen(reportType: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const route = { params: { reportType } } as never;
  return render(
    <QueryClientProvider client={qc}>
      <ReportDetailScreen navigation={mockNavigation} route={route} />
    </QueryClientProvider>,
  );
}

describe('ReportDetailScreen', () => {
  beforeEach(() => {
    mockGetReportRows.mockReset();
  });

  it('fetches profit-and-loss via getReportRows and renders mapped rows', async () => {
    mockGetReportRows.mockResolvedValue({
      type: 'profit-and-loss',
      rows: [
        { label: 'Sales (4000)', amount: 100000 },
        { label: 'Net Profit / Loss', amount: 40000, isTotal: true, isHighlighted: true },
      ],
    });

    const { getByText } = renderScreen('pnl');

    await waitFor(() => {
      expect(getByText('Sales (4000)')).toBeTruthy();
    });
    // 'pnl' UI alias must be normalised to the backend 'profit-and-loss' slug.
    expect(mockGetReportRows).toHaveBeenCalledWith(
      'profit-and-loss',
      expect.objectContaining({ fyYear: expect.any(Number) }),
    );
  });

  it('does not call the API for an unsupported slug (cash-flow)', async () => {
    const { getByText } = renderScreen('cash-flow');

    await waitFor(() => {
      expect(getByText('mobile.reports.detail.notAvailable')).toBeTruthy();
    });
    expect(mockGetReportRows).not.toHaveBeenCalled();
  });
});
