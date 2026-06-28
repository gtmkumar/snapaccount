---
name: dg-chat-07-ai-draft
description: DG-CHAT-07 implementation: AI Draft + canned replies in admin chat; firebase-ai.ts tombstoned
metadata:
  type: project
---

DG-CHAT-07 is DONE (2026-06-28, branch feature/repository-refactor).

**What was implemented:**
1. `src/admin/src/lib/aiApi.ts` (NEW) — server-side AI client:
   - `postAiChat()` → POST /ai/chat (org-scoped RAG Q&A)
   - `generateAiDraft()` → POST /ai/chat with CA-facing system prompt prefix
   - `DEFAULT_QUICK_REPLIES` — 5 seeded CannedTemplate objects (label + body)
   - Full Zod validation of AiChatResponseSchema
   - Locale passed as Accept-Language header (Indic routing)

2. `src/admin/src/pages/chat/ChatThreadDetailPage.tsx` (UPDATED) — composer additions:
   - Quick-reply chip row (all 5 templates shown, click populates textarea)
   - "/" key detection opens canned-response overlay with live filter
   - AI Draft button (Sparkles icon, violet) → calls generateAiDraft() with last 6 messages as context
   - AI suggestion banner (violet, Sparkles icon) with Accept/Discard actions
   - Accept copies draft to textarea (CA edits/sends); never auto-sends

3. `src/admin/src/lib/firebase-ai.ts` (TOMBSTONED) — replaced with empty `export {}` + tombstone comment explaining the removal per architecture decision

4. i18n keys added to en.json + hi.json + bn.json (parity maintained):
   - `chat.aiDraft.button/suggestion/accept/discard/error`
   - `chat.quickReply.aria`
   - `chat.canned.overlayAria/hint/noResults/slashHint`

**Why:** firebase-ai.ts was dead client-side Gemini that bypassed the server-side RAG pipeline (no PII redaction, no per-org token budget, no RLS). Architecture decision mandates all AI via /ai endpoints.

**How to apply:** If adding more AI tools to admin chat, extend aiApi.ts (not firebase-ai.ts). The canned templates are seeded defaults; a future phase can fetch org-customised templates from a backend endpoint.

**Build verification:** `npm run build` (tsc -b + vite build) passes clean (zero TS errors).
