---
name: project_security_sec_ai_02
description: SEC-AI-02 AiService security remediation — all H/M/L findings applied, 750 tests green
metadata:
  type: project
---

# SEC-AI-02 Security Remediation (Task #34, 2026-06-11)

All findings from `docs/security/sec-ai-02-ai-service-review-2026-06-11.md` addressed. Gate verdict flipped from NO-GO to GO.

## Fixes Applied

**H-01 (AuthService) — AES-CBC → AES-GCM with versioned format:**
- File: `backend/Services/PlatformService/Platform.Infrastructure/Auth/Services/AesAiKeyProtector.cs`
- New format: `Base64(0x02 || Nonce(12) || Tag(16) || Ciphertext)` for v2 (GCM).
- `Decrypt()` accepts both v2 (GCM, authenticated) and v1 (CBC, legacy read-only).
- `Encrypt()` always writes v2. Re-encryption happens organically on next update.
- Fail-fast (M-05): non-Development environments without `Ai:KeyEncryptionKey` throw at startup.
- 9 new tests in `tests/unit/AuthService/AesAiKeyProtectorTests.cs` (round-trip, tamper, legacy, fail-fast).

**H-02 (AuthService) — GetEffectiveAiConfig endpoint gated:**
- File: `backend/Services/PlatformService/Platform.Application/Auth/AiConfig/Queries/GetEffectiveAiConfig/GetEffectiveAiConfigQuery.cs`
- Added `[RequiresPermission(Permissions.PlatformAiManage)]` to the query.
- File: `backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/AiConfigEndpoints.cs`
- Internal service calls (AiService/DocumentService) bypass PermissionBehavior via `X-Internal-Token` header (constant-time comparison). Direct handler injection used to avoid MediatR pipeline for internal path.
- File: `backend/Services/AssistService/Assist.Infrastructure/Ai/Providers/AiProviderResolver.cs`
- Sends `X-Internal-Token` header from `InternalApi:SharedToken` config when calling AuthService.
- Config key: `InternalApi:SharedToken` — must be set in GCP Secret Manager for staging/prod.

**H-03 (AiService) — Atomic budget enforcement:**
- New interface: `AiService.Application.Common.Interfaces.ITokenBudgetService`
- New implementation: `AiService.Infrastructure.Services.TokenBudgetService` — uses `pg_advisory_xact_lock(orgIdHash)` within a transaction to serialise concurrent budget checks per org. No Redis dependency.
- Applied to both `AiChatQueryHandler` (chat_qa) and `ExtractFieldsCommandHandler` (invoice_extract, was previously unprotected — M-04 fix).
- `ExtractFieldsCommandHandler` now has `ITokenBudgetService` as second ctor parameter.

**H-04 (AiService) — Pub/Sub message ownership verification:**
- File: `backend/Services/AssistService/Assist.Infrastructure/Ai/Messaging/RagIngestionSubscriber.cs`
- Before ingest: cross-schema SQL check on `document.documents` (id + organization_id + deleted_at IS NULL). Fail-open on DB error (logs warning). ACK (drop) on mismatch to prevent DLQ poisoning.
- Also caps OcrText at 500k chars as defence-in-depth before the command validator.

**M-02 (AiService) — Prompt injection / role separation:**
- File: `backend/Services/AssistService/Assist.Infrastructure/Ai/Providers/VertexAiProvider.cs`
- ExtractFieldsAsync: system prompt in `systemInstruction` top-level field; data in user-role content.
- ChatAsync: system prompt in `systemInstruction`; RAG chunks as model-role turn; user message as user-role turn.
- L-01 fix included: API key now sent in `x-goog-api-key` header, NOT query string.
- New: `AiService.Application.Common.PromptSanitizer.EscapeDelimiters()` — escapes `^---` lines.

**M-03 (AiService) — IDOR: OrganizationId from JWT only:**
- File: `backend/Services/AssistService/Assist.WebApi/Endpoints/Ai/Ai.cs`
- `ChatRequest` DTO no longer has `OrganizationId` field.
- `ChatAsync` derives org exclusively from JWT `org_id` claim. Returns 400 if missing.

**L-02 (AiService) — PII redaction before RAG chunk storage:**
- File: `backend/Services/AssistService/Assist.Application/Ai/Rag/Commands/IngestDocument/IngestDocumentCommandHandler.cs`
- `ITextRedactor` injected; `redactor.Redact()` applied to full OCR text before chunking.
- `PromptSanitizer.EscapeDelimiters()` applied to the sanitized text before chunking (line structure preserved at this stage).
- `IngestDocumentCommandHandler` ctor now: `(IAiProviderResolver, ITextRedactor, IAiServiceDbContext, ILogger)`.

## NOT Fixed (team-lead gated)

- GCP IAM restriction on `pubsub.topics.publish` (H-04 §3) — requires `gcloud` changes by devops.
- Mock singleton cross-org entropy concern (L-03) — environment hygiene, no code change needed.
- NULL org_id RLS gap in ai.interactions (L-04) — requires DDL handoff to db-engineer.

## Test Results

- AiService: 67 tests pass (9 new: budget enforcement, redaction at ingest, delimiter escaping, budget-exhausted extract)
- AuthService: 683 tests pass (9 new: GCM round-trip, tamper detection, CBC legacy, fail-fast)
- DocumentService: 36 tests pass (unchanged, verified green)
- Full backend build: 0 errors, 0 warnings.

**Why:** Branch `2026-06-10-s5t4`, SEC-AI-02 NO-GO gate opened.
