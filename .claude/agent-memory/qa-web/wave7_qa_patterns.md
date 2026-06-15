---
name: wave7-qa-patterns
description: Wave 7 live QA patterns — enum deserialization bug class, notification_log constraint, report table mismatches, validator bypass for chat thread PDF
metadata:
  type: project
---

Wave 7 live QA run (2026-06-12). Report at `.claude/qa/wave7-live-qa-web-2026-06-12.md`.

**Why:** 6 bugs found across Wave 7 features. All report to orchestrator for backend-agent/frontend-dev fix.

## Bug class 1: String enum deserialization → 500

Affects: `NotificationChannel` (BUG-W7-01) and `GstNoticeFormType` (BUG-W7-03).

String PascalCase enum values (`"Push"`, `"DRC_01B"`) sent in JSON request bodies cause HTTP 500 in Minimal API endpoints. Integer values (0, 3) work correctly.

**Root cause:** .NET Minimal API `System.Text.Json` by default does not convert PascalCase strings to enums. `UpperSnakeEnumConverter` is EF-only. Need `JsonStringEnumConverter` in `JsonOptions` in `Program.cs` or `[JsonConverter]` on enum types.

**Fix pattern:** Add `options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter())` in `Program.cs` `AddProblemDetails` / `ConfigureHttpJsonOptions` block.

## Bug class 2: notification_log.notification_id NOT NULL (BUG-W7-02)

Test-send creates `NotificationLogEntry.Sent()` without setting `notification_id`. `notification.notification_log.notification_id` is NOT NULL. DB write fails → 500.

**Fix pattern:** Either make `notification_id` nullable in DB (preferred — audit log shouldn't require parent notification to exist for test-sends), or set a sentinel UUID for test entries.

## Bug class 3: Raw SQL table name mismatch in TallyExportGenerator (BUG-W7-04)

`TallyExportGenerator.cs` references `accounting.chart_of_accounts` and `accounting.journal_entries` but actual tables are `accounting.account` and `accounting.journal_entry`. Causes 500 on any Tally export attempt.

**Fix pattern:** Update raw SQL in `FetchLedgersAsync` and `FetchVouchersAsync` to use correct table names.

## Bug class 4: GenerateReportCommandValidator blocks ChatThreadPdf (BUG-W7-05)

`GenerateReportCommandValidator` applies FinancialYear max-length-10 + YYYY-YY pattern globally. `GenerateChatThreadPdf` encodes ThreadId (UUID, 36 chars) as FinancialYear. Validator → 422.

**Fix pattern:** Add `.When(x => x.ReportType != ReportType.ChatThreadPdf)` guard on FinancialYear validation rule.

## UI gap: Device Approval Admin Queue not implemented (BUG-W7-06)

Backend: `GET /auth/devices/pending-approvals`, `POST /auth/devices/{id}/approve`, `POST /auth/devices/{id}/deny` all exist (Wave 7B GAP-047).

Frontend: `devicesApi.ts` only has `getDevices()` + `revokeDevice()`. No admin queue page in router. Frontend-dev must add.

## Retest 2026-06-12 — All Fixed

All 7 issues (6 Wave 7 bugs + Wave 6 KFS Hindi locale) VERIFIED-FIXED in retest.
Vitest: 1092/1092 (58 files) — up from 1078 (14 DeviceApprovalQueue tests added by frontend-dev).

**Service port map (confirmed in retest):**
- AuthService: 5101
- LoanService: 5105
- ChatService: 5107
- NotificationService: 5108
- ReportService: 5109
- GstService: 5104

**Device approval same-device guard:** `DeviceApproval.SameDevice` error when reviewing device == new device — by design, not a bug.
**KFS is mobile-only:** No admin web KFS page exists or is needed. Backend `?locale=hi` → 201 with full schedule.
**i18n parity test:** i18nKeyParity.test.ts confirms all 3 locales (en/hi/bn) have identical key sets — catches raw key regressions automatically.

## How to apply

When testing Wave 8+ features:
- Always test both string and integer enum values in PATCH/POST bodies
- Check `notification_log.notification_id` constraint for any code that writes notification logs
- Verify raw SQL table names in any cross-schema generator against actual DB schema
- Check `GenerateReportCommandValidator` for any new ReportType that uses non-standard FinancialYear encoding
- Run i18nKeyParity test to catch locale translation gaps before filing i18n bugs
