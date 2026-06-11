---
name: project-phase7a-aiservice
description: AiService P7a implementation — GAP-030 complete. Extraction, RAG ingestion, chat Q&A, MockAiProvider. 61 tests passing.
metadata:
  type: project
---

AiService P7a implemented (2026-06-11): GAP-030 no longer 100% 501-stubs.

**What was built:**
- POST /ai/extract — invoice field extraction with provider/model resolution from admin config (feature override aware); PII redaction before any provider call (SEC-AI-01); MockAiProvider default; VertexAiProvider wired for production.
- POST /ai/chat — org-scoped RAG Q&A; Sarvam routing for Indic locales (hi, ta, te, kn, ml, mr, bn, gu, pa, or, as); daily token budget guard (100k tokens/org/day, local ledger); graceful degradation when no embeddings.
- RAG ingestion worker (RagIngestionSubscriber): subscribes to snapaccount.document.ocr.completed via `ai-service-rag-sub` (separate from accounting-service-ocr-sub); chunks (512 target, 64 overlap); embeds; upserts ai.chunks + ai.embeddings; idempotent.
- MockAiProvider: deterministic, GCP-free, same pattern as MockRazorpayClient/MockGstnApiClient. Returns plausible invoice fields + 768-dim unit-normalised vector.
- TextRedactor: PAN (XXXXX9999X), Aadhaar (12-digit), card (16-digit) redaction before LLM calls.
- MockSarvamAiService: pass-through when Sarvam API key not configured.

**Stubs remaining (P7b):**
- POST /ai/chat/{sessionId}/message — session continuation
- POST /ai/documents/{documentId}/embed — on-demand re-embed
- POST /ai/search — standalone semantic search
- POST /ai/tax-advice — GST notice reply draft (GAP-108)

**DDL handoff to db-engineer:**
- ai.chunks table (see task report for full DDL)
- ai.embeddings table — P7a stores float4[] (EF Core compat); REAL target is vector(768) + HNSW index
- ai.interactions table — audit log

**Key architecture decisions:**
- MockAiProvider is the default in DI; real VertexAiProvider activated by admin config at /auth/config/ai/effective
- AiProviderResolver: fetches config from AuthService, falls back to mock on any error
- Pub/Sub subscription name: ai-service-rag-sub (must be created by db-engineer/devops-engineer)
- RAG payload must include ocrText field — DocumentService Pub/Sub payload change needed (db-engineer handoff)
- Daily token budget: local ledger in ai.interactions; P7b integrate SubscriptionService RecordUsageCommand

**Why:** AccountingService had a concurrent build failure (EditLog namespace ambiguity) in its IAccountingDbContext.cs — not my code, not my ownership. AiService builds cleanly standalone (0 errors 0 warnings). 61 unit tests pass.
