/**
 * GAP-064 — X-Device-Integrity header attachment tests.
 *
 * Pinned Wave 8 contract: EXACTLY four POST call sites carry the
 * `X-Device-Integrity` + `X-Device-Integrity-Platform` headers:
 *   1. POST /auth/otp/send                         (OTP send / resend)
 *   2. POST /auth/otp/verify                       (OTP verify / login)
 *   3. POST /loans/applications/{id}/submit        (loan application submit)
 *   4. POST /loans/applications/{id}/consents      (loan consent record)
 *
 * We exercise the request interceptor directly (same pattern as
 * api.interceptor.test.ts) — no real HTTP calls.
 */

// ── Mocks (must be declared before any non-jest imports) ─────────────────

jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../../src/services/deviceIntegrity', () => ({
  getIntegrityToken: jest.fn(),
}));

// Block the axios fetch-adapter crash in jest (see api.interceptor.test.ts).
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
);

// ── Imports ───────────────────────────────────────────────────────────────

import { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

import { apiClient, requiresDeviceIntegrity } from '../../src/lib/api';
import { getIntegrityToken } from '../../src/services/deviceIntegrity';
import { submitLoanApplication, recordLoanConsent } from '../../src/api/loans';

const mockGetIntegrityToken = getIntegrityToken as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────

/** The request interceptor registered by api.ts. */
function getRequestInterceptor() {
  const handlers = (apiClient.interceptors.request as unknown as {
    handlers: Array<{
      fulfilled?: (c: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig>;
    }>;
  }).handlers;
  const interceptor = handlers[handlers.length - 1];
  if (!interceptor?.fulfilled) throw new Error('Request interceptor not found');
  return interceptor.fulfilled;
}

function makeConfig(method: string, url: string): InternalAxiosRequestConfig {
  return {
    method,
    url,
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig;
}

async function runInterceptor(method: string, url: string) {
  const result = await getRequestInterceptor()(makeConfig(method, url));
  return result.headers as AxiosHeaders;
}

const APP_ID = '4f9c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegrityToken.mockResolvedValue({ token: 'mock-dev-token', platform: 'IOS' });
});

// ── requiresDeviceIntegrity route matching ────────────────────────────────

describe('requiresDeviceIntegrity', () => {
  it.each([
    '/auth/otp/send',
    '/auth/otp/verify',
    `/loans/applications/${APP_ID}/submit`,
    `/loans/applications/${APP_ID}/consents`,
  ])('matches pinned call site POST %s', (url) => {
    expect(requiresDeviceIntegrity('post', url)).toBe(true);
  });

  it.each([
    ['get', '/auth/otp/send'], // wrong method
    ['post', '/auth/token/refresh'],
    ['post', '/auth/me/kyc/aadhaar/otp/send'], // KYC OTP is NOT a pinned site
    ['post', '/auth/me/kyc/aadhaar/otp/verify'],
    ['post', `/loans/applications/${APP_ID}/kfs`],
    ['post', '/loans/applications'], // create ≠ submit
    ['post', `/loans/applications/${APP_ID}/close`],
    ['post', '/callbacks'],
  ])('does NOT match %s %s', (method, url) => {
    expect(requiresDeviceIntegrity(method, url)).toBe(false);
  });

  it('handles missing method/url safely', () => {
    expect(requiresDeviceIntegrity(undefined, '/auth/otp/send')).toBe(false);
    expect(requiresDeviceIntegrity('post', undefined)).toBe(false);
  });
});

// ── Header attachment on the 4 pinned call sites ──────────────────────────

describe('integrity header attachment', () => {
  it.each([
    '/auth/otp/send',
    '/auth/otp/verify',
    `/loans/applications/${APP_ID}/submit`,
    `/loans/applications/${APP_ID}/consents`,
  ])('attaches both headers on POST %s', async (url) => {
    const headers = await runInterceptor('post', url);
    expect(headers['X-Device-Integrity']).toBe('mock-dev-token');
    expect(headers['X-Device-Integrity-Platform']).toBe('IOS');
  });

  it('sends the ANDROID platform value as-is', async () => {
    mockGetIntegrityToken.mockResolvedValue({ token: 'verdict-abc', platform: 'ANDROID' });
    const headers = await runInterceptor('post', '/auth/otp/verify');
    expect(headers['X-Device-Integrity']).toBe('verdict-abc');
    expect(headers['X-Device-Integrity-Platform']).toBe('ANDROID');
  });

  it('does not attach headers on non-pinned routes', async () => {
    const headers = await runInterceptor('post', '/auth/token/refresh');
    expect(headers['X-Device-Integrity']).toBeUndefined();
    expect(headers['X-Device-Integrity-Platform']).toBeUndefined();
    expect(mockGetIntegrityToken).not.toHaveBeenCalled();
  });

  it('soft-fails: no headers when attestation is unavailable (null)', async () => {
    mockGetIntegrityToken.mockResolvedValue(null);
    const headers = await runInterceptor('post', '/auth/otp/send');
    expect(headers['X-Device-Integrity']).toBeUndefined();
    expect(headers['X-Device-Integrity-Platform']).toBeUndefined();
  });

  it('soft-fails: request proceeds even if getIntegrityToken rejects (backstop)', async () => {
    mockGetIntegrityToken.mockRejectedValue(new Error('should never happen'));
    const headers = await runInterceptor('post', '/auth/otp/send');
    expect(headers['X-Device-Integrity']).toBeUndefined();
  });
});

// ── Call-site integration: loan API functions hit pinned routes ───────────

describe('loan API call sites hit integrity-pinned routes', () => {
  it('submitLoanApplication POSTs to a route covered by requiresDeviceIntegrity', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: undefined });
    await submitLoanApplication(APP_ID);
    const url = postSpy.mock.calls[0][0] as string;
    expect(requiresDeviceIntegrity('post', url)).toBe(true);
    postSpy.mockRestore();
  });

  it('recordLoanConsent POSTs to a route covered by requiresDeviceIntegrity', async () => {
    const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { consentId: 'c1', signedAt: '2026-06-12T00:00:00Z' },
    });
    await recordLoanConsent(APP_ID, {
      consentType: 'loan_application',
      consentVersion: 'v1.0',
      kfsId: 'kfs-1',
    } as Parameters<typeof recordLoanConsent>[1]);
    const url = postSpy.mock.calls[0][0] as string;
    expect(requiresDeviceIntegrity('post', url)).toBe(true);
    postSpy.mockRestore();
  });
});
