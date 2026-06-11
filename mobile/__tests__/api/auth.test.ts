/**
 * Auth API client — preferences, devices, KYC, 2FA.
 *
 * Verifies each helper hits the correct /auth path with the documented payload.
 * Mock pattern: declare jest.fn() inside the factory (avoids hoisting issues) —
 * same approach as __tests__/api/loans.test.ts.
 */

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { apiClient } from '../../src/lib/api';
import {
  getPreferences,
  updatePreferences,
  getDevices,
  revokeDevice,
  getMyApprovalStatus,
  verifyPan,
  sendAadhaarOtp,
  verifyAadhaarOtp,
  complete2faChallenge,
  refreshContext,
} from '../../src/api/auth';

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;
const mockDelete = apiClient.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('preferences', () => {
  it('GET /auth/me/preferences returns the body', async () => {
    const prefs = {
      preferredLanguage: 'en',
      theme: 'SYSTEM',
      pushNotificationsEnabled: true,
      smsNotificationsEnabled: false,
      emailNotificationsEnabled: true,
      whatsappNotificationsEnabled: false,
    };
    mockGet.mockResolvedValue({ data: prefs });
    await expect(getPreferences()).resolves.toEqual(prefs);
    expect(mockGet).toHaveBeenCalledWith('/auth/me/preferences');
  });

  it('PATCH /auth/me/preferences sends only the partial body', async () => {
    mockPatch.mockResolvedValue({ data: undefined });
    await updatePreferences({ smsNotificationsEnabled: true });
    expect(mockPatch).toHaveBeenCalledWith('/auth/me/preferences', {
      smsNotificationsEnabled: true,
    });
  });
});

describe('devices', () => {
  it('GET /auth/devices returns the list (defaults to [])', async () => {
    mockGet.mockResolvedValue({ data: undefined });
    await expect(getDevices()).resolves.toEqual([]);
    expect(mockGet).toHaveBeenCalledWith('/auth/devices');
  });

  it('DELETE /auth/devices/{id} targets the right path', async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await revokeDevice('dev-123');
    expect(mockDelete).toHaveBeenCalledWith('/auth/devices/dev-123');
  });

  // Wave 7 recon: NEW-device waiting screen polls a real verdict endpoint.
  it('GET /auth/devices/my-approval-status returns the verdict body as-is', async () => {
    const body = {
      approvalRequestId: 'req-1',
      status: 'PENDING',
      decidedAt: null,
      expiresAt: '2026-06-12T05:10:00Z',
      mode: 'ENFORCE',
    };
    mockGet.mockResolvedValue({ data: body });
    await expect(getMyApprovalStatus()).resolves.toEqual(body);
    expect(mockGet).toHaveBeenCalledWith('/auth/devices/my-approval-status');
  });
});

describe('KYC', () => {
  it('verifyPan POSTs { pan, name }', async () => {
    mockPost.mockResolvedValue({ data: { status: 'VERIFIED', verifiedAt: '2026-06-03' } });
    const res = await verifyPan('ABCDE1234F', 'Asha Rao');
    expect(mockPost).toHaveBeenCalledWith('/auth/me/kyc/pan/verify', {
      pan: 'ABCDE1234F',
      name: 'Asha Rao',
    });
    expect(res.status).toBe('VERIFIED');
  });

  it('sendAadhaarOtp strips spaces and hyphens to 12 digits', async () => {
    mockPost.mockResolvedValue({ data: { transactionId: 'txn-1' } });
    const res = await sendAadhaarOtp('1234-5678 9012');
    expect(mockPost).toHaveBeenCalledWith('/auth/me/kyc/aadhaar/otp/send', {
      aadhaar: '123456789012',
    });
    expect(res.transactionId).toBe('txn-1');
  });

  it('verifyAadhaarOtp POSTs { transactionId, otp }', async () => {
    mockPost.mockResolvedValue({ data: { status: 'VERIFIED' } });
    await verifyAadhaarOtp('txn-1', '123456');
    expect(mockPost).toHaveBeenCalledWith('/auth/me/kyc/aadhaar/otp/verify', {
      transactionId: 'txn-1',
      otp: '123456',
    });
  });
});

describe('2FA challenge', () => {
  it('POSTs { challengeToken, code } and returns the session', async () => {
    mockPost.mockResolvedValue({
      data: { token: 'tok', userId: 'u1', refreshToken: 'rt', refreshExpiresAt: '2026-07-01' },
    });
    const res = await complete2faChallenge('challenge-abc', '654321');
    expect(mockPost).toHaveBeenCalledWith('/auth/2fa/challenge', {
      challengeToken: 'challenge-abc',
      code: '654321',
    });
    expect(res.token).toBe('tok');
    expect(res.userId).toBe('u1');
  });
});

// GAP-007 / BUG-5
describe('refreshContext', () => {
  it('POSTs to /auth/token/refresh-context with no body', async () => {
    mockPost.mockResolvedValue({
      data: { accessToken: 'new-org-token', expiresAt: '2026-06-10T22:00:00Z' },
    });
    await refreshContext();
    expect(mockPost).toHaveBeenCalledWith('/auth/token/refresh-context');
  });

  it('returns accessToken and expiresAt from the response', async () => {
    mockPost.mockResolvedValue({
      data: { accessToken: 'tok-abc', expiresAt: '2026-06-10T22:00:00Z' },
    });
    const result = await refreshContext();
    expect(result.accessToken).toBe('tok-abc');
    expect(result.expiresAt).toBe('2026-06-10T22:00:00Z');
  });

  it('propagates HTTP errors to the caller (caller decides on fallback)', async () => {
    mockPost.mockRejectedValue(new Error('401 Unauthorized'));
    await expect(refreshContext()).rejects.toThrow('401 Unauthorized');
  });
});
