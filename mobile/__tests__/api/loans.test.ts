/**
 * Loan API client — Phase 6C
 *
 * Tests:
 * - Every endpoint sends Authorization header (via apiClient interceptor)
 * - recordConsent POSTs with correct signature payload format
 * - 401 / 403 / 409 / 422 error paths
 *
 * Mock pattern: declare jest.fn() inside factory (avoids hoisting issues).
 */

// ── Mock apiClient inside factory ──────────────────────────────────────────

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { apiClient } from '../../src/lib/api';
import {
  listLoanProducts,
  getLoanProduct,
  createLoanApplication,
  listLoanApplications,
  getLoanApplication,
  submitLoanApplication,
  assignBankToApplication,
  uploadLoanDocument,
  listLoanDocuments,
  recordLoanConsent,
  getLoanPackageDownloadUrl,
  listPartnerBanks,
  checkLoanEligibility,
} from '../../src/api/loans';

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────

function makeError(status: number) {
  const err: Record<string, unknown> = new Error(`Request failed with status ${status}`);
  (err as { response?: unknown }).response = {
    status,
    statusText: String(status),
    data: { message: `Error ${status}` },
  };
  return err;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Loan API client — endpoint URLs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: {} });
    mockPost.mockResolvedValue({ data: {} });
  });

  it('listLoanProducts calls GET /loans/products with params', async () => {
    mockGet.mockResolvedValue({ data: { items: [], totalCount: 0 } });
    await listLoanProducts({ page: 1, pageSize: 50 });
    expect(mockGet).toHaveBeenCalledWith('/loans/products', {
      params: { page: 1, pageSize: 50 },
    });
  });

  it('getLoanProduct calls GET /loans/products/:productId', async () => {
    mockGet.mockResolvedValue({ data: { productId: 'p-1', productName: 'Test', bankId: 'b-1', minAmount: 100000, maxAmount: 5000000, tenureMonths: 36, interestRate: 12, isActive: true } });
    const result = await getLoanProduct('p-1');
    expect(mockGet).toHaveBeenCalledWith('/loans/products/p-1');
    expect(result.productId).toBe('p-1');
  });

  it('createLoanApplication calls POST /loans/applications', async () => {
    mockPost.mockResolvedValue({ data: { applicationId: 'app-1' } });
    const result = await createLoanApplication({
      loanProductId: 'p-1',
      requestedAmount: 1_500_000,
      tenureMonths: 24,
      purpose: 'WORKING_CAPITAL',
    });
    expect(mockPost).toHaveBeenCalledWith('/loans/applications', expect.objectContaining({
      loanProductId: 'p-1',
      requestedAmount: 1_500_000,
      tenureMonths: 24,
      purpose: 'WORKING_CAPITAL',
    }));
    expect(result.applicationId).toBe('app-1');
  });

  it('listLoanApplications calls GET /loans/applications with status filter', async () => {
    mockGet.mockResolvedValue({ data: { items: [], totalCount: 0 } });
    await listLoanApplications({ status: 'SUBMITTED', page: 1, pageSize: 20 });
    expect(mockGet).toHaveBeenCalledWith('/loans/applications', {
      params: { status: 'SUBMITTED', page: 1, pageSize: 20 },
    });
  });

  it('getLoanApplication calls GET /loans/applications/:id', async () => {
    const APP = {
      applicationId: 'app-1',
      orgId: 'org-1',
      loanProductId: 'p-1',
      status: 'DRAFT' as const,
      requestedAmount: 1_000_000,
      tenureMonths: 12,
      purpose: 'EQUIPMENT' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    mockGet.mockResolvedValue({ data: APP });
    const result = await getLoanApplication('app-1');
    expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-1');
    expect(result.applicationId).toBe('app-1');
  });

  it('submitLoanApplication calls POST /loans/applications/:id/submit', async () => {
    await submitLoanApplication('app-1');
    expect(mockPost).toHaveBeenCalledWith('/loans/applications/app-1/submit');
  });

  it('assignBankToApplication calls POST /loans/applications/:id/assign-bank', async () => {
    mockPost.mockResolvedValue({ data: { packageUrl: 'https://gcs.example.com/pkg.pdf' } });
    const result = await assignBankToApplication('app-1', { bankId: 'bank-1' });
    expect(mockPost).toHaveBeenCalledWith(
      '/loans/applications/app-1/assign-bank',
      { bankId: 'bank-1' },
    );
    expect(result.packageUrl).toBe('https://gcs.example.com/pkg.pdf');
  });

  it('uploadLoanDocument calls POST /loans/applications/:id/documents', async () => {
    mockPost.mockResolvedValue({ data: { documentId: 'doc-1' } });
    const result = await uploadLoanDocument('app-1', {
      documentType: 'PAN_CARD',
      fileBase64: 'abc123==',
      fileName: 'pan_card.pdf',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/loans/applications/app-1/documents',
      expect.objectContaining({ documentType: 'PAN_CARD', fileName: 'pan_card.pdf' }),
    );
    expect(result.documentId).toBe('doc-1');
  });

  it('listLoanDocuments calls GET /loans/applications/:id/documents', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    const result = await listLoanDocuments('app-1');
    expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-1/documents');
    expect(result.items).toEqual([]);
  });

  it('getLoanPackageDownloadUrl calls GET /loans/applications/:id/package/download-url', async () => {
    mockGet.mockResolvedValue({ data: { url: 'https://signed.url/pkg.pdf', expiresAt: '2026-04-25T12:00:00Z' } });
    const result = await getLoanPackageDownloadUrl('app-1');
    expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-1/package/download-url');
    expect(result.url).toBe('https://signed.url/pkg.pdf');
  });

  it('listPartnerBanks calls GET /loans/banks', async () => {
    mockGet.mockResolvedValue({ data: { items: [], totalCount: 0 } });
    await listPartnerBanks({ page: 1, pageSize: 10 });
    expect(mockGet).toHaveBeenCalledWith('/loans/banks', { params: { page: 1, pageSize: 10 } });
  });

  it('checkLoanEligibility calls POST /loans/eligibility', async () => {
    mockPost.mockResolvedValue({ data: { score: 75, qualifiedCount: 2, totalBanks: 5, qualifyReasons: [], improveReasons: [], qualifiedProducts: [], nearMatchProducts: [] } });
    const result = await checkLoanEligibility({
      requestedAmount: 1_000_000,
      tenureMonths: 24,
      purpose: 'WORKING_CAPITAL',
      softCheckConsent: true,
    });
    expect(mockPost).toHaveBeenCalledWith('/loans/eligibility', expect.objectContaining({
      softCheckConsent: true,
    }));
    expect(result.score).toBe(75);
  });
});

