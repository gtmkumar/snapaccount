/**
 * Document auto-classification helper — unit tests (DG-DOC-05).
 *
 * Covers the mock-first / credential-gated contract:
 *   - When the backend endpoint responds with a usable suggestion → source 'ai'.
 *   - When the backend endpoint errors (not implemented / offline) → local
 *     heuristic fallback, NEVER throws.
 *   - When EXPO_PUBLIC_AUTO_CLASSIFY=false → no suggestion (banner suppressed).
 */

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../../src/lib/api';
import {
  classifyDocumentCategory,
  heuristicClassify,
  AI_SUGGESTION_MIN_CONFIDENCE,
} from '../../src/api/documentClassify';

const mockPost = apiClient.post as jest.Mock;

const ORIGINAL_ENV = process.env.EXPO_PUBLIC_AUTO_CLASSIFY;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_AUTO_CLASSIFY;
});

afterAll(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.EXPO_PUBLIC_AUTO_CLASSIFY;
  else process.env.EXPO_PUBLIC_AUTO_CLASSIFY = ORIGINAL_ENV;
});

describe('heuristicClassify', () => {
  it('maps a strong keyword to the canonical backend code with > 70% confidence', () => {
    const s = heuristicClassify('purchase-invoice-april.jpg');
    expect(s.categoryCode).toBe('PURCHASE_BILL');
    expect(s.confidence).toBeGreaterThan(AI_SUGGESTION_MIN_CONFIDENCE);
    expect(s.source).toBe('heuristic');
  });

  it('returns no suggestion for an opaque filename', () => {
    const s = heuristicClassify('IMG_0042.jpg');
    expect(s.categoryCode).toBeNull();
    expect(s.confidence).toBe(0);
    expect(s.source).toBe('none');
  });
});

describe('classifyDocumentCategory', () => {
  it('uses the backend suggestion when the endpoint returns a usable result', async () => {
    mockPost.mockResolvedValueOnce({ data: { categoryCode: 'sales_bill', confidence: 0.91 } });
    const s = await classifyDocumentCategory({ localUri: 'file:///a.jpg', filename: 'a.jpg' });
    expect(mockPost).toHaveBeenCalledWith(
      '/documents/classify-suggestion',
      expect.anything(),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
    expect(s.categoryCode).toBe('SALES_BILL');
    expect(s.confidence).toBe(0.91);
    expect(s.source).toBe('ai');
  });

  it('falls back to the heuristic when the backend endpoint is unavailable', async () => {
    mockPost.mockRejectedValueOnce(new Error('404 not implemented'));
    const s = await classifyDocumentCategory({
      localUri: 'file:///bank.jpg',
      filename: 'bank-statement-march.jpg',
    });
    expect(s.categoryCode).toBe('BANK_STATEMENT');
    expect(s.source).toBe('heuristic');
  });

  it('returns no suggestion (and skips the network) when auto-classify is disabled', async () => {
    process.env.EXPO_PUBLIC_AUTO_CLASSIFY = 'false';
    const s = await classifyDocumentCategory({ localUri: 'file:///x.jpg', filename: 'sales.jpg' });
    expect(s.categoryCode).toBeNull();
    expect(s.source).toBe('none');
    expect(mockPost).not.toHaveBeenCalled();
  });
});
