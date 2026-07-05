---
name: dg-auth-04-07-gstin-verify-otp-config
description: DG-AUTH-04 GSTIN verify with business-profile fields + DG-AUTH-07 OTP/session config-driven (2026-06-28)
type: project
---

## DG-AUTH-04: POST /auth/gstin/verify (GSTIN business-profile auto-fill)

**What changed:**
- `IKycProvider` interface extended with `VerifyGstinAsync(gstin) → GstinVerifyResult(Verified, LegalName, TradeName, PrincipalPlaceOfBusiness, ProviderRef)`.
- `GstinVerifyResult` record added to `IKycProvider.cs`.
- `MockKycProvider.VerifyGstinAsync` returns mock business-profile fields for dev.
- `MockDocumentVerificationProvider.VerifyGstinAsync` same mock implementation (it implements both interfaces).
- `SandboxKycProvider.VerifyGstinAsync` calls the existing Sandbox GSTN endpoint, extracts `data.lgnm`, `data.tradeNam`, `data.pradr.adr`.
- New command: `AuthService.Application.Kyc.Commands.VerifyGstin.VerifyGstinCommand` + handler (upsert `auth.kyc_verification` with Kind=GSTIN).
- Endpoint: `POST /auth/gstin/verify` in `Platform.WebApi/Endpoints/Auth/Kyc.cs` (RequireAuthorization + "otp" rate limit).
- Response shape: `{ status, verifiedAt, legalName, tradeName, principalPlaceOfBusiness }`.

**Why:** DG-AUTH-04: mobile BusinessProfileWizardScreen step 2 can call this to show Verified badge and auto-fill business name + address. No mobile change yet (mobile-dev owns that surface).

## DG-AUTH-07: Config-driven OTP limits + session token lifetime

**What changed:**
- `appsettings.json` gains `Auth:Otp:{ValidityMinutes:5, MaxAttempts:3, CooldownMinutes:30}` and `Auth:Session:{TokenLifetimeHours:12, RefreshTokenLifetimeDays:30}` sections.
- `OtpService` reads `Auth:Otp:*` via `IConfiguration.GetValue<int?>()` with fallback to legacy defaults (backwards-compatible).
- `OtpRequest` domain entity gains `CooldownMinutes` property (private set, default 30). New method `SetLimits(maxAttempts, cooldownMinutes)` called by OtpService after construction. `IncrementAttempt()` uses `CooldownMinutes` instead of hardcoded 30.
- EF config `OtpRequestConfiguration` maps `cooldown_minutes` column.
- Migration `106_auth_otp_cooldown_minutes.sql`: `ALTER TABLE auth.otp_request ADD COLUMN IF NOT EXISTS cooldown_minutes SMALLINT NOT NULL DEFAULT 30`.
- `FirebaseAuthService.SessionTokenLifetime` changed from `static readonly` to a computed property reading `Auth:Session:TokenLifetimeHours` (default 12, matching prior hardcoded value).

**Why:** DG-AUTH-07 (low): B1.1 says OTP validity is configurable; B1.4 says 1h session token. Current 12h remains default but can now be changed via config without a code change.

**Additive/safe:** EF column default matches C# default; existing rows hydrate with MaxAttempts=3 CooldownMinutes=30; tests that construct OtpRequest directly still work because SetLimits is optional.
