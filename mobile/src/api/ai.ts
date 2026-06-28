/**
 * AI Service API — typed client for the org-scoped RAG Q&A endpoint.
 * DG-CHAT-06 · docs/design/screens/mobile/expert-chat.md Screen 42/43.
 *
 * Backend contract (Assist composite, POST /ai/chat):
 *   Request body  → { message, sessionId?, locale?, topK? }
 *                   org_id is derived server-side from the JWT claim (SEC-AI-02
 *                   M-03) — NEVER sent from the client.
 *                   Accept-Language header also drives Indic-locale routing.
 *   Response 200  → { answer, sourceChunkCount, provider, model, latencyMs }
 *   Response 429  → { error, code:'Ai.DailyBudgetExceeded' } (rate / budget)
 *   Response 400  → org missing from JWT, or validation failure.
 */

import { apiClient } from '../lib/api';

export interface AiChatRequest {
  message: string;
  /** Optional session id for conversation continuity (P7b — not yet used). */
  sessionId?: string;
  /** Accept-Language base tag (en, hi, bn, …). Defaults handled by caller. */
  locale?: string;
  /** Context chunks to retrieve (1–10, default 5). */
  topK?: number;
}

export interface AiChatResponse {
  /** Grounded natural-language answer. */
  answer: string;
  /** Number of org-scoped RAG chunks used to ground the answer (0 = no data). */
  sourceChunkCount: number;
  provider: string;
  model: string;
  latencyMs: number;
}

/**
 * POST /ai/chat — grounded, org-scoped quick answer.
 *
 * The locale is sent both in the body and as the Accept-Language header so the
 * backend's header-first routing picks it up regardless of precedence.
 */
export async function askAi(req: AiChatRequest): Promise<AiChatResponse> {
  const locale = req.locale ?? 'en';
  const res = await apiClient.post<AiChatResponse>(
    '/ai/chat',
    {
      message: req.message,
      sessionId: req.sessionId,
      locale,
      topK: req.topK ?? 5,
    },
    {
      headers: { 'Accept-Language': locale },
    },
  );
  return res.data;
}