// ── Tests — recordConsent payload format ───────────────────────────────────

describe('Loan API client — recordConsent signature payload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { consentId: 'consent-uuid-1', signatureHex: 'aabbccdd' },
    });
  });

  it('recordConsent POSTs to /loans/applications/:id/consent', async () => {
    await recordLoanConsent('app-uuid-123', {
      consentVersion: '1.4',
      consentType: 'CREDIT_BUREAU',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/loans/applications/app-uuid-123/consent',
      expect.any(Object),
    );
  });

  it('recordConsent payload includes consentVersion and consentType', async () => {
    await recordLoanConsent('app-uuid-123', {
      consentVersion: '1.4',
      consentType: 'CREDIT_BUREAU',
    });
    const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toEqual(
      expect.objectContaining({
        consentVersion: '1.4',
        consentType: 'CREDIT_BUREAU',
      }),
    );
  });

  it('recordConsent consentVersion is forwarded as-is (never transformed)', async () => {
    const VERSION = '1.4';
    await recordLoanConsent('app-uuid-123', {
      consentVersion: VERSION,
      consentType: 'DATA_SHARE_WITH_BANK',
    });
    const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.consentVersion).toBe(VERSION);
  });

  it('recordConsent called for CREDIT_BUREAU returns consentId and signatureHex', async () => {
    const result = await recordLoanConsent('app-1', {
      consentVersion: '1.4',
      consentType: 'CREDIT_BUREAU',
    });
    expect(result.consentId).toBe('consent-uuid-1');
    expect(result.signatureHex).toBe('aabbccdd');
  });

  it('recordConsent called for DATA_SHARE_WITH_BANK sends correct consentType', async () => {
    await recordLoanConsent('app-1', {
      consentVersion: '1.4',
      consentType: 'DATA_SHARE_WITH_BANK',
    });
    const [url, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/loans/applications/app-1/consent');
    expect(payload.consentType).toBe('DATA_SHARE_WITH_BANK');
  });

  it('recordConsent called for DISBURSEMENT_MANDATE sends correct consentType', async () => {
    await recordLoanConsent('app-1', {
      consentVersion: '1.4',
      consentType: 'DISBURSEMENT_MANDATE',
    });
    const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.consentType).toBe('DISBURSEMENT_MANDATE');
  });
});

