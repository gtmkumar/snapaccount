/**
 * Celebrations API client — P6-QA-MOBILE-10 server fire-guard.
 *
 * Backend contract (NotificationService Phase 6F):
 *   POST /notifications/celebrations/{kind}/fire — idempotent per user × kind,
 *     duplicate calls → 200 { alreadyFired: true }.
 *   GET  /notifications/celebrations — kind → fired boolean map.
 */

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { fireCelebration, getCelebrations } from '../../src/api/notifications';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fireCelebration', () => {
  it('POSTs to /notifications/celebrations/{kind}/fire', async () => {
    mockPost.mockResolvedValue({
      data: { alreadyFired: false, kind: 'first_gst_filed', firedAt: '2026-06-11T00:00:00Z' },
    });
    const res = await fireCelebration('first_gst_filed');
    expect(mockPost).toHaveBeenCalledWith('/notifications/celebrations/first_gst_filed/fire');
    expect(res.alreadyFired).toBe(false);
  });

  it('surfaces alreadyFired=true on duplicate fire', async () => {
    mockPost.mockResolvedValue({
      data: { alreadyFired: true, kind: 'first_loan_disbursed', firedAt: '2026-06-10T00:00:00Z' },
    });
    const res = await fireCelebration('first_loan_disbursed');
    expect(res.alreadyFired).toBe(true);
  });
});

describe('getCelebrations', () => {
  it('GETs the fired map', async () => {
    mockGet.mockResolvedValue({ data: { first_gst_filed: true, first_itr_filed: false } });
    const res = await getCelebrations();
    expect(mockGet).toHaveBeenCalledWith('/notifications/celebrations');
    expect(res).toEqual({ first_gst_filed: true, first_itr_filed: false });
  });

  it('returns {} when the response body is empty', async () => {
    mockGet.mockResolvedValue({ data: undefined });
    expect(await getCelebrations()).toEqual({});
  });
});
