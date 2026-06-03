---
name: tasks-17-18-19-totp-pwreset-kyc
description: AuthService 2FA TOTP, password reset, and KYC (mock) — all three features complete, build green, 347 tests pass
type: project
---

Tasks #17, #18, #19 landed in a single pass on AuthService only.

**Why:** All three touch `Program.cs`/DI and shared Application interfaces — doing together avoids merge conflicts.

**How to apply:** When reviewing follow-on work (mobile/admin agents), point them to `docs/api/endpoints.md` Task #17/#18/#19 section for the exact DTO shapes.

## Key design decisions

### 2FA TOTP (#17)
- TOTP secret: AES-256-CBC encrypted via `IEncryptionService` / `AesEncryptionService`, keyed from `ENCRYPTION_KEY` env var (dev fallback: SHA256 of fixed seed with warning).
- Recovery codes: 8 codes, `XXXXXX-XXXXXX` hex format. Stored as JSON array of SHA-256 hex hashes in `auth.user_totp.recovery_codes`. Plaintext returned once on confirm.
- Challenge token: short-lived (5 min) `LocalJwt`-compatible HS256 token (purpose claim = "2fa-challenge"). No extra NuGet — reuses `LocalJwt.Issue/Validate` from shared infra via `IChallengeTokenService`.
- Login 2FA gate: both `LoginWithPasswordCommandHandler` and `LocalAuthService.LoginAsync` check `db.UserTotps` and return `requires2fa=true + challengeToken` when enabled.
- `ITotpValidator` / `OtpNetTotpValidator` backed by `Otp.NET` 1.4.1. ±1 window (90 s tolerance).

### Password Reset (#18)
- Token: 32 random bytes → base64url. SHA-256 hex hash stored in DB. Never plaintext.
- No user enumeration: `/forgot` always returns 204.
- `IEmailSender` / `SendGridEmailSender`: falls back to console log when `SendGrid:ApiKey` absent.
- `IPasswordResetUrlBuilder` hides `IConfiguration` from Application layer.
- On reset: revokes ALL existing refresh tokens for user.

### KYC (#19)
- `IKycProvider` / `MockKycProvider`: mock verifies PAN format (XXXXX9999X), logs dev OTP for Aadhaar. OTPs stored in `MockOtpStore` (in-process ConcurrentDictionary — local dev only).
- DPDP compliance: only `XXXX-XXXX-1234` (masked last 4 digits) stored in `auth.kyc_verification.reference_number`.
- Provider selection: `KYC_PROVIDER` env var (default "mock").

## New interfaces (Application layer)
- `IEncryptionService` — AES encrypt/decrypt for TOTP secrets
- `ITotpValidator` — RFC 6238 TOTP code verification
- `IChallengeTokenService` — issue/validate 2FA challenge tokens
- `IEmailSender` — password reset email delivery
- `IPasswordResetUrlBuilder` — builds reset URL from config without IConfiguration in Application

## Build state
- `dotnet build backend/`: 0 errors, 0 warnings
- `dotnet test tests/unit/AuthService/`: 347 passed, 0 failed
MARKDOWN