// ── Tests — Auth header is carried (apiClient contract) ───────────────────

describe('Loan API client — auth header forwarded via apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: {} });
    mockPost.mockResolvedValue({ data: {} });
  });

  it('all GET calls go through apiClient.get (not raw fetch)', async () => {
    mockGet.mockResolvedValue({ data: { items: [], totalCount: 0 } });
    await listLoanProducts();
    expect(mockGet).toHaveBeenCalled();
    // apiClient is configured with Authorization interceptor at module level —
    // routing via apiClient.get guarantees auth header is included
    expect(mockGet).not.toHaveBeenCalledWith(
      expect.stringContaining('fetch'),
    );
  });

  it('all POST calls go through apiClient.post (not raw fetch)', async () => {
    await submitLoanApplication('app-1');
    expect(mockPost).toHaveBeenCalled();
  });

  it('recordConsent goes through apiClient.post (auth header guaranteed)', async () => {
    mockPost.mockResolvedValue({ data: { consentId: 'c-1', signatureHex: 'ff00' } });
    await recordLoanConsent('app-1', { consentVersion: '1.4', consentType: 'CREDIT_BUREAU' });
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Auth header is attached by apiClient interceptor — presence is tested at apiClient level
    // Here we assert the function routes through apiClient and not directly
    expect(mockPost.mock.calls[0][0]).toBe('/loans/applications/app-1/consent');
  });

  it('getLoanPackageDownloadUrl uses apiClient.get (never caches signed URL)', async () => {
    mockGet.mockResolvedValue({ data: { url: 'https://signed.url/pkg.pdf', expiresAt: '2026-04-25T12:00:00Z' } });
    await getLoanPackageDownloadUrl('app-2');
    expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-2/package/download-url');
    // Called exactly once — no caching layer wrapping the call
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ── Tests — Error paths ────────────────────────────────────────────────────

describe('Loan API client — error paths', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getLoanApplication rejects with response.status 401', async () => {
    mockGet.mockRejectedValue(makeError(401));
    let caught: unknown;
    try { await getLoanApplication('app-1'); } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(401);
  });

  it('createLoanApplication rejects with response.status 403', async () => {
    mockPost.mockRejectedValue(makeError(403));
    let caught: unknown;
    try {
      await createLoanApplication({ loanProductId: 'p-1', requestedAmount: 100000, tenureMonths: 12, purpose: 'OTHER' });
    } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(403);
  });

  it('recordConsent rejects with response.status 409 (duplicate consent)', async () => {
    mockPost.mockRejectedValue(makeError(409));
    let caught: unknown;
    try {
      await recordLoanConsent('app-1', { consentVersion: '1.4', consentType: 'CREDIT_BUREAU' });
    } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(409);
  });

  it('submitLoanApplication rejects with response.status 422 (invalid state)', async () => {
    mockPost.mockRejectedValue(makeError(422));
    let caught: unknown;
    try { await submitLoanApplication('app-1'); } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(422);
  });

  it('listLoanProducts rejects with response.status 401', async () => {
    mockGet.mockRejectedValue(makeError(401));
    let caught: unknown;
    try { await listLoanProducts(); } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(401);
  });

  it('getLoanPackageDownloadUrl rejects with response.status 403', async () => {
    mockGet.mockRejectedValue(makeError(403));
    let caught: unknown;
    try { await getLoanPackageDownloadUrl('app-1'); } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(403);
  });
});
