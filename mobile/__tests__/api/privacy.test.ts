/**
 * Privacy API client — M3b (GAP-020) unit tests.
 *
 * Tests:
 *  - getMyConsents: calls GET /auth/me/consents, returns items array
 *  - withdrawConsent: calls POST /auth/me/consents/{purpose}/withdraw
 *  - requestDataExport: calls POST /auth/me/data-export
 *  - getDataExportStatus: calls GET /auth/me/data-export
 *  - submitDataCorrection: calls POST /auth/me/data-correction
 *  - listMyDataCorrections: calls GET /auth/me/data-correction
 */

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import {
  getMyConsents,
  withdrawConsent,
  requestDataExport,
  getDataExportStatus,
  submitDataCorrection,
  listMyDataCorrections,
} from '../../src/api/privacy';

const CONSENTS_RESPONSE = {
  data: {
    items: [
      {
        purposeCode: 'CREDIT_BUREAU',
        purposeLabel: 'Credit Bureau Check',
        description: 'We check your credit score',
        status: 'GRANTED',
        grantedAt: '2026-01-01T00:00:00Z',
        consentTextVersion: '1.0',
      },
    ],
  },
};

describe('Privacy API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyConsents', () => {
    it('calls GET /auth/me/consents and returns items', async () => {
      mockGet.mockResolvedValueOnce(CONSENTS_RESPONSE);
      const result = await getMyConsents();
      expect(mockGet).toHaveBeenCalledWith('/auth/me/consents');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].purposeCode).toBe('CREDIT_BUREAU');
    });

    // IOS-01: backend GetMyConsentsQuery returns the PascalCase envelope
    // `{ Consents: [...] }` with ConsentEntry field names (purpose/actionAt/…),
    // not the camelCase `{ items: [...] }` with UserConsent field names. The
    // client must normalize both the envelope and each entry so the consent
    // summary shows real data instead of the degradation banner.
    it('normalizes the PascalCase `Consents` envelope to `items`', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          Consents: [
            {
              purpose: 'CREDIT_BUREAU',
              purposeDescription: 'We check your credit score',
              status: 'GRANTED',
              noticeVersion: '1.0',
              actionAt: '2026-01-01T00:00:00Z',
              locale: 'en',
            },
          ],
        },
      });
      const result = await getMyConsents();
      expect(result.items).toHaveLength(1);
      const c = result.items[0];
      expect(c.purposeCode).toBe('CREDIT_BUREAU');
      expect(c.purposeLabel).toBe('Credit Bureau'); // humanized fallback
      expect(c.description).toBe('We check your credit score');
      expect(c.status).toBe('GRANTED');
      expect(c.grantedAt).toBe('2026-01-01T00:00:00Z');
      expect(c.consentTextVersion).toBe('1.0');
    });

    it('normalizes the camelCase `consents` envelope and maps withdrawn entries', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          consents: [
            {
              purpose: 'MARKETING',
              purposeDescription: 'Promo messages',
              status: 'Withdrawn',
              noticeVersion: '2.0',
              actionAt: '2026-02-02T00:00:00Z',
              locale: 'en',
            },
          ],
        },
      });
      const result = await getMyConsents();
      expect(result.items).toHaveLength(1);
      const c = result.items[0];
      expect(c.purposeCode).toBe('MARKETING');
      expect(c.status).toBe('WITHDRAWN'); // case-insensitive status mapping
      expect(c.withdrawnAt).toBe('2026-02-02T00:00:00Z');
    });

    it('accepts a bare array response', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ purpose: 'ANALYTICS', status: 'GRANTED', actionAt: '2026-03-03T00:00:00Z' }],
      });
      const result = await getMyConsents();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].purposeCode).toBe('ANALYTICS');
    });

    it('degrades to an empty items array for a malformed/unknown shape', async () => {
      mockGet.mockResolvedValueOnce({ data: { somethingElse: true } });
      const result = await getMyConsents();
      expect(result.items).toEqual([]);
    });

    it('passes through the already-correct mobile shape unchanged', async () => {
      mockGet.mockResolvedValueOnce(CONSENTS_RESPONSE);
      const result = await getMyConsents();
      expect(result.items[0].purposeLabel).toBe('Credit Bureau Check');
      expect(result.items[0].description).toBe('We check your credit score');
    });
  });

  describe('withdrawConsent', () => {
    it('calls POST /auth/me/consents/{purpose}/withdraw with body', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await withdrawConsent('CREDIT_BUREAU', { noticeVersion: '1.0', locale: 'en' });
      expect(mockPost).toHaveBeenCalledWith(
        '/auth/me/consents/CREDIT_BUREAU/withdraw',
        { noticeVersion: '1.0', locale: 'en' },
      );
    });

    it('uses default locale en when none provided', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await withdrawConsent('MARKETING', { noticeVersion: '1.0' });
      expect(mockPost).toHaveBeenCalledWith(
        '/auth/me/consents/MARKETING/withdraw',
        expect.objectContaining({ noticeVersion: '1.0' }),
      );
    });
  });

  describe('requestDataExport', () => {
    it('calls POST /auth/me/data-export and returns jobId', async () => {
      mockPost.mockResolvedValueOnce({ data: { jobId: 'job-abc', requestedAt: '2026-01-01' } });
      const result = await requestDataExport();
      expect(mockPost).toHaveBeenCalledWith('/auth/me/data-export');
      expect(result.jobId).toBe('job-abc');
    });
  });

  describe('getDataExportStatus', () => {
    it('calls GET /auth/me/data-export and returns job details', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          jobId: 'job-abc',
          status: 'READY',
          requestedAt: '2026-01-01T00:00:00Z',
          downloadUrl: 'https://example.com/export.zip',
          expiresAt: '2026-01-08T00:00:00Z',
        },
      });
      const result = await getDataExportStatus();
      expect(mockGet).toHaveBeenCalledWith('/auth/me/data-export');
      expect(result?.status).toBe('READY');
      expect(result?.downloadUrl).toBe('https://example.com/export.zip');
    });

    it('returns null when 404 (no job yet)', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      const result = await getDataExportStatus();
      expect(result).toBeNull();
    });
  });

  describe('submitDataCorrection', () => {
    it('calls POST /auth/me/data-correction with body', async () => {
      mockPost.mockResolvedValueOnce({ data: { requestId: 'req-1', submittedAt: '2026-01-01' } });
      const result = await submitDataCorrection({
        category: 'NAME',
        description: 'My name is spelled wrong',
      });
      expect(mockPost).toHaveBeenCalledWith('/auth/me/data-correction', {
        category: 'NAME',
        description: 'My name is spelled wrong',
      });
      expect(result.requestId).toBe('req-1');
    });
  });

  describe('listMyDataCorrections', () => {
    it('calls GET /auth/me/data-correction and returns items', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          items: [
            {
              requestId: 'req-1',
              category: 'NAME',
              description: 'Name correction',
              status: 'PENDING',
              submittedAt: '2026-01-01T00:00:00Z',
            },
          ],
          total: 1,
        },
      });
      const result = await listMyDataCorrections();
      expect(mockGet).toHaveBeenCalledWith('/auth/me/data-correction');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].requestId).toBe('req-1');
    });
  });
});
