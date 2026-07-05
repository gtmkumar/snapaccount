---
name: project_integration_suite_notif_sub_callback_chat_acct
description: 2026-07-05 full-verification campaign — converted Notification/Subscription/Callback/Chat integration suites to MigratedPostgresFixture and diagnosed AccountingApiTests's remaining 500s; found 3 new confirmed backend bugs + 1 cross-composite JSON-enum gap + a reusable WebApplicationFactory test-harness pattern.
metadata:
  type: project
---

Continuation of [[project_integration_suite_migration_fixture_conversion]] (which covered Loan/Gst/Itr). This pass covered NotificationService, SubscriptionService, CallbackService, ChatService, and diagnosed AccountingApiTests.cs's 2 flagged 500s. Branch `2026-07-05-full-verification`, not committed.

**Results:** 51 passed / 16 skipped (all documented) / 0 failed across 5 suites — Notification 11/5/0, Subscription 4/5/0, Callback 18/0/0, Chat 6/0/0, Accounting 7/6/0.

**3 new CONFIRMED backend bugs found (cannot fix — logged in bug-log.md, tests skipped citing them):**
1. `BUG-NOTIF-SEND-DEDUPE-LINQ` (CRITICAL) — `SendNotificationCommandHandler` computes `DateTime.UtcNow.Subtract(DedupeWindow)` **inside** an EF LINQ `AnyAsync` predicate; EF Core can't translate `.Subtract()` in an expression tree → `POST /notifications/send` always 500s. Breaks the single fan-out entry point for ALL platform notifications. Fix: hoist to a local variable before the query.
2. `BUG-SUB-PLAN-CODE-MISSING` (HIGH) — `subscription.subscription_plan.code` is `NOT NULL UNIQUE` in the real DDL but `PlanConfiguration` never maps it (not even a shadow property) → `POST /subscriptions/plans` always 500s. Separately, `billing_cycle`'s CHECK constraint (`'MONTHLY'/'YEARLY'/'LIFETIME'`) doesn't match what the `BillingCycle` enum's `.HasConversion<string>()` writes (`Monthly`/`Quarterly`/`Annual`) — wrong casing AND wrong vocabulary (no quarterly option in the DB). Breaks all plan creation → breaks Subscribe/upgrade/downgrade. Reads (`GET /subscriptions/plans`) work fine.
3. `BUG-ACCT-COA-TEMPLATE-CODE` (CRITICAL) — `CoaTemplateRepository.GetAllTemplatesAsync` (raw Dapper SQL) selects `template_code` from `accounting.coa_template`, a column that has never existed (DDL only has `account_code`). Breaks `POST /accounting/organizations/{id}/bootstrap-coa` — the prerequisite for every accounting operation (journal entries, trial balance, reports, fiscal-year-close).

**1 cross-composite finding (design gap, not a hard bug, MEDIUM):**
`BUG-ASSIST-NO-ENUM-CONVERTER` — `Assist.WebApi` (Chat/AI/Callback) has no `JsonStringEnumConverter` registered, unlike `Platform.WebApi`/`Finance.WebApi` (both call `ConfigureHttpJsonOptions` + add the converter — exactly 2 grep hits, neither in Assist). Every enum field in a Chat/Callback JSON request/response is a raw int, not a string name, unlike the other two composites. One-line fix (`Assist.WebApi/Program.cs`) would remove a real client-facing inconsistency.

**Reusable test-harness pattern discovered:** ambient state ([ThreadStatic] **or** AsyncLocal) set in a test method is NEVER visible to code executed by `WebApplicationFactory`'s in-memory `TestServer` — it processes each request as a genuinely separate pipeline invocation, not a nested continuation of the calling async flow. The ONLY channel that reliably crosses that boundary is the HTTP request itself. Fix pattern: a custom header (e.g. `X-Test-Org-Id`/`X-Test-User-Id`) read via an injected `IHttpContextAccessor` inside a test-only `ICurrentUser` implementation. Used successfully for CallbackIdrSecurityTests (`TestCurrentUser`) and reused verbatim for ChatServiceIdempotencyTests (`ChatTestCurrentUser`). **Apply this pattern to any future WebApplicationFactory-based test needing per-request-swappable identity — do not attempt ThreadStatic/AsyncLocal, it will silently 500/misbehave.**

**Environment quirks resolved along the way:**
- `NotificationSeeder` (pure DB seed, no GCP calls) is gated behind `GcpStartup.IsEnabled(configuration)` alongside genuinely GCP-dependent hosted services — in Testing env with no Firebase creds this evaluates false, so templates never seed. Worked around by constructing `NotificationSeeder` directly in test setup and calling `.StartAsync()` manually (bypasses the hosted-service registration entirely, since the seeder itself has zero GCP dependency).
- Non-Development environments require `ENCRYPTION_KEY` (32-byte base64 AES key) for `AesCredentialEncryptionService` (Subscription's `IRazorpayClient` DB-driven factory) — set via `UseSetting("ENCRYPTION_KEY", <valid key>)` in the test factory, not a bug, just a required config value for "Testing" env.
- `GET /notifications/inbox`, `/preferences`, `POST /notifications/{id}/read`, `push-tokens` all resolve the acting user from `ICurrentUser.UserId` and IGNORE any `userId` query/body param — only `POST /notifications/send` accepts an explicit target user. Tests must target the dev-superadmin fixed user id (`22222222-2222-2222-2222-222222222222`) for these flows to see data.

See also: [[project_integration_suite_migration_fixture_conversion]] for the Loan/Gst/Itr pass and the shared `MigratedPostgresFixture` design (`tests/integration/_shared/MigrationSupport.cs`, template+clone pattern, keep-list of reference tables).
