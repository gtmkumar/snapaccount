/**
 * ifsc.ts — IFSC → bank/branch lookup (DG-AUTH-06).
 * Covers: live API success, network-error → offline fallback, unknown-prefix
 * fallback miss, and format gating.
 */

import { lookupIfsc, resolveFallbackBank } from '../../src/lib/ifsc';

describe('ifsc lookup', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns null for a format-invalid IFSC without hitting the network', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await lookupIfsc('NOTVALID')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves bank/branch from the live Razorpay API on success', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ BANK: 'HDFC Bank', BRANCH: 'Koramangala', CITY: 'Bengaluru' }),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await lookupIfsc('hdfc0001234');
    expect(result).toEqual({
      bank: 'HDFC Bank',
      branch: 'Koramangala',
      city: 'Bengaluru',
      fromFallback: false,
    });
  });

  it('falls back to the offline prefix table on a network error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const result = await lookupIfsc('SBIN0005678');
    expect(result).toEqual({ bank: 'State Bank of India', fromFallback: true });
  });

  it('returns null when the live API fails and the prefix is unknown', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    // ZZZZ is not in the fallback table.
    expect(await lookupIfsc('ZZZZ0009999')).toBeNull();
  });

  it('resolveFallbackBank maps known prefixes case-insensitively', () => {
    expect(resolveFallbackBank('icic0001111')).toBe('ICICI Bank');
    expect(resolveFallbackBank('UTIB0002222')).toBe('Axis Bank');
    expect(resolveFallbackBank('XXXX0000000')).toBeUndefined();
  });
});
