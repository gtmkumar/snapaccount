---
name: project-phase7-wave4-tasks31-32
description: Phase 7 Wave 4 — Board tasks #31/#32: IMS deemed-acceptance job, EfSmoke expansion, OcrText payload, Vertex region config, docs fix. 1073 unit + 41 EfSmoke tests green.
metadata:
  type: project
---

# Phase 7 Wave 4 — Tasks #31 / #32 (2026-06-11)

Branch: `2026-06-10-s5t4`, base commit: `87e9ca6`

## Task 1 — Hangfire IMS Deemed-Acceptance Job

**What**: Monthly Hangfire recurring job that auto-accepts IMS invoices still PENDING/PENDING_KEPT for the prior GST return period, matching the GSTN rule that deemed acceptance occurs when GSTR-2B is generated (around the 14th).

**Key files**:
- `backend/Services/FinanceService/Finance.Infrastructure/Gst/Jobs/ImsDeemedAcceptanceJob.cs` — new job class
- `backend/Services/FinanceService/Finance.WebApi/Program.cs` — Hangfire registration + cron `"30 20 13 * *"` (13th 20:30 UTC = 14th 02:00 IST)

**Important design decisions**:
- Cron fires on the 13th at 20:30 UTC to execute the job before GSTR-2B generation on 14th IST
- Job dispatches `ApplyDeemedAcceptanceCommand` per distinct org (not per invoice) — the command handles all pending invoices for that org in the period
- `IServiceScopeFactory` pattern for scoped DI inside Hangfire job
- Period format: `"MMYYYY"` (e.g., "052025" for May 2025) — prior month via `today.AddMonths(-1)`
- DEEMED_ACCEPTED is the `action` in `ims_action_logs`, NOT a status in `ims_invoices` — the domain method sets Status="ACCEPTED" and DeemedAccepted=true
- No migration 077 needed — no DB schema changes (ImsInvoice.Status column is VARCHAR without CHECK constraint)

**Tests**: `tests/unit/GstService/ImsDeemedAcceptanceJobTests.cs` — 6 unit tests:
1. Dispatches `ApplyDeemedAcceptanceCommand` per distinct org
2. No-op when no pending invoices
3. Skips current period (targets prior month only)
4. PENDING_KEPT status included
5. Continues after one org failure (resilient)
6. ACCEPTED invoices excluded

## Task 2 — EfSmoke Tests Un-Skipped

**GstService EfSmoke** (`tests/unit/GstService/EfModelSmokeTests.cs`): 10 tests (7 existing fixed + 3 new IMS tests)
- Added NpgsqlEntityFrameworkCorePostgreSQL package to GstService.Tests.csproj
- Fixed property name bugs: `GstReturn.Period` → `.FinancialYear`; `ItcMismatch.Period` → `.MismatchType`; `ItcRecord.Period` → `.SupplierGstin`
- `ImsActionLog` inherits `BaseEntity` not `BaseAuditableEntity` — `CreatedAt` is DB-managed (via trigger), NOT an EF-mapped property; excluded from smoke test projection
- 3 new tests: `ImsInvoices`, `ImsActionLogs`, `Gstr1aAmendments` (migration 074)

**AiService EfSmoke** (`tests/unit/AiService/EfModelSmokeTests.cs`): 3 new tests
- Added NpgsqlEntityFrameworkCorePostgreSQL package to AiService.Tests.csproj
- Tests: `AiChunks`, `AiEmbeddings` (uses `float[]` for pgvector — migration P7a uses float4[] column), `AiInteractions`
- All use full SELECT projections (house rule: never AnyAsync)

**House rule enforced**: Full `Select(...).ToListAsync()` projections only — `AnyAsync()` emits `SELECT 1` which does not materialize columns and misses EF↔DB mapping errors.

## Task 3 — OcrText in OcrCompletedAccountingPayload

**Problem**: `RagIngestionSubscriber` (AiService) had to re-fetch OCR text from DocumentService when it received the Pub/Sub event. Added `OcrText` to the payload at the emit point.

**Changes**:
- `DocumentService.Application/Documents/Interfaces/IDocumentEventPublisher.cs` — added `string? ocrText = null` parameter
- `DocumentService.Infrastructure/Services/DocumentEventPublisher.cs` — passes `OcrText` to payload constructor
- `DocumentService.Application/Documents/Commands/ApproveDocument/ApproveDocumentCommand.cs` — `ExtractOcrTextAsync` private helper fetches latest `ocr_result.raw_response`, parses JSON looking for `"text"`, `"rawText"`, `"full_text"`, `"content"` keys

**Backward compatibility**: `OcrCompletedAccountingPayload` with `OcrText = null` means AccountingService (deserializing `OcrCompletedPayload`) silently ignores the new field — pure additive change.

**Unit test pattern**: `ExtractOcrTextAsync` wraps `FirstOrDefaultAsync()` in `catch (InvalidOperationException)` — mock IQueryable providers can't handle async scalar projections; returns null (valid fallback path). Production EF works correctly.

## Task 4 — Vertex AI Region Configurable (DPDP Data Residency)

**What**: DPDP Act 2023 requires Indian user data to be processed in India. Vertex AI region must default to `asia-south1` (Mumbai), not `us-central1`.

**Files**:
- `backend/Services/AssistService/Assist.Infrastructure/Ai/Providers/VertexAiProvider.cs` — `region` constructor parameter + `Region` property
- `backend/Services/AssistService/Assist.Infrastructure/Ai/Providers/AiProviderResolver.cs` — reads `VERTEX_REGION` env var OR `Vertex:Region` appsettings (priority order: env > config > hardcoded default `"asia-south1"`)
- `backend/Services/AiService/Assist.WebApi/appsettings.json` — `"Vertex": { "Region": "asia-south1" }` added

**Config priority**: `configuration["VERTEX_REGION"] ?? configuration["Vertex:Region"] ?? "asia-south1"` — env var wins for GCP Cloud Run, appsettings serves as documented default.

## Task 5 — Docs Fix

`docs/api/endpoints.md` ~line 889: `GET /itr/deductions` → `GET /itr/deduction-catalog`

## Test Results Summary

- GstService unit: 102 tests (96 existing + 6 new IMS job tests)
- GstService EfSmoke: 10 tests (all green)
- AiService unit: 64 tests (61 existing + 3 new EfSmoke)
- AiService EfSmoke: 3 tests (all green)
- DocumentService unit: 36 tests (all green)
- Total unit suite: 1073 tests passing
- Total EfSmoke suite: 41 tests passing

**Why:** Tasks #31/#32 from board assigned by orchestrator on 2026-06-11.

**How to apply:** ImsActionLog.CreatedAt is NOT EF-mapped — always check BaseEntity vs BaseAuditableEntity inheritance before writing smoke test projections. Hangfire cron for 14th IST = `"30 20 13 * *"` UTC.
