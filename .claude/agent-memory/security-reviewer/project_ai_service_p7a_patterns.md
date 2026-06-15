---
name: ai-service-p7a-patterns
description: Security patterns and findings from SEC-AI-02 AiService P7a review and re-verification (2026-06-11); high-severity defects and confirmed controls
metadata:
  type: project
---

SEC-AI-02 initial review completed 2026-06-11 on branch 2026-06-10-s5t4. Gate verdict: NO-GO.
Re-verification completed 2026-06-11. Gate verdict: NO-GO (RV-03 HIGH race not closed; RV-01/RV-02 new MEDIUM).

**Why:** Initial review found 4 HIGH findings. Re-verification confirmed 3 HIGH fixed but the advisory lock approach for H-03 is architecturally insufficient — the lock is released before the AI call and audit write, leaving the same TOCTOU window. Two new MEDIUM findings discovered during re-verification.

**How to apply:** Do not re-flag confirmed controls below. Re-flag RV-03 (race), RV-01 (timing), RV-02 (no fail-fast) if not fixed before P7b staging gate.

## Remaining HIGH findings requiring fix before staging

- RV-03 (was H-03): pg_advisory_xact_lock is released on commit of TryAcquireBudgetSlotAsync's own transaction, BEFORE the AI call (1–3 s). Concurrent Req2 can acquire the lock after Req1 releases it but before Req1 writes its audit row — sum still reads 0. Fix: reservation-row pattern (write placeholder interaction row before AI call) or session-scoped pg_advisory_lock. Files: TokenBudgetService.cs, AiChatQueryHandler.cs, ExtractFieldsCommandHandler.cs

## Confirmed FIXED in re-verification (do not re-flag)

- H-01: AesAiKeyProtector migrated to AES-256-GCM with versioned format (0x02||nonce||tag||ct). Legacy CBC read-only. Constructor throws in non-Development if key absent (M-05 also fixed). 9 new unit tests including tamper-detection test.
- H-02 (primary): [RequiresPermission(Permissions.PlatformAiManage)] added to GetEffectiveAiConfigQuery. X-Internal-Token bypass wired with CryptographicOperations.FixedTimeEquals. AiProviderResolver sends header. Endpoint correctly fail-closed when token unset.
- H-04 (application layer): RagIngestionSubscriber cross-schema ownership check via raw SQL on document.documents. ACK+warn on mismatch (not NACK — prevents DLQ poisoning). 500k char cap added. GCP IAM restriction is team-lead action.
- M-02: VertexAiProvider uses systemInstruction field + model-role context turn + user-role question. PromptSanitizer.EscapeDelimiters applied at ingest in IngestDocumentCommandHandler.
- M-03: OrganizationId removed from ChatRequest DTO. /ai/chat derives org exclusively from JWT claim with 400 if absent. ExtractRequest also clean (no body org).
- M-04: Budget enforcement added to ExtractFieldsCommandHandler (invoice_extract bucket, 100k tokens/day).
- L-01: API key moved to x-goog-api-key header in all three VertexAiProvider call sites (extract, chat, embed).
- L-02: ITextRedactor.Redact() called before chunking in IngestDocumentCommandHandler. Redacts PAN/Aadhaar/card from OCR text before storage in ai.chunks.

## New MEDIUM findings from re-verification

- RV-01: CryptographicEqual(a,b) wraps FixedTimeEquals(UTF8.GetBytes(a), UTF8.GetBytes(b)). When byte lengths differ, FixedTimeEquals returns immediately — not constant-time. Length of InternalApi:SharedToken is theoretically observable via timing. Fix: HMAC both values and compare 32-byte digests, or enforce fixed token length at startup.
- RV-02: InternalApi:SharedToken has no ValidateOrThrow startup guard in either AuthService or AiService Program.cs. If unset in production, AiProviderResolver silently degrades to mock. Fix: add startup InvalidOperationException in non-Development.

## Still open (not addressed in this remediation pass)

- M-01: TextRedactor Aadhaar pattern is over-broad (matches any 12 digits); phone numbers not redacted; sole-proprietor GSTIN indirectly exposes PAN.
- L-03: MockAiProvider uses text.GetHashCode() for deterministic embeddings — potential cross-org content similarity inference in shared staging environments.
- L-04: ai.interactions RLS policy — NULL organization_id rows are invisible to all users via RLS (NULL IN subquery = NULL). Admin interactions unauditable via standard read path.
- I-02: EffectiveAiConfigDto (AuthService) does not include EmbeddingModel field; AiProviderResolver's local record has EmbeddingModel but deserializes to null from AuthService JSON response. Admin-configured embedding model silently ignored.

## Confirmed controls (do not re-flag)

- SEC-AI-01 (TextRedactor): Redaction runs on user message in both /ai/extract and /ai/chat handlers BEFORE provider call. Pattern safe from ReDoS. Tests present.
- Rate limiting: All /ai/* endpoints have RequireRateLimiting("ai") — 20 req/min fixed window. Configured in Program.cs.
- Authorization: All live /ai/* endpoints have RequireAuthorization(). STUB endpoints (501 responses) also guarded.
- RLS migration 075: ai.chunks and ai.embeddings have RLS ENABLED with org-membership subquery policies (house style). ai.interactions has RLS + append-only triggers + REVOKE UPDATE/DELETE/TRUNCATE.
- Org isolation in EF queries: AiChatQueryHandler filters ai.embeddings and ai.chunks by organization_id at application layer (in addition to RLS).
- Provider key never returned by admin GET /auth/config/ai — only Last4 hint shown. GetAiConfigQuery confirmed safe.
- AiProviderResolver falls back to MockAiProvider if AuthService unreachable or no API key — no crash/exception exposure.
- CORS: Explicit WithOrigins() in AiService Program.cs — not AllowAnyOrigin().
- Secrets: Firebase:ServiceAccountJson empty in appsettings.json (correct). DB_PASSWORD uses placeholder pattern. SESSION_JWT_SECRET has ValidateOrThrow startup guard.
- ai.interactions is append-only: DB triggers reject UPDATE/DELETE/TRUNCATE. Immutability approach reuses accounting.edit_log (071) pattern.
- H-01 CBC downgrade: An attacker who can write to auth.ai_provider_keys.encrypted_key can craft a byte array starting with 0x02 (length >= 30) to route to GCM path — GCM throws CryptographicException on tag mismatch. CBC path only reachable for existing legacy ciphertexts whose first byte != 0x02. All new encryptions use GCM. DB write access = full compromise; threat model accepts this.
- H-02 fail-open analysis: When InternalApi:SharedToken is unset, isInternalCall=false, falls through to MediatR path which enforces [RequiresPermission]. Endpoint is fail-closed (not fail-open) for the decrypted-key concern — correct behavior.
