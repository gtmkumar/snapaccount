/**
 * AI Service API client — DG-CHAT-07
 *
 * Routes all AI calls through the backend /ai endpoints (server-side RAG pipeline
 * with PII redaction, per-org token budget, and RLS-scoped retrieval).
 *
 * Architecture decision: client-side Gemini (firebase-ai.ts) is intentionally
 * deleted — all AI traffic MUST go through the backend per the AI service
 * architecture decision (.claude/orchestrator/ai-service-architecture-decision.md).
 *
 * Endpoints:
 *  POST /ai/chat   — org-scoped RAG Q&A (AiChatQuery)
 *  POST /ai/extract — invoice field extraction
 *
 * All calls go through the shared axios instance from lib/api.ts.
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ── Schemas ──────────────────────────────────────────────────────────────────

export const AiChatResponseSchema = z.object({
  answer: z.string(),
  sourceChunkCount: z.number(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number(),
})
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>

export const AiDraftResponseSchema = z.object({
  answer: z.string(),
  sourceChunkCount: z.number(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number(),
})
export type AiDraftResponse = z.infer<typeof AiDraftResponseSchema>

// Canned/quick-reply template — managed locally (no backend required for Phase 1)
// A backend /ai/templates endpoint can supersede this in a future phase.
export const CannedTemplateSchema = z.object({
  id: z.string(),
  label: z.string(),
  body: z.string(),
  category: z.string().optional(),
})
export type CannedTemplate = z.infer<typeof CannedTemplateSchema>

// ── Request params ────────────────────────────────────────────────────────────

export interface AiChatParams {
  /** User's question. Max 2000 chars. */
  message: string
  /** Optional session ID for conversation continuity (P7b). */
  sessionId?: string
  /** BCP-47 locale tag — drives Sarvam AI for Indic languages. Defaults to 'en'. */
  locale?: string
  /** Number of context chunks to retrieve (1-10, default 5). */
  topK?: number
}

export interface AiDraftParams {
  /** Conversation context: last N message bodies joined as a prompt. */
  conversationContext: string
  /** BCP-47 locale, passed as Accept-Language. */
  locale?: string
}

// ── Default quick-reply templates (CA-facing) ─────────────────────────────────
//
// These are seeded defaults shown as chip suggestions in the composer.
// They are intentionally short and editable before send.
// A future phase can fetch org-customised templates from the backend.

export const DEFAULT_QUICK_REPLIES: CannedTemplate[] = [
  { id: 'qr-gstr3b-ready', label: 'GSTR-3B ready', body: 'Your GSTR-3B is ready for review. Please check and confirm.' },
  { id: 'qr-docs-needed', label: 'Docs needed', body: 'We need Form 16 to complete your ITR filing. Please upload it at your earliest convenience.' },
  { id: 'qr-loan-docs', label: 'Loan docs ready', body: 'Your loan documents are ready for download. Please review and sign.' },
  { id: 'qr-gst-notice', label: 'GST notice', body: 'We have received a GST notice on your behalf. Our team is reviewing it and will respond within 2 working days.' },
  { id: 'qr-tax-query', label: 'Tax query', body: 'Thank you for your tax query. We will get back to you with a detailed response shortly.' },
]

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * POST /ai/chat
 *
 * Org-scoped RAG Q&A. The backend derives org_id from the JWT claim (SEC-AI-02)
 * so no org parameter is sent from the client.
 *
 * [MOCK-DEFAULT] The backend returns a deterministic mock answer in local/CI
 * when no real AI provider is configured.
 */
export async function postAiChat(params: AiChatParams): Promise<AiChatResponse> {
  const res = await api.post(
    '/ai/chat',
    {
      message: params.message,
      sessionId: params.sessionId ?? null,
      locale: params.locale ?? 'en',
      topK: params.topK ?? 5,
    },
    {
      headers: params.locale
        ? { 'Accept-Language': params.locale }
        : undefined,
    }
  )
  return AiChatResponseSchema.parse(res.data)
}

/**
 * POST /ai/chat — AI Draft mode
 *
 * Sends recent conversation context as the message so the backend can draft
 * a contextually relevant CA reply. The CA reviews, edits, and sends the
 * suggestion — it is never auto-sent.
 *
 * The "draft" framing is a prompt-engineering concern: we prefix the context
 * with a CA-facing system hint. The backend endpoint is the same /ai/chat.
 */
export async function generateAiDraft(params: AiDraftParams): Promise<AiDraftResponse> {
  const draftMessage = [
    'You are a helpful CA assistant. Based on the following customer conversation, draft a professional reply on behalf of the CA. Be concise, accurate, and use plain language.',
    '',
    'Conversation so far:',
    params.conversationContext,
    '',
    'Draft a reply:',
  ].join('\n')

  const res = await api.post(
    '/ai/chat',
    {
      message: draftMessage,
      sessionId: null,
      locale: params.locale ?? 'en',
      topK: 3,
    },
    {
      headers: params.locale
        ? { 'Accept-Language': params.locale }
        : undefined,
    }
  )
  return AiDraftResponseSchema.parse(res.data)
}
