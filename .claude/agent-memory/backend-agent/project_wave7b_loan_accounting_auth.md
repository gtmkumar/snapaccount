---
name: project-wave7b-loan-accounting-auth
description: Wave 7B Board #44 — GAP-044/047/051/110 + Board#42 fix; LoanService fraud stage, AccountingService comparative analysis, AuthService admin cookie auth + device approval. Migrations 082/083. 964 tests green.
metadata:
  type: project
---

Wave 7B (Board #44) implemented 2026-06-12 on branch `2026-06-10-s5t4`.

## Migrations

- **082** (`database/migrations/082_loan_fraud_checks.sql`): `loan.fraud_checks` table (JSONB details, GIN index, `loan.fraud.view` permission → ORG_ADMIN/SUPER_ADMIN/OPERATIONS_MANAGER). Table name correction: auth.permission (singular), auth.role (singular), auth.role_permission (singular) — DB doesn't use plural table names.
- **083** (`database/migrations/083_auth_device_approval_requests.sql`): `auth.device_approval_requests` table. FK refs must use `auth."user"` (quoted — reserved word) and `auth.user_device`. RLS via `app.current_user_id`.

Both migrations applied + scratch-replayed (idempotent).

## GAP-110 — Loan Fraud Pre-Submission

New entity: `FraudCheck` (loan.fraud_checks). 6 check types: DuplicatePan, DuplicatePhone, DuplicateDevice, VelocityPan, VelocityPhone, PennyDrop. 3 verdicts: Pass/Flag/Fail.

- FLAG = soft signal, submission allowed, operator gets note in response
- FAIL = hard signal, 422 returned, submission blocked
- Config-driven thresholds in `FraudCheck:` appsettings section (never hardcoded)
- `IPennyDropVerifier` / `IFraudCheckConfig` interfaces in Application layer
- `MockPennyDropVerifier` registered dev-only; fail-fast in prod (StubLoanPdfGenerator pattern)
- Cross-org counts: MVP uses in-memory LINQ (no EF.Functions.JsonContains — Npgsql-only, violates clean arch). Future: dedicated index table.
- Application layer (no Npgsql ref): never use `EF.Functions.JsonContains` — causes CS1061. Use simple LINQ equality or in-memory filter.
- `IConfiguration.GetValue<bool?>` not available in Application layer (only Abstractions pkg). Use: `configuration["Key"] is "true" or "True"`.

New endpoints: POST /loans/applications/{id}/fraud-check, GET /loans/applications/{id}/fraud-summary.

## GAP-044 — AccountingService Comparative Analysis

New query: `GetComparativeAnalysisQuery`. Pure LINQ over accounting.ledger_entries. Indian FY: April=period 1, March=period 12. Chart-ready DTO: 12-slot label+series arrays. Top 10 movers by absolute change. YoY null-safe (avoids ÷0). No AI dependency.

Collection expression type ambiguity fix: `string[] accountTypes = categoryFilter is null ? [...] : [...]` — must declare explicit type when both branches are collection expressions.

New endpoint: GET /accounting/reports/comparative.

## GAP-051 — AuthService Admin Browser Cookie Auth

New endpoints: POST /auth/admin/login, POST /auth/admin/refresh, POST /auth/admin/logout (grouped under AdminAuth.cs, path /auth/admin).

- Cookie name: `sa_admin_rt`, HttpOnly+Secure+SameSite=Strict, Path=/auth/admin, Max-Age=7days
- CSRF: SameSite=Strict (primary) + X-Requested-With: XMLHttpRequest custom header (defence-in-depth). Missing header → 400.
- Admin access token = 1 hour (mobile = 12h). Admin refresh = 7 days (mobile = 30+d).
- Reuses IRefreshTokenRepository + IFirebaseAuthService — no forked auth logic.
- Mobile refresh path (POST /auth/refresh-token) 100% untouched.

## GAP-047 — AuthService Device Approval

New entity: `DeviceApprovalRequest` (auth.device_approval_requests). 10-min expiry. Status: Pending→Approved/Denied (final, no re-transition).

Trigger: AddDeviceCommand — if user has ≥1 existing active devices, creates approval request + publishes `DeviceApprovalRequestedEvent` to `device-approval-requests` Pub/Sub topic. Publishing failure is caught+logged, never blocks device add.

Soft-launch: `DeviceApproval:Enforce` flag (default false). When false, denial is logged only — new device session not revoked.

New endpoints: GET /auth/devices/pending-approvals, POST /auth/devices/{id}/approve, POST /auth/devices/{id}/deny.

Security: IDOR guard on reviewing device (must belong to user), same-device guard (reviewing ≠ new device), expiry check on every action.

## Board #42 — RefreshContext 500 Fix

`POST /auth/token/refresh-context`: `NotFound` error now maps to 401 (was falling through to Results.Problem → 500 for DEV_AUTH_BYPASS canned GUID). Switch expression pattern covering all error types.

## InMemoryLoanDbContext (tests)

When adding new DbSet to ILoanServiceDbContext, must ALSO add it to `InMemoryLoanDbContext` in `tests/unit/LoanService/Application/IdorSecurityTests.cs` (and `OnModelCreating` for enum conversions). All test files in the project share that single class.

## Test Counts

- LoanService: 166 pass (9 EfSmoke incl. FraudCheck full-materialization)
- AuthService: 738 pass (8 EfSmoke incl. DeviceApprovalRequest full-materialization)
- AccountingService: 60 pass (comparative analysis validator, Indian FY label contract)
- Total: 964 tests green

**Why:** Board #44 assignment on branch 2026-06-10-s5t4, concurrent with Wave 7A (Chat/Report/Notification) — owned LoanService/AccountingService/AuthService and migrations 082+083 only.
