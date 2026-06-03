/**
 * Identity Documents API client — unit tests.
 *
 * Verifies each helper hits the correct /auth/me/documents path with the
 * documented payload, including the lowercase kind mapping in the URL and the
 * Aadhaar / PAN / GSTIN / TAN input normalization.
 *
 * Mock pattern: declare jest.fn() inside the factory (avoids hoisting issues) —
 * same approach as __tests__/api/auth.test.ts.
 */

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../../src/lib/api';
import {
  mapKindToPath,
  normalizeNumber,
  getVerificationPolicy,
  getDocuments,
  saveDocument,
  sendDocumentOtp,
  confirmDocumentOtp,
} from '../../src/api/documents';

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('kind mapping + normalization', () => {
  it('maps the uppercase enum to the lowercase URL segment', () => {
    expect(mapKindToPath('PAN')).toBe('pan');
    expect(mapKindToPath('AADHAAR')).toBe('aadhaar');
    expect(mapKindToPath('GSTIN')).toBe('gstin');
    expect(mapKindToPath('TAN')).toBe('tan');
  });

  it('strips spaces and hyphens from Aadhaar', () => {
    expect(normalizeNumber('AADHAAR', '1234 5678 9012')).toBe('123456789012');
    expect(normalizeNumber('AADHAAR', '1234-5678-9012')).toBe('123456789012');
  });

  it('upper-cases and trims PAN / GSTIN / TAN', () => {
    expect(normalizeNumber('PAN', ' abcde1234f ')).toBe('ABCDE1234F');
    expect(normalizeNumber('GSTIN', '27aabcu9603r1zm')).toBe('27AABCU9603R1ZM');
    expect(normalizeNumber('TAN', 'aaaa99999a')).toBe('AAAA99999A');
  });
});

describe('getVerificationPolicy', () => {
  it('GET /auth/me/organization/verification-policy returns the body', async () => {
    mockGet.mockResolvedValue({ data: { governmentVerificationEnabled: true } });
    await expect(getVerificationPolicy()).resolves.toEqual({
      governmentVerificationEnabled: true,
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/auth/me/organization/verification-policy',
    );
  });
});

describe('getDocuments', () => {
  it('GET /auth/me/documents returns the list', async () => {
    const docs = [
      { kind: 'PAN', referenceNumber: 'ABCDE1234F', status: 'VERIFIED', verifiedAt: '2026-01-01' },
    ];
    mockGet.mockResolvedValue({ data: docs });
    await expect(getDocuments()).resolves.toEqual(docs);
    expect(mockGet).toHaveBeenCalledWith('/auth/me/documents');
  });

  it('returns [] when the body is empty', async () => {
    mockGet.mockResolvedValue({ data: undefined });
    await expect(getDocuments()).resolves.toEqual([]);
  });
});

describe('saveDocument', () => {
  it('POSTs to the lowercase kind path with a normalized number', async () => {
    mockPost.mockResolvedValue({
      data: { kind: 'PAN', referenceNumber: 'ABCDE1234F', status: 'SAVED' },
    });
    await saveDocument('PAN', ' abcde1234f ');
    expect(mockPost).toHaveBeenCalledWith('/auth/me/documents/pan', {
      number: 'ABCDE1234F',
    });
  });

  it('strips Aadhaar formatting and includes holderName when provided', async () => {
    mockPost.mockResolvedValue({
      data: { kind: 'AADHAAR', referenceNumber: 'XXXX XXXX 9012', status: 'SAVED' },
    });
    await saveDocument('AADHAAR', '1234 5678 9012', 'Asha Rao');
    expect(mockPost).toHaveBeenCalledWith('/auth/me/documents/aadhaar', {
      number: '123456789012',
      holderName: 'Asha Rao',
    });
  });

  it('omits holderName when not provided', async () => {
    mockPost.mockResolvedValue({ data: { kind: 'TAN', referenceNumber: 'AAAA99999A', status: 'SAVED' } });
    await saveDocument('TAN', 'aaaa99999a');
    expect(mockPost).toHaveBeenCalledWith('/auth/me/documents/tan', {
      number: 'AAAA99999A',
    });
  });
});

describe('OTP verification', () => {
  it('send POSTs to .../verify/otp/send with the normalized number', async () => {
    mockPost.mockResolvedValue({ data: { transactionId: 'txn_1' } });
    await expect(sendDocumentOtp('GSTIN', '27aabcu9603r1zm')).resolves.toEqual({
      transactionId: 'txn_1',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/me/documents/gstin/verify/otp/send',
      { number: '27AABCU9603R1ZM' },
    );
  });

  it('confirm POSTs to .../verify/otp/confirm with transactionId + otp', async () => {
    mockPost.mockResolvedValue({
      data: { kind: 'PAN', status: 'VERIFIED', verifiedAt: '2026-06-03', otpAccepted: true },
    });
    const res = await confirmDocumentOtp('PAN', 'txn_1', '123456');
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/me/documents/pan/verify/otp/confirm',
      { transactionId: 'txn_1', otp: '123456' },
    );
    expect(res.otpAccepted).toBe(true);
  });

  it('surfaces otpAccepted=false (rejected OTP) without throwing', async () => {
    mockPost.mockResolvedValue({
      data: { kind: 'PAN', status: 'PENDING', verifiedAt: null, otpAccepted: false },
    });
    const res = await confirmDocumentOtp('PAN', 'txn_1', '000000');
    expect(res.otpAccepted).toBe(false);
    expect(res.status).toBe('PENDING');
  });
});
