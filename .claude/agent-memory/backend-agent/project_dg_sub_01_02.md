---
name: dg-sub-01-02-razorpay-wiring
description: DG-SUB-01 and DG-SUB-02 — Live Razorpay DI factory and handler wiring (2026-06-28)
metadata:
  type: project
---

# DG-SUB-01 + DG-SUB-02: Razorpay Live Client Wiring

**Completed:** 2026-06-28. 110 subscription tests green. 0 build errors.

## DG-SUB-01: Live RazorpayHttpClient DI Factory

**Problem:** Non-Development environments registered a factory that threw `InvalidOperationException` at resolution time. `RazorpayHttpClient` was never constructable.

**Fix:** Replaced the throw with a scoped factory in `Platform.Infrastructure/Subscription/DependencyInjection.cs` that:
1. Reads the `RazorpayConfig` row from `ISubscriptionServiceDbContext` (sync `.FirstOrDefault()`)
2. If `IsEnabled=false` or row missing → returns `MockRazorpayClient` (safe no-op fallback)
3. If `IsEnabled=true` → decrypts `EncryptedKeySecret` via `ICredentialEncryptionService`; if decrypt fails → falls back to `MockRazorpayClient`
4. On success → constructs `RazorpayHttpClient(IHttpClientFactory, RazorpayClientOptions, ILogger<>)`

Development always uses `MockRazorpayClient` unconditionally (no DB read, no ENCRYPTION_KEY required).

Admin activates live Razorpay by calling `PATCH /subscriptions/config/razorpay` with `IsEnabled=true` — takes effect on next request, no redeploy needed.

**Key pattern:** `LoggerFactoryExtensions.CreateLogger<T>(logFactory)` — must use static extension form, not `logFactory.CreateLogger<T>()` (the latter is the non-generic base interface method).

## DG-SUB-02: Handler Wiring

**Files changed:**
- `Platform.Domain/Subscription/Entities/Plan.cs` — added `RazorpayPlanId` property + `SetRazorpayPlanId(string)` method
- `Platform.Infrastructure/Subscription/Persistence/Configurations/PlanConfiguration.cs` — mapped `RazorpayPlanId` to `razorpay_plan_id` column (already exists in DB migration 010)
- `Platform.Application/Subscription/Plans/Commands/CreatePlan/CreatePlanCommand.cs` — injects `IRazorpayClient`; calls `SyncPlanAsync` for paid plans; stores returned `PlanId` via `SetRazorpayPlanId`; non-fatal on failure
- `Platform.Application/Subscription/Subscriptions/Commands/Subscribe/SubscribeCommand.cs` — injects `IRazorpayClient`; calls `CreateSubscriptionAsync` for paid plans with a `RazorpayPlanId`; stores ID via `Subscription.SetRazorpaySubscriptionId`; non-fatal on failure; response includes `RazorpaySubscriptionId` + `RazorpayShortUrl`
- `Platform.Application/Subscription/Subscriptions/Commands/UpgradeSubscription/UpgradeSubscriptionCommand.cs` — injects `IRazorpayClient`; calls `CreateSubscriptionAsync` for new paid plan with `RazorpayPlanId`; non-fatal on failure

## BillingCycle → Razorpay period mapping

| BillingCycle | Razorpay period | interval |
|---|---|---|
| Monthly | monthly | 1 |
| Quarterly | monthly | 3 |
| Annual | yearly | 1 |

## Test updates

- `tests/unit/SubscriptionService/MockRazorpayGuardTests.cs` — rewrote: old tests asserted non-Dev THROWS; new tests assert non-Dev falls back to Mock. Added test 4 that verifies IsEnabled=true → `RazorpayHttpClient`
- `tests/unit/SubscriptionService/RazorpaySubscriptionTests.cs` — added 9 new tests for handler wiring (SubscribeCommandHandler + CreatePlanCommandHandler)

**Why:** `PlanTier.Pro` does not exist in the enum — use `PlanTier.Growth` (tiers: Free=0, Starter=1, Growth=2, Enterprise=3).
