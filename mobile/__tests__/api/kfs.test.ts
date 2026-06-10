/**
 * KFS API client — M3a (GAP-021) unit tests.
 *
 * Tests:
 *  - generateKfs: POST /loans/applications/{id}/kfs → returns KfsId, APR etc.
 *  - getKfs: GET /loans/applications/{id}/kfs → parses feesJson + repaymentScheduleJson
 *  - getKfs with 404 → returns null (no KFS generated yet)
 *  - getKfs validates hmacSignature presence for `verified` flag
 */

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { generateKfs, getKfs } from '../../src/api/loans';

const GENERATE_RESPONSE = {
  data: {
    kfsId: 'kfs-001',
    annualPercentageRate: 18.5,
    loanAmount: 500000,
    tenureMonths: 24,
    monthlyEmi: 24750.5,
    feesJson: JSON.stringify([
      { feeType: 'PROCESSING_FEE', amount: 2500, description: 'Processing fee' },
    ]),
    repaymentScheduleJson: JSON.stringify([
      { instalment: 1, dueDate: '2026-08-01', principal: 18000, interest: 6750, balance: 482000 },
    ]),
    lenderName: 'HDFC Bank',
    grievanceOfficerContact: 'grievance@hdfc.com | 1800-xxx',
    coolingOffDays: 3,
    generatedAt: '2026-06-10T12:00:00Z',
  },
};

const KFS_DTO_RESPONSE = {
  data: {
    kfsId: 'kfs-001',
    annualPercentageRate: 18.5,
    loanAmount: 500000,
    tenureMonths: 24,
    monthlyEmi: 24750.5,
    feesJson: JSON.stringify([
      { feeType: 'PROCESSING_FEE', amount: 2500, description: 'Processing fee' },
    ]),
    repaymentScheduleJson: JSON.stringify([
      { instalment: 1, dueDate: '2026-08-01', principal: 18000, interest: 6750, balance: 482000 },
    ]),
    lenderName: 'HDFC Bank',
    grievanceOfficerContact: 'grievance@hdfc.com | 1800-xxx',
    coolingOffDays: 3,
    generatedAt: '2026-06-10T12:00:00Z',
    acknowledgedAt: null,
    hmacSignature: 'sha256-abcdef1234567890',
  },
};

describe('KFS API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKfs', () => {
    it('POSTs to /loans/applications/{id}/kfs and returns kfsId', async () => {
      mockPost.mockResolvedValueOnce(GENERATE_RESPONSE);
      const result = await generateKfs('app-123');
      expect(mockPost).toHaveBeenCalledWith('/loans/applications/app-123/kfs');
      expect(result.kfsId).toBe('kfs-001');
      expect(result.annualPercentageRate).toBe(18.5);
      expect(result.lenderName).toBe('HDFC Bank');
    });
  });

  describe('getKfs', () => {
    it('GETs /loans/applications/{id}/kfs and parses fees + schedule JSON', async () => {
      mockGet.mockResolvedValueOnce(KFS_DTO_RESPONSE);
      const result = await getKfs('app-123');
      expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-123/kfs');
      expect(result).not.toBeNull();
      expect(result!.fees).toHaveLength(1);
      expect(result!.fees[0].feeType).toBe('PROCESSING_FEE');
      expect(result!.repaymentSchedule).toHaveLength(1);
      expect(result!.repaymentSchedule[0].instalment).toBe(1);
    });

    it('extracts hmacSignature last 8 chars as signatureLast8', async () => {
      mockGet.mockResolvedValueOnce(KFS_DTO_RESPONSE);
      const result = await getKfs('app-123');
      // KFS_DTO_RESPONSE hmacSignature = 'sha256-abcdef1234567890'
      // last 8 chars = '34567890'
      expect(result!.signatureLast8).toBe('sha256-abcdef1234567890'.slice(-8));
    });

    it('marks verified=true when hmacSignature is present', async () => {
      mockGet.mockResolvedValueOnce(KFS_DTO_RESPONSE);
      const result = await getKfs('app-123');
      expect(result!.verified).toBe(true);
    });

    it('marks verified=false when hmacSignature is absent', async () => {
      mockGet.mockResolvedValueOnce({
        data: { ...KFS_DTO_RESPONSE.data, hmacSignature: null },
      });
      const result = await getKfs('app-123');
      expect(result!.verified).toBe(false);
    });

    it('returns null when backend returns 404 (no KFS yet)', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      const result = await getKfs('app-123');
      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 500 }, message: 'Server Error' });
      await expect(getKfs('app-123')).rejects.toMatchObject({ response: { status: 500 } });
    });
  });
});
