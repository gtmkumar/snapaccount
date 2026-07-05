/**
 * Smoke tests — ReportPdfPreviewScreen (DG-DASH-05, D3.1/D3.2).
 *
 * Verifies the PDF preview flow: generate (POST /reports/generate) → resolve a
 * signed download URL (GET /reports/{id}/download-url) → render PdfViewerMobile,
 * the WhatsApp-first / system / Bank-CA share bar, the 15-min share-link call,
 * and the unsupported-slug gate (no API call).
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Share } from 'react-native';

const mockGenerateAndResolvePdf = jest.fn();
const mockCreateReportShareLink = jest.fn();

jest.mock('../../src/api/reports', () => {
  const actual = jest.requireActual('../../src/api/reports');
  return {
    ...actual,
    generateAndResolvePdf: (...args: unknown[]) => mockGenerateAndResolvePdf(...args),
    createReportShareLink: (...args: unknown[]) => mockCreateReportShareLink(...args),
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

import { ReportPdfPreviewScreen } from '../../src/screens/home/ReportPdfPreviewScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

function renderScreen(reportType: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const route = { params: { reportType, title: 'Profit & Loss' } } as never;
  return render(
    <QueryClientProvider client={qc}>
      <ReportPdfPreviewScreen navigation={mockNavigation} route={route} />
    </QueryClientProvider>,
  );
}

describe('ReportPdfPreviewScreen', () => {
  beforeEach(() => {
    mockGenerateAndResolvePdf.mockReset();
    mockCreateReportShareLink.mockReset();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });

  it('generates a PDF for a supported slug and renders the viewer + share bar', async () => {
    mockGenerateAndResolvePdf.mockResolvedValue({
      jobId: 'j1',
      signedUrl: 'https://gcs/report.pdf',
      pageCount: 2,
    });

    const { getByTestId, getByLabelText } = renderScreen('pnl');

    await waitFor(() => {
      expect(getByTestId('report-pdf-viewer')).toBeTruthy();
    });
    // 'pnl' slug must resolve to the ProfitAndLoss backend type.
    expect(mockGenerateAndResolvePdf).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'ProfitAndLoss', format: 'Pdf' }),
    );
    // Share bar present.
    expect(getByLabelText('mobile.reports.preview.shareWhatsApp')).toBeTruthy();
    expect(getByLabelText('mobile.reports.preview.shareBank')).toBeTruthy();
  });

  it('mints a 15-min share link when "Share with Bank/CA" is pressed', async () => {
    mockGenerateAndResolvePdf.mockResolvedValue({
      jobId: 'j1',
      signedUrl: 'https://gcs/report.pdf',
      pageCount: 1,
    });
    mockCreateReportShareLink.mockResolvedValue({
      jobId: 'j1',
      signedUrl: 'https://gcs/share-link',
      expiresAt: 't',
    });

    const { getByLabelText } = renderScreen('balance-sheet');

    await waitFor(() => {
      expect(getByLabelText('mobile.reports.preview.shareBank')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('mobile.reports.preview.shareBank'));

    await waitFor(() => {
      expect(mockCreateReportShareLink).toHaveBeenCalledWith('j1');
    });
    expect(Share.share).toHaveBeenCalled();
  });

  it('does not generate for an unsupported slug (cash-flow)', async () => {
    const { getByText } = renderScreen('cash-flow');

    await waitFor(() => {
      expect(getByText('mobile.reports.detail.notAvailable')).toBeTruthy();
    });
    expect(mockGenerateAndResolvePdf).not.toHaveBeenCalled();
  });
});
