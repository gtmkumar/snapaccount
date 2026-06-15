---
name: project-wave7-bugfix-w7
description: Wave 7 live-QA backend bugfix batch — 5 HIGH bugs fixed across NotificationService, GstService, ReportService
metadata:
  type: project
---

Wave 7 live-QA (2026-06-12) found 5 HIGH backend bugs, all fixed in commit on branch `2026-06-10-s5t4`.

## BUG-W7-01 — NotificationService: string enum deserialization
- Root cause: `JsonStringEnumConverter` not registered in `Platform.WebApi/Program.cs`.
- Fix: `builder.Services.ConfigureHttpJsonOptions(opts => opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter()))`.
- Pattern: `UpperSnakeEnumConverter` in EF config is DB-only; has NO effect on API JSON binding.
- 16 new tests in `tests/unit/NotificationService/Wave7BugFixTests.cs`.

## BUG-W7-02 — NotificationService: notification_log.notification_id constraint (FULLY RESOLVED)
- Root cause: `notification_id` was NOT NULL (migration 008); test-send/celebration paths never set it; EF omitted the column → constraint violation.
- Migration 087 applied (2026-06-12): column is now NULLABLE.
- EF fix: shadow property is `Guid?` with NO `HasDefaultValue` in `NotificationLogEntryConfiguration.cs`.
  - `HasDefaultValue` MUST NOT be used: EF omits the column from INSERT when the value equals the configured default (does not write the sentinel). With `Guid?` and no default, EF writes NULL, which is correct.
  - A non-nullable `Guid` shadow property would throw when materialising rows where `notification_id IS NULL`.
- 18 new tests (up from original 16): includes two EF model-inspection tests that assert `ClrType == Guid?`, `IsNullable == true`, and `GetDefaultValue() == null` without hitting the DB.

## BUG-W7-03 — GstService: string enum deserialization (same class as W7-01)
- Root cause: `JsonStringEnumConverter` not registered in `Finance.WebApi/Program.cs`.
- Fix: same pattern as W7-01.
- Also covers `GstNoticeAppealStage` (same class of bug in `UpdateAppealStageRequest`).
- 19 new tests in `tests/unit/GstService/Wave7BugFixTests.cs`.

## BUG-W7-04 — ReportService: TallyExportGenerator wrong SQL table names
- Root cause: `TallyExportGenerator.cs` used `accounting.chart_of_accounts` / `accounting.journal_entries` / `accounting.journal_entry_lines` — none of which exist.
- Actual tables (migration 003, confirmed in SWEEP-FIX WEB-14 EF configs):
  - `accounting.account` (account_name column, not name)
  - `accounting.journal_entry` (singular)
  - `accounting.journal_entry_line` (singular; uses `debit_amount`/`credit_amount`, NOT `entry_type`)
- 14 new tests in `tests/unit/ReportService/Wave7BugFixTests.cs` pin the table names.

## BUG-W7-05 — ReportService: ChatThreadPdf validator rejects 36-char UUID
- Root cause: `GenerateReportCommandValidator` applied `MaximumLength(10)` + YYYY-YY regex to `FinancialYear` unconditionally. `GenerateChatThreadPdf` endpoint encodes a 36-char UUID thread ID into `FinancialYear`.
- Fix: `When(x => x.ReportType != ReportType.ChatThreadPdf)` guard on the FY rules. Added companion rule for ChatThreadPdf that validates `FinancialYear` as a valid GUID when non-null.

## Test counts (final, post-migration-087 follow-up)
- NotificationService: 109 total (18 new Wave7BugFix tests)
- GstService: 217 total (19 new)
- ReportService: 42 total (14 new)

**Why:** Live QA on Wave 7 build (commit dcf0d87). All fixed same session.
**How to apply:** When any service's API contract uses enum-bearing DTOs, always add `ConfigureHttpJsonOptions(JsonStringEnumConverter)` to that service's Program.cs — EF config converters do NOT flow through to JSON binding.
