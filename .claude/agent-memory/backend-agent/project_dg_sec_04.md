---
name: dg-sec-04-dpdp-data-export
description: DG-SEC-04 DPDP data-export extended to include cross-schema personal data from all modules and real GCS upload
type: project
---

## DG-SEC-04: DPDP Data Export — Full Cross-Schema Bundle + Real GCS Upload

**Status:** DONE — build: 0 errors, 24 warnings (all pre-existing NU1902/NU1903 MessagePack advisories).

### What Was Wrong
The `DataExportJob` (HangfireDataExportScheduler.cs) only read from the `auth` schema (Users, UserProfiles, UserConsents, DataCorrectionRequests). Financial data held by document/gst/loan/itr/accounting/chat/callback schemas was never included. The GCS upload was a fabricated placeholder path — JSON was never persisted anywhere.

### Fix Pattern

**Key architectural constraint:** `Platform.Infrastructure` cannot reference Finance/Assist DbContext types (separate projects, no cross-project ref). Solution: raw Npgsql queries across schemas (all composites share a single PostgreSQL DB).

**New files:**
1. `Platform.Application/Auth/Interfaces/IDpdpDataAggregator.cs` — interface + value-object records (DpdpCrossSchemaBundle, DpdpDocumentRow, DpdpGstReturnRow, DpdpLoanRow, DpdpItrFilingRow, DpdpJournalEntryRow, DpdpChatThreadRow, DpdpCallbackRow)
2. `Platform.Application/Auth/Interfaces/IDataExportStorageService.cs` — interface for GCS upload + signed URL
3. `Platform.Infrastructure/Auth/Services/NpgsqlDpdpDataAggregator.cs` — 7 raw Npgsql queries across schemas
4. `Platform.Infrastructure/Auth/Services/GcsDataExportStorageService.cs` — real GCS upload via StorageClient + UrlSigner; dev fallback to local temp dir
5. `Platform.Infrastructure/Auth/Services/HangfireDataExportScheduler.cs` — updated to inject both new services; assembles full bundle; ExportVersion "2.0"

**DI registered in:** `Platform.Infrastructure/Auth/DependencyInjection.cs`

**Project file change:** Added `<PackageReference Include="Google.Cloud.Storage.V1" Version="4.*" />` to `Platform.Infrastructure.csproj` (was only transitive before).

### Critical SQL Column Names (verified against migrations)
- `gst.gst_return` (singular) — columns: `financial_year`, `period_month` (no `tax_period`)
- `loan.loan_application` (singular) — `user_id` directly on the table; `requested_amount`, `purpose`
- `itr.filings` — `user_id` directly; assessment year column is `ay` (not `assessment_year`)
- `accounting.journal_entry` — `total_debit` (not `amount`), `notes` (not `narration`)
- `auth.organization_member` (singular) — join condition: `is_active = TRUE AND deleted_at IS NULL`
- `chat.threads` (plural, migration 029) — `user_id`, `subject`, `status`; messages in `chat.messages`
- `callback.callbacks` — `scheduled_at` is `TSTZRANGE`; extract via `LOWER(scheduled_at)::TEXT`

### GCS Config
- Primary bucket key: `GCS:DpdpExportsBucket`
- Fallback bucket key: `GCS:DocumentsBucket` (single-bucket dev convenience)
- Dev fallback: `{tempdir}/snapaccount-dpdp-exports/{objectName}` + `file://` URI

**Why:** DPDP Act 2023 right to data portability requires ALL personal data held by the fiduciary, not just auth metadata.

**How to apply:** When adding new modules that hold user PII, extend NpgsqlDpdpDataAggregator with an additional ReadXxxAsync method and add the new list to DpdpCrossSchemaBundle.
