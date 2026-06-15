---
name: Phase 7 Wave 1 — GAP fixes B1-B6
description: Security and reliability gaps fixed: Firebase revoke retry (GAP-003), RLS error logging (GAP-004), JWT secret fail-fast (GAP-005), org context JWT refresh (GAP-007), callback KPI endpoint (GAP-012), consent locale (GAP-040)
type: project
---

Phase 7 Wave 1 backend work completed 2026-06-10. All 6 tasks addressed:

**B1 — GAP-003 / Firebase Revoke Best-Effort (DPDP)**
- `RequestAccountDeletionCommandHandler` now: (1) checks `Result` from `RevokeRefreshTokensAsync`, (2) catches all exceptions, (3) in either failure path logs at Error and calls `IFirebaseRevokeRetryScheduler.ScheduleRevoke(uid, userId)`.
- New interface `IFirebaseRevokeRetryScheduler` in `AuthService.Application/Interfaces/`.
- Hangfire implementation `HangfireFirebaseRevokeRetryScheduler` + `FirebaseTokenRevokeJob` in `AuthService.Infrastructure/Services/`.
- Added `Hangfire.Core` to `AuthService.Infrastructure.csproj`.
- DI registration in `AuthService.Infrastructure/DependencyInjection.cs`.

**Why:** DPDP Act 2023 erasure must complete regardless of Firebase availability. The 1-hour Firebase ID-token TTL is the acceptable exposure window.

**B2 — GAP-004 / RLS Error Level**
- `RlsSessionInterceptor.cs`: changed `LogWarning` to `LogError` in the catch block with explicit ALERT comment.
- Parameterised `set_config` call already in place.

**B3 — GAP-005 / Fail-fast JWT secret**
- `SessionTokenSecret.ValidateOrThrow(config, environmentName)` added to `SnapAccount.Shared.Infrastructure/Auth/SessionTokenSecret.cs`.
- All 12 service `Program.cs` files: call `SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName)` before `app.Run()`.
- Dev behavior unchanged (method no-ops for "Development" environment name).

**B4 — GAP-007 / Re-issue JWT after org creation**
- New `POST /auth/token/refresh-context` endpoint calls `RefreshContextCommand` → `RefreshContextCommandHandler`.
- Handler re-mints via `IFirebaseAuthService.CreateCustomTokenAsync` — consistent with login flow.
- Rate-limited via `"standard"` policy (100 req/min).
- Files: `AuthService.Application/Auth/Commands/RefreshContext/RefreshContextCommand.cs` (new), `AuthService.Api/Endpoints/Auth.cs` (extended).

**B5 — GAP-012 / Real Callback KPI endpoint**
- New keyless EF entity `KpiDailySnapshot` → `callback.kpi_daily_snapshot` MV.
- `ICallbackDbContext` extended with `DbSet<KpiDailySnapshot> KpiSnapshots`.
- `CallbackDbContext` implementation added.
- `KpiDailySnapshotConfiguration.cs` (HasNoKey + ToView).
- `GetKpiSnapshotQuery` + handler: mandatory `org_id` filter, rolling window, FCR + avg-TTR + avg-CSAT aggregation.
- Endpoint `GET /callbacks/kpi` now real data (replaced placeholder JSON).
- IDOR protection: `OrganizationId` always sourced from JWT claims in the endpoint.

**B6 — GAP-040 / Consent locale**
- `Consent` entity: added `ConsentLocale` property (default "en").
- `ConsentConfiguration.cs`: `HasMaxLength(10)`, `HasDefaultValue("en")`, `IsRequired()`.
- `RecordConsentCommand`: added `string ConsentLocale = "en"` parameter.
- `RecordConsentCommandValidator`: added NotEmpty + MaximumLength(10) rule.
- Handler normalises locale: `Trim().ToLowerInvariant()`.
- API DTO `RecordConsentRequest` and endpoint delegate updated to pass locale.
- Note: SQL migration for `consent_locale` column required from db-engineer.

**Test counts (post wave1):**
- AuthService: 575 passing (new: AccountDeletionFirebaseRevokeTests x4, SessionTokenSecretValidateTests x7, RefreshContextCommandTests x5 = +16 net new, +6 from B2 coverage in existing tests)
- CallbackService: 35 passing (new: GetKpiSnapshotQueryTests x4)
- LoanService: 90 passing (new: RecordConsentLocaleTests x7 + normalisation/entity tests)

**Build:** `cd backend && dotnet build` → 0 errors, 1 pre-existing warning in AccountingService (unrelated Pub/Sub API deprecation).
