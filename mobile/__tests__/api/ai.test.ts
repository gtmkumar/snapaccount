/**
 * ai api — DG-CHAT-06. Verifies POST /ai/chat is called with the exact backend
 * contract (message/sessionId/locale/topK in body, Accept-Language header) and
 * the { answer, sourceChunkCount, … } response is returned verbatim.
 */

const mockPost = jest.fn();
jest.mock('../../src/lib/api', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { askAi } from '../../src/api/ai';

describe('askAi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({
      data: {
        answer: 'Your GSTR-3B is due on the 20th.',
        sourceChunkCount: 3,
        provider: 'mock',
        model: 'mock-1',
        latencyMs: 12,
      },
    });
  });

  it('POSTs to /ai/chat with the documented body and Accept-Language header', async () => {
    // Trimming is the caller's concern (the screen); the api forwards verbatim.
    await askAi({ message: 'When is my GST due?', locale: 'hi', topK: 7 });

    expect(mockPost).toHaveBeenCalledWith(
      '/ai/chat',
      { message: 'When is my GST due?', sessionId: undefined, locale: 'hi', topK: 7 },
      { headers: { 'Accept-Language': 'hi' } },
    );
  });

  it('defaults locale to en and topK to 5', async () => {
    await askAi({ message: 'hi' });
    expect(mockPost).toHaveBeenCalledWith(
      '/ai/chat',
      expect.objectContaining({ locale: 'en', topK: 5 }),
      { headers: { 'Accept-Language': 'en' } },
    );
  });

  it('returns the parsed response', async () => {
    const res = await askAi({ message: 'q' });
    expect(res.answer).toBe('Your GSTR-3B is due on the 20th.');
    expect(res.sourceChunkCount).toBe(3);
  });
});
