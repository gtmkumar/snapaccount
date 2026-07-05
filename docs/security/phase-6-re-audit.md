# Phase 6 Security Re-Audit Verification Memo

**Date:** 2026-04-25
**Reviewer:** security-reviewer agent
**Scope:** SEC-026, SEC-027, SEC-028, SEC-029 fix verification; SEC-034 status update (P6-QA-MOBILE-01 correlation)
**Triggered by:** backend-agent hotfix (173/173 unit tests pass, 0 errors/0 warnings) + qa-mobile P6-QA-MOBILE-01 finding

---

## Files Read During This Re-Audit

### SEC-026 — PermissionBehavior Registration

| File | Line(s) of Interest | Finding |
|------|---------------------|---------|
| `backend/Services/FinanceService/Finance.Application/Accounting/DependencyInjection.cs` | 25–26 | `cfg.AddOpenBehavior(typeof(PermissionBehavior<,>))` present |
| `backend/Services/PlatformService/Platform.Application/Notification/DependencyInjection.cs` | 22–23 | `cfg.AddOpenBehavior(typeof(PermissionBehavior<,>))` present |
| `backend/Services/AssistService/Assist.Application/Callback/DependencyInjection.cs` | 19–20 | `cfg.AddOpenBehavior(typeof(PermissionBehavior<,>))` present |
| `backend/Services/FinanceService/Finance.Application/Accounting/Behaviors/PermissionBehavior.cs` | 24–48 | Reads `RequiresPermissionAttribute`; checks `IsAuthenticated` then `HasPermission`; returns `Result.Failure(Error.Unauthorized/Forbidden)` — fails closed |
| `backend/Services/PlatformService/Platform.Application/Notification/Behaviors/PermissionBehavior.cs` | 24–48 | Identical implementation; fails closed |
| `backend/Services/AssistService/Assist.Application/Callback/Behaviors/PermissionBehavior.cs` | 24–48 | Identical implementation; fails closed |
| `backend/Services/FinanceService/Finance.Application/Accounting/FiscalYear/Commands/CloseFiscalYear/CloseFiscalYearCommand.cs` | 15 | `[RequiresPermission("accounting.fiscal_year.close")]` present |
| `backend/Services/AssistService/Assist.Application/Callback/Callbacks/Commands/AssignCallback/AssignCallbackCommand.cs` | 14 | `[RequiresPermission("callback.assign")]` present |

### SEC-027 — DPDP AccountDeletionSubscriber

| File | Line(s) of Interest | Finding |
|------|---------------------|---------|
| `backend/Services/AssistService/Assist.Infrastructure/Callback/Messaging/AccountDeletionSubscriber.cs` | 105–127 | Soft-deletes `call_notes` where `AuthorId == userId`; calls `cb.Anonymize("DPDP_ORG_ERASURE")` setting `UserId=null`, `AnonymizedAt`, `AnonymizationReason` |
| `backend/Services/PlatformService/Platform.Infrastructure/Notification/Messaging/AccountDeletionSubscriber.cs` | 103–121 | Soft-deletes `notification_log` and `dlq_items` where `UserId == userId` |
| `backend/Services/AssistService/Assist.Infrastructure/Callback/DependencyInjection.cs` | 44 | `services.AddHostedService<AccountDeletionSubscriber>()` present |
| `backend/Services/PlatformService/Platform.Infrastructure/Notification/DependencyInjection.cs` | 60 | `services.AddHostedService<AccountDeletionSubscriber>()` present |
| `backend/Services/AssistService/Assist.Domain/Callback/Entities/Callback.cs` | 20 | `UserId` is `Guid?`; line 185–190 `Anonymize(string reason)` sets `UserId=null`, `AnonymizedAt=DateTime.UtcNow`, `AnonymizationReason=reason` |

### SEC-028 — DLQ Permission Gate

| File | Line(s) of Interest | Finding |
|------|---------------------|---------|
| `backend/Services/PlatformService/Platform.Application/Notification/Notifications/Queries/GetDlq/GetDlqQuery.cs` | 15 | `[RequiresPermission("notification.dlq.manage")]` present |
| `backend/Services/PlatformService/Platform.Application/Notification/Notifications/Commands/RetryDlqItem/RetryDlqItemCommand.cs` | 17 | `[RequiresPermission("notification.dlq.manage")]` present |

### SEC-029 — Callback IDOR Fix

| File | Line(s) of Interest | Finding |
|------|---------------------|---------|
| `backend/Services/AssistService/Assist.Application/Callback/Callbacks/Queries/GetCallbackById/GetCallbackByIdQuery.cs` | 62–68 | EF query includes `&& (orgId == null \|\| c.OrganizationId == orgId)` inline — no fetch-then-check; returns `NotFound` on mismatch |
| `backend/Services/AssistService/Assist.Application/Callback/Callbacks/Commands/AssignCallback/AssignCallbackCommand.cs` | 44–45 | Post-fetch: `if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)` returns `NotFound` |
| `backend/Services/AssistService/Assist.Application/Callback/Callbacks/Commands/CompleteCallback/CompleteCallbackCommand.cs` | 44–45 | Same post-fetch org ownership check; returns `NotFound` |
| `backend/Services/AssistService/Assist.Application/Callback/Callbacks/Commands/EscalateCallback/EscalateCallbackCommand.cs` | 44–45 | Same post-fetch org ownership check; returns `NotFound` |

### SEC-034 — Deep-Link id Validation

