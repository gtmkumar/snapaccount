/**
 * Report Service API client — unit tests (DG-DASH-05, D3.1/D3.2).
 *
 * Locks the backend contract the mobile Report PDF Preview & Share flow depends
 * on: POST /reports/generate (enum NAMES, not ints), GET /reports/{id}/download-url,
 * POST /reports/{id}/share-link (15-min link), POST /reports/tally-export, and the
 * slug→BackendReportType mapping that gates which slugs can be exported as PDF.
 *
 * Mock pattern: jest.fn() declared inside the factory (avoids hoisting issues) —
 * same approach as __tests__/api/documents.test.ts.
 */

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../../src/lib/api';
import {
  reportTypeForSlug,
  generateReport,
  getReportDownloadUrl,
  createReportShareLink,
  enqueueTallyExport,
  generateAndResolvePdf,
} from '../../src/api/reports';

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reportTypeForSlug', () => {
  it('maps UI slugs (incl. the pnl alias) to backend ReportType NAMES', () => {
    expect(reportTypeForSlug('pnl')).toBe('ProfitAndLoss');
    expect(reportTypeForSlug('profit-and-loss')).toBe('ProfitAndLoss');
    expect(reportTypeForSlug('trial-balance')).toBe('TrialBalance');
    expect(reportTypeForSlug('balance-sheet')).toBe('BalanceSheet');
    expect(reportTypeForSlug('tax-liability')).toBe('TaxLiability');
  });

  it('returns null for slugs with no PDF generator (gates the export button)', () => {
    expect(reportTypeForSlug('cash-flow')).toBeNull();
    expect(reportTypeForSlug('ledger')).toBeNull();
    expect(reportTypeForSlug('comparative')).toBeNull();
    expect(reportTypeForSlug('forecast')).toBeNull();
    expect(reportTypeForSlug('nope')).toBeNull();
  });
});

describe('generateReport', () => {
  it('POSTs /reports/generate with enum NAMES and defaults format to Pdf', async () => {
    mockPost.mockResolvedValue({ data: { jobId: 'j1', status: 'COMPLETE' } });
    await generateReport({ reportType: 'ProfitAndLoss', financialYear: '2026' });
    expect(mockPost).toHaveBeenCalledWith('/reports/generate', {
      reportType: 'ProfitAndLoss',
      format: 'Pdf',
      financialYear: '2026',
      periodStart: undefined,
      periodEnd: undefined,
    });
  });
});

describe('getReportDownloadUrl / createReportShareLink', () => {
  it('GETs the signed download URL by job id', async () => {
    mockGet.mockResolvedValue({
      data: { jobId: 'j1', signedUrl: 'https://gcs/x.pdf', expiresAt: 't' },
    });
    await expect(getReportDownloadUrl('j1')).resolves.toEqual({
      jobId: 'j1',
      signedUrl: 'https://gcs/x.pdf',
      expiresAt: 't',
    });
    expect(mockGet).toHaveBeenCalledWith('/reports/j1/download-url');
  });

  it('POSTs the 15-min share link by job id', async () => {
    mockPost.mockResolvedValue({
      data: { jobId: 'j1', signedUrl: 'https://gcs/share', expiresAt: 't' },
    });
    await expect(createReportShareLink('j1')).resolves.toMatchObject({
      signedUrl: 'https://gcs/share',
    });
    expect(mockPost).toHaveBeenCalledWith('/reports/j1/share-link');
  });
});

describe('enqueueTallyExport', () => {
  it('POSTs /reports/tally-export', async () => {
    mockPost.mockResolvedValue({ data: { jobId: 'tx', status: 'COMPLETE' } });
    await enqueueTallyExport();
    expect(mockPost).toHaveBeenCalledWith('/reports/tally-export', {
      periodStart: undefined,
      periodEnd: undefined,
    });
  });
});

describe('generateAndResolvePdf', () => {
  it('generates then resolves the signed URL in one call', async () => {
    mockPost.mockResolvedValue({ data: { jobId: 'j9', status: 'COMPLETE', pageCount: 3 } });
    mockGet.mockResolvedValue({
      data: { jobId: 'j9', signedUrl: 'https://gcs/j9.pdf', expiresAt: 't' },
    });
    await expect(
      generateAndResolvePdf({ reportType: 'BalanceSheet', financialYear: '2026' }),
    ).resolves.toEqual({ jobId: 'j9', signedUrl: 'https://gcs/j9.pdf', pageCount: 3 });
    // format is forced to Pdf even though the caller omitted it.
    expect(mockPost).toHaveBeenCalledWith(
      '/reports/generate',
      expect.objectContaining({ reportType: 'BalanceSheet', format: 'Pdf' }),
    );
  });

  it('throws (no download attempt) when generation FAILED', async () => {
    mockPost.mockResolvedValue({ data: { jobId: 'j0', status: 'FAILED' } });
    await expect(
      generateAndResolvePdf({ reportType: 'ProfitAndLoss' }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
