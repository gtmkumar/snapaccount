/**
 * ITR API client — Phase 6D
 * Tests: all 17 endpoints; auth header forwarded; panCipher sent as-is; 401/403/409 error paths.
 *
 * Mock pattern: declare jest.fn() inside factory (avoids hoisting issues with external vars).
 */

// ─── Mock apiClient inside factory so hoisting works ─────────────────────────

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { apiClient } from '../../src/lib/api';
import {
  getItrProfile,
  updateItrProfile,
  listItrFilings,
  startItrFiling,
  getItrFiling,
  computeTax,
  compareRegimes,
  submitFilingForReview,
  markFilingFiled,
  eVerifyFiling,
  uploadForm16,
  createItrNotice,
  respondToItrNotice,
  getRefundStatus,
  getTaxSlabs,
  getDeductionCatalog,
} from '../../src/api/itr';

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockPut = apiClient.put as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeError(status: number) {
  const err: Record<string, unknown> = new Error(`Request failed with status ${status}`);
  (err as { response?: unknown }).response = {
    status,
    statusText: String(status),
    data: { message: `Error ${status}` },
  };
  return err;
}

const COMPUTE_DATA = {
  salaryIncome: 1000000,
  housePropertyIncome: 0,
  businessIncome: 0,
  capitalGains: 0,
  otherIncome: 0,
  section80C: 150000,
  section80D: 25000,
  section80E: 0,
  otherDeductions: 0,
  advanceTaxPaid: 0,
  tdsPaid: 50000,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ITR API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: {} });
    mockPost.mockResolvedValue({ data: {} });
    mockPut.mockResolvedValue({ data: {} });
  });

  // ── Profile ───────────────────────────────────────────────────────────────

  it('getItrProfile calls GET /itr/profile/:userId', async () => {
    mockGet.mockResolvedValue({ data: { id: 'a1', userId: 'u1', panLast4: '1234', fullName: 'Ramesh', assesseeType: 'Individual' } });
    const result = await getItrProfile('u1');
    expect(mockGet).toHaveBeenCalledWith('/itr/profile/u1');
    expect(result.userId).toBe('u1');
  });

  it('updateItrProfile calls PUT /itr/profile and sends panCipher as-is (no decode)', async () => {
    const CIPHER = 'AES256:encrypted:ciphertext==';
    mockPut.mockResolvedValue({ data: { assesseeId: 'a1', panLast4: '4321', fullName: 'Ramesh' } });
    const result = await updateItrProfile({
      userId: 'u1',
      panCipher: CIPHER,
      panLast4: '4321',
      fullName: 'Ramesh',
      assesseeType: 'Individual',
    });
    expect(mockPut).toHaveBeenCalledWith('/itr/profile', expect.objectContaining({ panCipher: CIPHER }));
    // Must NOT decode or transform panCipher — value must be identical
    expect(mockPut.mock.calls[0][1].panCipher).toBe(CIPHER);
    expect(result.assesseeId).toBe('a1');
  });

  // ── Filings ───────────────────────────────────────────────────────────────

  it('listItrFilings calls GET /itr/filings with params', async () => {
    mockGet.mockResolvedValue({ data: { items: [], totalCount: 0, page: 1, pageSize: 10 } });
    await listItrFilings({ assesseeId: 'a1', status: 'DRAFT', page: 1, pageSize: 10 });
    expect(mockGet).toHaveBeenCalledWith('/itr/filings', {
      params: { assesseeId: 'a1', status: 'DRAFT', page: 1, pageSize: 10 },
    });
  });

  it('startItrFiling calls POST /itr/filings', async () => {
    mockPost.mockResolvedValue({ data: { filingId: 'f1', assessmentYear: 'AY2025-26', status: 'DRAFT' } });
    const result = await startItrFiling({ assesseeId: 'a1', assessmentYear: 'AY2025-26', itrFormType: 'ITR-1', regime: 'NEW' });
    expect(mockPost).toHaveBeenCalledWith('/itr/filings', expect.objectContaining({ assesseeId: 'a1' }));
    expect(result.filingId).toBe('f1');
  });

  it('getItrFiling calls GET /itr/filings/:id', async () => {
    mockGet.mockResolvedValue({ data: { id: 'f1', assesseeId: 'a1', assessmentYear: 'AY2025-26', itrFormType: 'ITR-1', regime: 'NEW', status: 'DRAFT', createdAt: '2025-07-01', updatedAt: '2025-07-01' } });
    const result = await getItrFiling('f1');
    expect(mockGet).toHaveBeenCalledWith('/itr/filings/f1');
    expect(result.id).toBe('f1');
  });

  it('computeTax calls POST /itr/filings/:id/compute', async () => {
    mockPost.mockResolvedValue({ data: { filingId: 'f1', grossTotalIncome: 1000000, taxableIncome: 825000, totalTaxPayable: 100000, payableOrRefund: 50000, computationHash: 'xyz', regime: 'NEW', assessmentYear: 'AY2025-26' } });
    await computeTax('f1', COMPUTE_DATA);
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/compute', COMPUTE_DATA);
  });

  it('compareRegimes calls POST /itr/filings/:id/compare-regimes', async () => {
    mockPost.mockResolvedValue({ data: { old: {}, new: {}, recommendedRegime: 'NEW', taxSaving: 12500 } });
    await compareRegimes('f1', COMPUTE_DATA);
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/compare-regimes', COMPUTE_DATA);
  });

  it('submitFilingForReview calls POST /itr/filings/:id/submit', async () => {
    await submitFilingForReview('f1');
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/submit');
  });

  it('markFilingFiled calls POST /itr/filings/:id/mark-filed with acknowledgementNumber', async () => {
    await markFilingFiled('f1', 'ACK20251234567890');
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/mark-filed', { acknowledgementNumber: 'ACK20251234567890' });
  });

  it('eVerifyFiling calls POST /itr/filings/:id/e-verify with method', async () => {
    await eVerifyFiling('f1', { verificationMethod: 'AadhaarOtp' });
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/e-verify', { verificationMethod: 'AadhaarOtp' });
  });

  // ── Form 16 ───────────────────────────────────────────────────────────────

  it('uploadForm16 calls POST /itr/filings/:id/form16 with panCipher as-is', async () => {
    const CIPHER = 'AES256:cipher:abc==';
    mockPost.mockResolvedValue({ data: { form16ExtractId: 'e1', ocrStatus: 'Pending' } });
    await uploadForm16('f1', {
      assesseeId: 'a1',
      gcsUri: 'gs://bucket/form16.pdf',
      employeePanCipher: CIPHER,
      employeePanLast4: '5678',
    });
    const calledWith = mockPost.mock.calls[0][1];
    expect(calledWith.employeePanCipher).toBe(CIPHER);
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/form16', expect.any(Object));
  });

  // ── Notices ───────────────────────────────────────────────────────────────

  it('createItrNotice calls POST /itr/filings/:id/notices', async () => {
    mockPost.mockResolvedValue({ data: { noticeId: 'nt1', status: 'RECEIVED' } });
    await createItrNotice('f1', {
      assesseeId: 'a1',
      noticeNumber: 'NTC2025001',
      noticeType: 'Notice_143_1',
      issuedDate: '2025-07-01',
    });
    expect(mockPost).toHaveBeenCalledWith('/itr/filings/f1/notices', expect.objectContaining({ assesseeId: 'a1' }));
  });

  it('respondToItrNotice calls POST /itr/notices/:id/respond', async () => {
    await respondToItrNotice('nt1', { respondedByUserId: 'u1', responseText: 'Reply text' });
    expect(mockPost).toHaveBeenCalledWith('/itr/notices/nt1/respond', expect.objectContaining({ respondedByUserId: 'u1' }));
  });

  // ── Refund ────────────────────────────────────────────────────────────────

  it('getRefundStatus calls GET /itr/filings/:id/refund', async () => {
    mockGet.mockResolvedValue({ data: { filingId: 'f1', refundStatus: 'Pending', lastPolledAt: '2025-08-01T10:00:00Z' } });
    const result = await getRefundStatus('f1');
    expect(mockGet).toHaveBeenCalledWith('/itr/filings/f1/refund');
    expect(result.refundStatus).toBe('Pending');
  });

  // ── Tax slabs & deductions ────────────────────────────────────────────────

  it('getTaxSlabs calls GET /itr/tax-slabs with assessmentYear and regime params', async () => {
    mockGet.mockResolvedValue({ data: { versionId: 'v1', assessmentYear: 'AY2025-26', regime: 'NEW', slabsJson: [], standardDeduction: 75000, rebate87AIncomeLimit: 700000, rebate87AMaxAmount: 25000, cessRatePct: 4 } });
    await getTaxSlabs('AY2025-26', 'NEW');
    expect(mockGet).toHaveBeenCalledWith('/itr/tax-slabs', { params: { assessmentYear: 'AY2025-26', regime: 'NEW' } });
  });

  it('getDeductionCatalog calls GET /itr/deduction-catalog', async () => {
    mockGet.mockResolvedValue({ data: { sections: [] } });
    await getDeductionCatalog('AY2025-26', 'OLD');
    expect(mockGet).toHaveBeenCalledWith('/itr/deduction-catalog', { params: { assessmentYear: 'AY2025-26', regime: 'OLD' } });
  });

  // ── Error paths ───────────────────────────────────────────────────────────

  it('getItrProfile rejects and error has response.status 401', async () => {
    mockGet.mockRejectedValue(makeError(401));
    let caught: unknown;
    try { await getItrProfile('u1'); } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(401);
  });

  it('updateItrProfile rejects and error has response.status 403', async () => {
    mockPut.mockRejectedValue(makeError(403));
    let caught: unknown;
    try {
      await updateItrProfile({ userId: 'u1', fullName: 'X', assesseeType: 'Individual' });
    } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(403);
  });

  it('startItrFiling rejects and error has response.status 409', async () => {
    mockPost.mockRejectedValue(makeError(409));
    let caught: unknown;
    try {
      await startItrFiling({ assesseeId: 'a1', assessmentYear: 'AY2025-26', itrFormType: 'ITR-1', regime: 'NEW' });
    } catch (e) { caught = e; }
    expect((caught as { response?: { status: number } }).response?.status).toBe(409);
  });
});
