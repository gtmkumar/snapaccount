# AI Service Architecture Decision (NEW-D11 / unblocks GAP-030)

> Author: orchestrator · Date: 2026-06-11 · Status: **DECIDED** (team-lead may veto; backend-agent proceeds on this basis)

## Context

AiService is 100% 501-stubs (GAP-030). Implementation was blocked on three unmade choices: embedding model, LLM provider routing, and Sarvam AI's role. The platform already has: admin-configurable AI provider settings with encrypted keys + usage tracking (PR #31), pgvector with HNSW index, Google Document AI OCR + Tesseract fallback, and Semantic Kernel SDK in the stack definition.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Embedding model | **Vertex AI `text-embedding-005`** (via existing admin AI-config provider slot), dim 768, stored in pgvector HNSW | Same GCP billing/IAM surface as the rest of the stack; asia-south1 availability (DPDP/data-residency, GAP-107); 768-dim keeps HNSW index small. Provider-swappable via the existing encrypted AI-config table — no hardcoding. |
| 2 | Primary LLM | **Gemini (2.x flash for extraction/classification, pro for CA-grade drafting) via Vertex AI**, through the existing admin-config provider abstraction | Already a project decision (Decisions Log #7); per-feature model override table exists (migration 048). |
| 3 | Indic languages | **Sarvam AI for Indic-language chat + voice (STT/TTS)** only; Gemini remains default for en; routing key = user's locale + feature flag | Sarvam slot already exists in provider config (migration 048). Keeps the human-service chat experience native-language-first. |
| 4 | RAG pipeline | OCR text (existing Document pipeline) → chunk (per-section, 512-token target, overlap 64) → embed → `ai.embeddings` (pgvector) with org_id RLS → retrieval scoped by org_id + doc type | Schema-per-service isolation preserved; RLS mandatory (cross-org leak = DPDP breach). |
| 5 | Prompt-injection & data guardrails | All user content enters prompts as data blocks, never as instructions; PAN/Aadhaar/card fields redacted before any LLM payload (aligns GAP-107 rule); per-org daily token budget enforced by existing UsageRecord metering (B9) | security-reviewer flagged AI endpoints as high-risk surface. |
| 6 | Delivery order (P7a) | (1) `/ai/extract` invoice-field extraction behind existing multi-provider config, (2) RAG ingestion worker for approved documents, (3) `/ai/chat` org-scoped Q&A with retrieval, (4) GST notice reply-draft (GAP-108) last | Extraction has an existing consumer (document scanner); chat needs ingestion first. |
| 7 | Mock-first | `MockAiProvider` default in DI (same pattern as GSTN/Razorpay mocks); real providers activate via admin config + Secret Manager keys | Local dev + CI must run GCP-free (established pattern). |

## Non-goals (P7a)

Fine-tuning, agentic multi-step tax advice, voice in admin web, embeddings backfill for historical docs (separate backfill job once ingestion is stable).

## Handoffs

- **backend-agent**: implement P7a per above (task #9). DDL needs (ai.embeddings, ai.chunks) → db-engineer handoff section required.
- **security-reviewer**: review prompt assembly + redaction before any real-provider activation.
- **team-lead**: no new creds needed for mock-first start; Vertex enablement on the existing GCP project when activating.
