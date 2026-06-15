# HANDOFF — Auth schema cross-surface integration + per-org government verification

**Date:** 2026-06-03
**Branch:** `fix/ai-config-validation-notifications-500`
**PR:** [#32](https://github.com/gtmkumar/snapaccount/pull/32) — OPEN against `main`
**Commits on branch (ahead of main):**
- `c747b99` feat(auth): cross-surface auth schema integration + government verification
- `801702c` fix(ai-config+notifications+callback): key-required save, Sarvam/per-feature persistence, inbox 500s, Aspire callback startup

Scope: 173 files, +15,285 / −492.

---

## What was built

Started as a gap audit ("any pending work from auth schema?") → implemented 6 auth features
+ a per-organization government-verification toggle, across DB / backend / admin / mobile.

### Tier A (fully buildable, done + live-verified)
1. **User preferences persistence** — `PATCH/GET /auth/me/preferences` (theme, language, notification flags). Partial-update, nullable fields.
2. **Sessions / devices UI** — list + revoke (admin `DevicesSettings.tsx`, mobile `DevicesScreen.tsx`, `devicesApi.ts`).
3. **Admin password reset** — `ForgotPasswordPage` / `ResetPasswordPage` (public routes), backend `PasswordReset.cs`, SHA256 opaque tokens.
4. **2FA TOTP** — RFC 6238 (SHA1/30s/6-digit, Otp.NET). Secret AES-encrypted at rest (`ENCRYPTION_KEY`), recovery codes hashed, challenge-token login flow. Admin `TwoFaSettings.tsx` (QR via qrcode.react), mobile `TwoFactorChallengeScreen.tsx`.

### Tier B (externally-blocked, scaffolded)
5. **Aadhaar/PAN/GSTIN/TAN KYC** — canonical `/auth/me/documents` flow (mock provider; real gov adapter pending).
6. **Google/Apple Sign-In (mobile)** — real expo-auth-session / expo-apple-authentication flows, gated by `isFirebaseConfigured()`; graceful fallback when Firebase absent (local).

### Government verification feature (per-organization)
- **Toggle:** `auth.organization.government_verification_enabled` (default false).
- **OFF:** store PAN/Aadhaar/GSTIN/TAN as unverified details (status SAVED) for GST/ITR filing assistance.
- **ON:** each document requires OTP government verification (status PENDING → VERIFIED).
- Admin UI: `GovVerificationSection` in OrganizationDetailPage Settings tab.
- Endpoint: `PATCH /auth/admin/organizations/{orgId}/settings { governmentVerificationEnabled }`,
  gated by **`org.settings.update`** (NOT the non-existent `platform.orgs.write`).

---

## DB migrations (applied live, idempotent)
- `050_auth_user_totp.sql`
- `051_auth_password_reset_token.sql`
- `052_auth_kyc_verification.sql`
- `053_auth_kyc_gov_verification_toggle.sql` — adds `government_verification_enabled`;
  kyc_verification kind CHECK ∈ PAN/AADHAAR/GSTIN/TAN, status CHECK ∈ SAVED/PENDING/VERIFIED/FAILED;
  partial unique `ux_kyc_verification_user_kind (user_id, kind) WHERE deleted_at IS NULL`.

## Key endpoints
- `GET/PATCH /auth/me/preferences`
- 2FA: `/auth/2fa/{enroll,confirm,disable,status}`, `/auth/2fa/challenge`
- Password reset: `/auth/password/forgot`, `/auth/password/reset`
- Documents: `GET /auth/me/organization/verification-policy`, `GET /auth/me/documents`,
  `POST /auth/me/documents/{kind}`, `.../verify/otp/send`, `.../verify/otp/confirm`
  (kind = pan|aadhaar|gstin|tan, case-insensitive; mock OTP `000000` fails, any other 6-digit succeeds)

---

## Bugs caught by live E2E (all fixed + re-verified)
1. **Preferences PATCH silently dropped theme/notification flags** when user had no `user_preference` row.
   Fixed: `User.SetPreference()` + `UserRepository` detached-nav detection (`UserPreferences.Add`).
2. **Admin login broken** — `useAuth.ts` read `data.accessToken`; backend returns `token`. Fixed.
3. **Admin 2FA lockout risk** — login didn't handle `requires2fa`. Added challenge step.
4. **Wrong document OTP set FAILED + consumed transaction** (not retryable). Fixed: no DB write on wrong OTP, stays PENDING, `otpAccepted:false`, retryable.
5. **Gov-verification toggle gated on non-existent `platform.orgs.write`** — disabled even for SUPER_ADMIN. Fixed FE+BE → `org.settings.update`.

## Tests (all green)
- AuthService backend: 446
- Admin vitest: 885
- Mobile suites: green
- (Full backend unit 314 / integration 102 / admin 794 baselines from prior handoff still hold.)

---

## Verification limitations (local-only)
- Firebase social token exchange not exercised (no Firebase config locally) — flows fall back gracefully.
- iOS simulator standard RN TextInput doesn't accept synthetic typing (custom PanInput does) — KYC text fields verified at API/DB + unit-test layer.
- Aspire routes service logs to dashboard/OTLP not stdout — dev OTP / reset tokens verified via DB rows + negative paths + unit tests, not log-grep.

## Local run command (for next session E2E)
```
cd backend && ASPIRE_ALLOW_UNSECURED_TRANSPORT=true LOCAL_AUTH=true DEV_AUTH_BYPASS=true \
  Ocr__ScratchDir=/private/tmp/snapaccount-ocr DB_PASSWORD=postgresql \
  dotnet run --project AppHost --launch-profile http
```
DB: `PGPASSWORD=postgresql psql -h localhost -U postgres -d snapaccount`
Single-service restart under Aspire/dcpctrl is unreliable — teardown + relaunch full stack.

---

## Next options
- Address PR #32 review feedback / merge.
- Real government KYC adapter (replace `MockDocumentVerificationProvider`).
- Firebase config for live social sign-in exchange.
- Background Aspire stack from the E2E session may still be running — stop if not needed.
