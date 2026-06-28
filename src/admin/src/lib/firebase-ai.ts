/**
 * firebase-ai.ts — REMOVED (DG-CHAT-07)
 *
 * Client-side Gemini via Firebase AI was removed because it bypasses the
 * mandated server-side RAG pipeline (no PII redaction, no per-org token
 * budget, no RLS-scoped retrieval).
 *
 * Architecture decision:
 *   .claude/orchestrator/ai-service-architecture-decision.md
 *
 * All AI calls now route through the backend /ai endpoints via:
 *   src/admin/src/lib/aiApi.ts
 *
 * This file is intentionally empty. It may be deleted once no build tooling
 * references it by path.
 */

// No exports — do not import from this file.
export {}