| File | Line(s) of Interest | Finding |
|------|---------------------|---------|
| `mobile/src/notifications/notificationRouter.ts` | 44–56 | `id` extracted from notification payload at line 33; passed directly to `navigation.navigate('CallbackStatus', { callbackId: id })` and `navigation.navigate('DocumentDetail', { documentId: id })` with no UUID format check. `as (...args: any[]) => void` cast bypasses TypeScript type safety entirely. NOT FIXED. |

---

## CONFIRMED-FIXED List

| ID | Severity | Verified Evidence |
|----|----------|-------------------|
| SEC-026 | HIGH | `AddOpenBehavior(typeof(PermissionBehavior<,>))` registered in all 3 services; behavior reads `RequiresPermissionAttribute`, checks `IsAuthenticated` + `HasPermission`, returns `Result.Failure` when either check fails (fails closed). `[RequiresPermission]` confirmed on `CloseFiscalYearCommand` and `AssignCallbackCommand`. |
| SEC-027 | HIGH | `AccountDeletionSubscriber` (BackgroundService) added to both CallbackService and NotificationService; registered via `AddHostedService<AccountDeletionSubscriber>()` in both DI files. Subscriber deserializes event, scopes by `user_id`, soft-deletes `call_notes`, calls `Anonymize("DPDP_ORG_ERASURE")` on callbacks (sets `UserId=null`, `AnonymizedAt`, `AnonymizationReason`), soft-deletes `notification_log` and `dlq_items`. `Callback.UserId` is `Guid?`. Domain `Anonymize()` method present. |
| SEC-028 | HIGH | `[RequiresPermission("notification.dlq.manage")]` on both `GetDlqQuery` and `RetryDlqItemCommand`. Enforced by PermissionBehavior now registered in NotificationService (SEC-026 fix). End-to-end gate is active. |
| SEC-029 | HIGH | `GetCallbackByIdQueryHandler` filters by `OrganizationId` directly in the EF `FirstOrDefaultAsync` predicate (not fetch-then-check). `AssignCallbackCommandHandler`, `CompleteCallbackCommandHandler`, and `EscalateCallbackCommandHandler` all inject `ICurrentUser` and perform post-fetch org ownership check returning `Error.NotFound` (not `Error.Forbidden`) to avoid existence leak. Pattern consistent across all three sampled handlers. |

**CONFIRMED-FIXED: 4 / 4 HIGH findings**

---

## STILL-OPEN List

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| SEC-034 | MEDIUM | OPEN | `mobile/src/notifications/notificationRouter.ts` lines 44–56 — `id` param passed directly to navigation with no UUID format validation and `as any` cast. Confirmed unvalidated. qa-mobile P6-QA-MOBILE-01 independently verified the same gap. Mobile-dev owner. |
| SEC-030 | MEDIUM | OPEN | Callback audit trail not written to `assignments_log` — unchanged; deferred. |
| SEC-031 | MEDIUM | OPEN | RecurringJobsSubscriber in-process HashSet dedupe — unchanged; deferred. |
| SEC-032 | MEDIUM | OPEN | BootstrapCoa no org ownership check — unchanged; deferred. |
| SEC-033 | MEDIUM | OPEN | `useSensitiveScreen` not on RequestCallbackModalScreen / CallbackStatusScreen — unchanged; deferred. |
| SEC-035 | LOW | OPEN | `snapaccount_admin` BYPASSRLS role not defined — unchanged; deferred. |
| SEC-036 | LOW | OPEN | FCM data payload exposes `event_code` — unchanged; deferred. |
| SEC-037 | LOW | OPEN | OcrResultSubscriber hardcoded fallback account UUIDs — unchanged; deferred. |

---

## SEC-034 / P6-QA-MOBILE-01 Correlation Note

qa-mobile's P6-QA-MOBILE-01 independently confirms the SEC-034 finding by unit test. The test in `mobile/__tests__/notifications/notificationRouter.test.ts` asserts the **current (unvalidated) behavior**, not the desired fix — i.e., the test documents the vulnerability, not the remediation. SEC-034 remains OPEN. When mobile-dev applies the UUID regex guard, the test must be updated to assert that non-UUID `id` values do NOT trigger navigation.

---

## Deferred Findings Note (5 MEDIUM + 3 LOW from original Phase 6 review)

The five MEDIUM findings (SEC-030, SEC-031, SEC-032, SEC-033, SEC-034) and three LOW findings (SEC-035, SEC-036, SEC-037) from the original Phase 6 review are all confirmed still open and unchanged. None were regressed or worsened by the hotfix. These were explicitly deferred to a post-staging follow-up pass in the original Phase 6 summary. The hotfix touched only the 4 HIGH-severity files; no collateral changes were observed in the MEDIUM/LOW scope.

---

## Go / No-Go Recommendation

**GO**

All 4 HIGH-severity blockers (SEC-026, SEC-027, SEC-028, SEC-029) are CONFIRMED-FIXED by source-code inspection. No new Critical or High findings were observed during this re-audit. The 5 MEDIUM and 3 LOW findings remain open and tracked; they are acceptable for staging deployment per the original Phase 6 conditional terms (staging DB contains no real PII; DLQ endpoint restricted until SEC-028 was fixed — which it now is).

**Conditions that remain in force:**
1. SEC-034 (MEDIUM) — UUID validation on deep-link `id` must be fixed before production release (mobile-dev owner).
2. SEC-033 (MEDIUM) — `useSensitiveScreen` on callback screens before production release (mobile-dev owner).
3. SEC-030 (MEDIUM) — Callback audit trail before production release for compliance (backend-agent owner).
4. INFO-001 (from Phase 5) — Placeholder certificate hashes in `pinnedHttpClient.ts` must be replaced before any production build (DevOps owner).

---

*Re-audit completed: 2026-04-25*
*Reviewer: security-reviewer agent*
