---
name: phase7-tasks-5-14-15
description: Phase 7 tasks #5 (MCA edit-log), #14 (IT Act 2025 version awareness), #15 (chat idempotency) — migration 071-073 dependencies
metadata:
  type: project
---

# Phase 7 Tasks #5, #14, #15 — Build complete 2026-06-11

## Task #5 — MCA Edit-Log (AccountingService)

**Why:** MCA Companies (Accounts) Rules 2014 Rule 3(5)/(6) requires a statutory audit trail for books-of-account changes. Migration 071 (db-engineer) added `accounting.edit_log` table + DB AFTER trigger.

**What was built:**
- `EditLog` entity (Domain, extends `BaseEntity` NOT `BaseAuditableEntity` — append-only table)
- `EditLogConfiguration.cs` (EF mapping, no `Ignore()` calls since `BaseEntity` has no UpdatedAt/DeletedAt)
- `McaEditLogGucInterceptor` (SaveChangesInterceptor): `SET LOCAL app.current_user_id` on every write transaction; try/catch so GUC failure never blocks writes; returns empty string for background jobs
- `GetEditLogQuery` + handler + validator: `[RequiresPermission("accounting.editlog.read")]`, org-scoped, FyYear/entityType filters, pagination
- `ExportEditLogQuery` + handler: streams full-FY CSV; `ExportEditLogResult(string Csv, string FileName)`
- Two API routes: `GET /accounting/edit-log` and `GET /accounting/edit-log/export`
- 33 unit tests in `EditLogTests.cs` using `EditLogFakeDbContext` (fake in-memory DbContext that implements `IAccountingDbContext`)
- **AccountingService.Tests.csproj:** references Domain + Application only (NOT Infrastructure) — uses fake DbContext in test file

**Permission seeding needed:**
```sql
INSERT INTO auth.permissions (code, description)
VALUES ('accounting.editlog.read', 'View MCA statutory edit log (GAP-100).')
ON CONFLICT (code) DO NOTHING;
```

**DDL:** None from application — migration 071 (db-engineer) owns the table and trigger.

## Task #14 — IT Act 2025 Version Awareness (ItrService)

**Why:** GAP-102 — IT Act 2025 replaces IT Act 1961 from AY2026-27 onward. Tax slabs and deduction sections must be act-version-aware.

**What was built:**
- `TaxSlabVersion.ActVersion` (string, required, default "IT_ACT_1961") + `TaxYear` (nullable) properties
- `DeductionSection.ActVersion` + `TaxYear` properties
- `TaxSlabVersionConfiguration.cs` + `DeductionSectionConfiguration.cs`: act_version + tax_year column mappings + composite indexes
- `GetTaxSlabsQueryHandler.ResolveTargetActVersion(string ay)` — `public static` method; lexicographic compare vs "AY2026-27"; threshold for IT_ACT_2025
- `GetDeductionCatalogQueryHandler.ResolveTargetActVersion(string ay)` — same rule, `public static`
- Fallback: if IT_ACT_2025 rows not seeded, logs warning + falls back to IT_ACT_1961 (no error surfaced to caller)
- `TaxSlabsDto.ActVersion` + `TaxYear` in response
- `DeductionCatalogDto.ActVersion` + `DeductionSectionDto.ActVersion` in response
- `TaxComputationEngine` updated: primary ctor now takes `ILogger<TaxComputationEngine>`; uses same resolution rule
- 13 new unit tests in `ActVersionResolutionTests.cs`
- **TaxComputationGoldenFileTests.cs**: `MakeSlabVersion` helper updated to accept `actVersion` param (default "IT_ACT_1961") and set it via reflection — required because InMemory EF enforces required columns

**Key insight:** `ResolveTargetActVersion` is `public static` (was `internal static`) so tests can call it without handler instantiation.

## Task #15 — ChatService SendMessage Idempotency

**Why:** Mobile clients need to deduplicate messages sent while offline. Migration 057 added `chat.messages.client_message_id VARCHAR(128)` + unique partial index.

