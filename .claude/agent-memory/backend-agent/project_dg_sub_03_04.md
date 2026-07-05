---
name: project_dg_sub_03_04
description: DG-SUB-03 webhook secret DB-first resolution + DG-SUB-04 self-service /me/* subscription routes (2026-06-28)
metadata:
  type: project
---

# DG-SUB-03/04 SubscriptionService Gaps (2026-06-28)

## DG-SUB-03: Webhook Secret DB-First Resolution

**Problem:** `RazorpayWebhook.cs` line 60 only read `configuration["RAZORPAY_WEBHOOK_SECRET"]`. The admin-saved `RazorpayConfig.EncryptedWebhookSecret` (written by `UpdateRazorpayConfigCommand`) was stored in DB but never read at webhook time — so admin-configured webhook secrets had zero effect.

**Fix:** Modified `RazorpayWebhook.HandleWebhook` to inject `ISubscriptionServiceDbContext` + `ICredentialEncryptionService` + `ILogger<RazorpayWebhook>`. Added `ResolveWebhookSecretAsync` static method:
1. Query `db.RazorpayConfigs` where `DeletedAt == null && IsEnabled`, order by `UpdatedAt DESC`, take first.
2. If row found and has `EncryptedWebhookSecret`, decrypt via `encryption.Decrypt()` — on decrypt failure, log warning and fall through.
3. Fallback: `configuration["RAZORPAY_WEBHOOK_SECRET"]` (env var / appsettings).
4. If neither present: log error, return 503.

Both `ISubscriptionServiceDbContext` and `ICredentialEncryptionService` are registered in Platform via `AddSubscriptionInfrastructure` and available in Platform.WebApi (references Platform.Application).

**Key file:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Subscription/RazorpayWebhook.cs`

## DG-SUB-04: Self-Service /me/* Routes

**Problem:** Admin frontend `subscriptionApi.ts` calls:
- `api.delete('/subscriptions/me')` → no such route (only `POST /{id}/cancel` existed)
- `api.post('/subscriptions/me/upgrade', {newPlanId})` → no such route
- `api.post('/subscriptions/me/downgrade', {newPlanId})` → no such route

All three hit 404. The subscription id is compounded unknown (gap #9 also shows frontend can't retrieve it correctly).

**Fix:** Added three new commands and three new endpoint routes that resolve the subscription server-side from `ICurrentUser.OrganizationId`:

- `SelfServiceCancelSubscriptionCommand` → `DELETE /subscriptions/me`
- `SelfServiceUpgradeSubscriptionCommand(Guid NewPlanId)` → `POST /subscriptions/me/upgrade`
- `SelfServiceDowngradeSubscriptionCommand(Guid NewPlanId)` → `POST /subscriptions/me/downgrade`

All return 204 on success, 404 when no active sub, 422 when tier constraint violated.
All use `ICommand<Result>` (returns `Result<Result>`) — matching the existing codebase pattern in CancelSubscriptionCommand/UpgradeSubscriptionCommand. NOT `ICommand` (non-generic) since `Result` has no implicit conversion from `Error`.

**New files:**
- `Platform.Application/Subscription/Subscriptions/Commands/SelfServiceCancel/SelfServiceCancelSubscriptionCommand.cs`
- `Platform.Application/Subscription/Subscriptions/Commands/SelfServiceUpgrade/SelfServiceUpgradeSubscriptionCommand.cs`
- `Platform.Application/Subscription/Subscriptions/Commands/SelfServiceDowngrade/SelfServiceDowngradeSubscriptionCommand.cs`

**Modified files:**
- `Platform.WebApi/Endpoints/Subscription/Subscriptions.cs` — 3 new route registrations + 3 handler methods + 2 request records

## Pattern Note: ICommand<Result> vs ICommand

In this codebase, handlers that return "void success" use `ICommand<Result>` NOT `ICommand`. The non-generic `ICommand` (`ICommandHandler<TCommand>`) returns `Task<Result>`, but `Result` has NO implicit conversion from `Error` — only `Result<T>` does. So `return Error.NotFound(...)` compiles when returning `Task<Result<Result>>` (from `ICommand<Result>`) but NOT when returning `Task<Result>` (from `ICommand`).

**Why:** `Result<T>(Error error)` = Failure case of `Result<T>` via implicit operator. `Result` has no such implicit conversion.

## Build Status: 0 Errors (verified)
