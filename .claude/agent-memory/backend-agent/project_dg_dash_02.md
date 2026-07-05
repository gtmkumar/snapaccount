---
name: dg-dash-02-reports-list-envelope
description: DG-DASH-02 fix — ListReports returns envelope {items,totalCount} with correct status/format casing for admin ReportsPage
metadata:
  type: project
---

# DG-DASH-02 Admin ReportsPage report-jobs list contract fix

**What was broken:** Three contract mismatches caused the admin ReportsPage recent-jobs table to always render the ErrorBoundary fallback:
1. **Envelope**: `GET /reports/` returned a bare array; frontend `ReportJobsListSchema = z.object({ items, totalCount })` threw on parse.
2. **Status casing**: backend emitted PascalCase `Queued/Processing/Completed/Failed`; frontend `ReportStatusSchema = z.enum(['QUEUED','GENERATING','COMPLETE','FAILED'])` rejected all values.
3. **Format casing**: backend emitted `"PDF"` (uppercase); frontend `ReportFormatSchema = z.enum(['Pdf','Json'])` rejected it.

**Files changed:**
- `Finance.Application/Report/Reports/Queries/ListReports/ListReportsQuery.cs` — return type changed from `IReadOnlyList<ReportJobSummaryDto>` to new `ReportJobsListDto(Items, TotalCount)`; added `CountAsync` for totalCount; status mapped in LINQ Select with conditional expression (QUEUED/GENERATING/COMPLETE/FAILED); format changed from `"PDF"` to `"Pdf"`.
- `Finance.Application/Report/Reports/Queries/GetReport/GetReportQuery.cs` — same status/format mapping applied.
- `Finance.Application/Report/Reports/Commands/GenerateReport/GenerateReportCommand.cs` — `GenerateReportCommandHandler` status response mapped to frontend casing.

**Key mapping (C# enum → frontend enum):**
- `ReportJobStatus.Queued` → `"QUEUED"`
- `ReportJobStatus.Processing` → `"GENERATING"` (different name)
- `ReportJobStatus.Completed` → `"COMPLETE"` (truncated)
- `ReportJobStatus.Failed` → `"FAILED"`

**Build:** 0 errors, 22 warnings (pre-existing).

**No DDL change needed** — Format has no DB column (EF Ignored); status enum stored as UPPER_SNAKE in DB via `UpperSnakeEnumConverter`.

**Why:** and **How to apply:** When adding new report endpoints or query projections, always use the `QUEUED/GENERATING/COMPLETE/FAILED` vocabulary in string status fields. The DB stores `QUEUED/PROCESSING/COMPLETED/FAILED` — these are NOT the same as what the frontend expects for `Processing` and `Completed`.