**What was found:** Idempotency was already fully implemented in `SendMessageCommandHandler` (checks existing message by `(threadId, clientMessageId)`) and `SendMessageRequest` already accepted `ClientMessageId`. The unique partial index was already declared in `ChatMessageConfiguration.cs`.

**What was added:** 9 unit tests in `SendMessageIdempotencyTests.cs` covering:
- Duplicate send returns same messageId
- No duplicate row created
- Null clientMessageId creates new message each time
- Empty clientMessageId treated same as null
- Different clientMessageIds create distinct messages
- Idempotent response echoes clientMessageId
- Validator accepts up to 128 chars
- Validator rejects 129 chars
- Command carries ClientMessageId through to response

**ChatService.Tests.csproj changes:**
- Added `Microsoft.EntityFrameworkCore.InMemory` package
- Added `ChatService.Infrastructure` project reference (tests use `ChatServiceDbContext` directly)

**DDL:** Unique partial index `uq_messages_thread_client_msg_id` already exists (migration 057, ChatMessageConfiguration.cs). No new DDL.

## Post-ship Regression Fix (2026-06-11)

**Root cause:** `TaxSlabVersionConfiguration` had no `HasColumnName` for `CessRatePct` — EF convention produced `cess_rate_pct` but live column is `cess_pct`. Also found: `Rebate87AIncomeLimit` → `rebate_under_87a`, `Rebate87AMaxAmount` → `rebate_under_87a_amount`, `EffectiveUntil` → `effective_to`.

**DeductionSection entity was built against assumed schema; live schema differs entirely:**
- `SectionCode` → column `section` (not `section_code`)
- `MaxLimit` → column `max_amount` (not `max_limit`)
- `IsAvailable` → column `is_available` (was `IsActive` in entity, wrong name)
- No `Name` column; no `AvailableInNewRegime`/`AvailableInOldRegime` columns — live uses a single `regime` string (OLD|NEW|BOTH)
- Entity rewritten: added `Regime` string property; replaced `IsActive` + `AvailableIn*` with `IsAvailable`; removed `Name`
- Handler `QueryDeductions` updated: `d.Regime == request.Regime || d.Regime == "BOTH"` replaces the `AvailableIn*` flag filters
- DTO `DeductionSectionDto` updated: `Regime` replaces `Name`; `AvailableInNewRegime`/`AvailableInOldRegime` are now derived booleans from `Regime`

**EfSmoke gap:** `AnyAsync()` doesn't project columns — `SELECT 1 FROM ... LIMIT 1` misses wrong column names. Fixed: upgraded `TaxSlabVersions` and `DeductionSections` smoke tests to use `FirstOrDefaultAsync()` with explicit `Select` projection of all mapped properties.

**Final state after regression fix:** EfSmoke 14/14, full ItrService 80/80.

**Rule to remember:** Always use `FirstOrDefaultAsync()` with a full `Select` projection in EfSmoke tests — `AnyAsync()` is a false safety net for column mapping errors.

## Test Counts (final after regression fix)

| Suite | Before | After |
|-------|--------|-------|
| AccountingService.Tests | 7 | 40 (+33) |
| ItrService.Tests | 61 | 80 (+19, includes EfSmoke 14/14) |
| ChatService.Tests | 37 | 46 (+9) |
| **Total added** | | **+61** |

Build status: 0 errors, 0 warnings on AccountingService.Api, ItrService.Api, ChatService.Api.

**How to apply:** When working on AccountingService edit-log, remember the fake DbContext pattern — unit tests for read-only queries work better with a local fake than pulling in Infrastructure + Npgsql. The `ResolveTargetActVersion public static` pattern is the right way to expose shared resolution logic for testability. Always verify entity property→column mappings against live `\d schema.table` output before shipping, especially for properties whose C# names don't map obviously to snake_case (e.g. `CessRatePct` → `cess_rate_pct` not `cess_pct`).
