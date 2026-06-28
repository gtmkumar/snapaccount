---
name: dg-itr-02-06
description: DG-ITR-02..06 ITR cluster gap fixes — draft autosave, DTO timestamps, ca_notes, user_id, CA_REJECTED status
metadata:
  type: project
---

# DG-ITR-02..06 ITR Cluster Gap Fixes (2026-06-28)

All 5 gaps fully implemented in one pass. Migration 097. Build: 0 errors. 66 ITR unit tests green.

## Gaps Fixed

### DG-ITR-02 — PATCH /itr/filings/{id} draft autosave
- New: `UpdateFilingDraftCommand` + handler + validator
- New: `UpdateFilingDraftRequest` DTO in Itr.cs
- New: `MapPatch("/filings/{id:guid}", ...)` endpoint in Itr.cs
- New method: `Filing.UpdateDraft(salary?, houseProperty?, business?, capitalGains?, other?, caNotes?)` — allowed from DRAFT/CA_REJECTED/UNDER_CA_REVIEW
- Permission: `itr.filings.update`
- Returns `FilingDetailDto` (same shape as GetFiling)

### DG-ITR-03 — GetFiling/ListFilings missing timestamps + assessee info
- `FilingDetailDto` extended: `+CreatedAt DateTime, +UpdatedAt DateTime, +AssesseeName string?, +PanLast4 string?, +CaNotes string?`
- `FilingSummaryDto` extended: `+CreatedAt DateTime, +UpdatedAt DateTime`
- Both handlers project the new fields; GetFiling joins assessee for Name + PanLast4
- admin `FilingSchema.createdAt` + `updatedAt` are `z.string()` REQUIRED — these were hard parse-throws

### DG-ITR-04 — Dedicated ca_notes column (separate from ca_review_notes)
- Migration 097: `ALTER TABLE itr.filings ADD COLUMN IF NOT EXISTS ca_notes TEXT`
- `Filing` entity: new `CaNotes { get; private set; }` property
- `FilingConfiguration`: maps `CaNotes → ca_notes` column (NOT ca_review_notes which is CaRejectionReason)
- `Filing.UpdateDraft(...)` accepts and persists `caNotes`

### DG-ITR-05 — user_id NOT NULL: StartFiling never set it
- `Filing.Create(...)` signature extended: `+Guid userId` (5th param, required)
- `StartFilingCommandHandler` now injects `ICurrentUser` and passes `currentUser.UserId`
- Returns `Filing.MissingUser` validation error if `UserId == Guid.Empty`
- All test `Filing.Create` calls updated to pass `Guid.NewGuid()` as userId

### DG-ITR-06 — REJECTED_BY_CA → CA_REJECTED (DB CHECK constraint alignment)
- `Filing.RejectByCa(...)` now sets `Status = "CA_REJECTED"` (was "REJECTED_BY_CA")
- DB CHECK constraint in 024 already allows CA_REJECTED; no DDL change needed
- Admin `FilingStatusSchema` extended: added `CA_REJECTED`, `CA_APPROVED`, `CANCELLED`
- Test `FilingStateMachineTests` updated: expects `"CA_REJECTED"` not `"REJECTED_BY_CA"`

### DG-ITR-08 (bonus) — Stale builder.Ignore() calls removed
- `FilingConfiguration`: replaced 6 `builder.Ignore()` calls with real column mappings:
  - `ComputationHash → computation_hash VARCHAR(64)` (migration 066)
  - `SalaryIncome → salary_income NUMERIC(20,2)` (migration 066)
  - `HousePropertyIncome → house_property_income NUMERIC(20,2)` (migration 066)
  - `BusinessIncome → business_income NUMERIC(20,2)` (migration 066)
  - `CapitalGains → capital_gains NUMERIC(20,2)` (migration 066)
  - `OtherIncome → other_income NUMERIC(20,2)` (migration 066)

## Files Changed
- `database/migrations/097_itr_filing_draft_autosave.sql` (new)
- `Finance.Domain/Itr/Entities/Filing.cs`
- `Finance.Infrastructure/Itr/Persistence/Configurations/FilingConfiguration.cs`
- `Finance.Application/Itr/Filings/Commands/StartFiling/StartFilingCommand.cs`
- `Finance.Application/Itr/Filings/Commands/UpdateFilingDraft/UpdateFilingDraftCommand.cs` (new)
- `Finance.Application/Itr/Filings/Queries/GetFiling/GetFilingQuery.cs`
- `Finance.Application/Itr/Filings/Queries/ListFilings/ListFilingsQuery.cs`
- `Finance.WebApi/Endpoints/Itr/Itr.cs`
- `src/admin/src/lib/itrApi.ts` (FilingStatusSchema: added CA_REJECTED, CA_APPROVED, CANCELLED)
- `tests/unit/ItrService/FilingStateMachineTests.cs`
- `tests/unit/ItrService/FilingIdorTests.cs`
- `tests/unit/ItrService/FilingAdminListTests.cs`
- `tests/unit/ItrService/ItrDpdpErasureTests.cs`

**Why:** admin CA tax-computation panel was 404-ing on Save Draft, throwing on FilingSchema.parse (missing createdAt/updatedAt), and the CA reject status violated the DB CHECK constraint on every save.
**How to apply:** Pattern for future ITR PATCH endpoints: use `ICommand<FilingDetailDto>` so the panel gets back a full updated entity without a separate GET.
