---
name: Security Fixes Phase 6 Hotfix (SEC-026..029)
description: 4 HIGH security findings fixed in Phase 6A+6E hotfix pass — PermissionBehavior DI, DPDP erasure, DLQ gate, IDOR
type: project
---

Phase 6 hotfix applied on 2026-04-25. Build: 0 errors, 0 warnings. Unit tests: 173/173 pass. Integration tests build clean.

## SEC-026 — PermissionBehavior not registered in DI

**Scope:** AccountingService, NotificationService, CallbackService.

**Fix pattern:** For each service:
1. Create `<Service>.Application/Behaviors/PermissionBehavior.cs` — identical implementation to `AuthService.Application/Behaviors/PermissionBehavior.cs`.
2. In `<Service>.Application/DependencyInjection.cs`, after `services.AddApplicationServices(...)`, add:
   ```csharp
   services.AddMediatR(cfg => cfg.AddOpenBehavior(typeof(PermissionBehavior<,>)));
   ```
3. Add `[RequiresPermission("permission.name")]` to the relevant commands/queries.

**Commands decorated:**
- `CloseFiscalYearCommand` → `"accounting.fiscal_year.close"`
- `ReversePostingCommand` → `"accounting.journal.reverse"`
- `ReviewPostingCommand` → `"accounting.journal.review"`
- `AssignCallbackCommand` → `"callback.assign"`
- `CompleteCallbackCommand` → `"callback.complete"`
- `EscalateCallbackCommand` → `"callback.escalate"`
- `CancelCallbackCommand` → `"callback.cancel"`
- `GetDlqQuery` → `"notification.dlq.manage"`
- `RetryDlqItemCommand` → `"notification.dlq.manage"`

## SEC-027 — DPDP Right-to-Erasure missing for callback.* and notification.*

**Fix:** Created `AccountDeletionSubscriber` (BackgroundService) in both:
- `CallbackService.Infrastructure/Messaging/AccountDeletionSubscriber.cs`
- `NotificationService.Infrastructure/Messaging/AccountDeletionSubscriber.cs`

**Pattern:** Pub/Sub subscriber on topic `account-deletion-events` with subscription names:
- `callback-service-account-deletion-sub` (config key: `PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_CALLBACK`)
- `notification-service-account-deletion-sub` (config key: `PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_NOTIFICATION`)

**CallbackService erasure:** loads `CallNote` rows where `AuthorId == userId`, sets `DeletedAt = now`. Loads `Callback` rows where `UserId == userId`, calls `cb.Anonymize("DPDP_ORG_ERASURE")` which sets `UserId = null`, `AnonymizedAt = now`, `AnonymizationReason = "DPDP_ORG_ERASURE"`.

**Domain change:** `Callback.UserId` changed from `Guid` to `Guid?` (nullable). `AnonymizedAt` and `AnonymizationReason` properties added. `Anonymize(string reason)` method added. EF config updated: `user_id` no longer `IsRequired()`; new columns `anonymized_at` and `anonymization_reason` mapped (columns already in migration 018).

**NotificationService erasure:** soft-deletes `NotificationLog` rows and `DlqItem` rows for the deleted user.

**Registration:** `services.AddHostedService<AccountDeletionSubscriber>()` in each service's Infrastructure `DependencyInjection.cs`.

**GCP dependency:** Subscriber silently skips if `GCP_PROJECT_ID` is not configured (so local dev without PubSub doesn't crash).

## SEC-028 — DLQ endpoints publicly accessible

**Fix:** `[RequiresPermission("notification.dlq.manage")]` added to both `GetDlqQuery` and `RetryDlqItemCommand`. Enforced automatically via the `PermissionBehavior` registered in SEC-026 fix. No endpoint-layer change needed.

## SEC-029 — IDOR on CallbackService endpoints

**Fix:** `ICurrentUser` injected into all 8 handlers via primary constructor. Org check pattern:
```csharp
if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
    return Result.Failure(Error.NotFound("Callback", request.CallbackId));
```
Returns `NotFound` (not `Forbidden`) to avoid existence leak.

`GetCallbackByIdQueryHandler` specifically does the org filter in the EF query itself:
```csharp
c.DeletedAt == null && (orgId == null || c.OrganizationId == orgId)
```

`ListCallbacksQuery` was already org-scoped via the `OrganizationId` parameter — no change needed.

## Tests added

**CallbackStateMachineTests.cs** extended with `CallbackIdrSecurityTests` class:
- `GetCallback_CrossOrgAccess_Returns404` — SEC-029
- `AssignCallback_CrossOrgAccess_Returns404` — SEC-029
- `GetCallback_SameOrgAccess_Returns200` — control case

**NotificationApiTests.cs** extended with `NotificationDlqSecurityTests` class:
- `GetDlq_WithoutDlqManagePermission_Returns403` — SEC-028 (attribute presence check)
- `RetryDlqItem_PermissionAttributePresent` — SEC-028 attribute verification
- `CloseFiscalYearCommand_HasRequiresPermissionAttribute` — SEC-026
- `ReversePostingCommand_HasRequiresPermissionAttribute` — SEC-026
- `DpdpErasure_AccountDeletionSubscriberTypes_ExistInInfrastructure` — SEC-027

**Why:** `TestCurrentUser` thread-static helper used in callback security tests; `NotificationTestCurrentUser` for notification tests. Both implement `ICurrentUser` and control `HasPermission()` return value.
