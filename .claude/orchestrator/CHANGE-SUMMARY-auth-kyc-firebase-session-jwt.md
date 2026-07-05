# Change Summary — Real KYC adapter + Firebase social sign-in + backend-issued session JWT

**Date:** 2026-06-04
**Branch:** `main` (working tree — **NOT committed, no PR**)
**Scope:** AuthService (backend), shared auth infrastructure (all 12 services), mobile social sign-in
**Status:** ✅ All builds + tests green. ⚠️ One security action + one stray-file cleanup outstanding (see bottom).

---

## ⚠️ Action required before any commit/deploy

1. **Rotate the leaked service-account key** — private key id `34df0854aa…` was printed into a session transcript (a `user-secrets list` dump). Rotate in Firebase Console → Project settings → Service accounts → Manage keys (delete + create new), then reload the new JSON into Platform.WebApi user-secrets as `Firebase:ServiceAccountJson`.
2. **Remove stray root files** — `package.json` + `package-lock.json` at the repo root pin `firebase ^12.14.0`. The social flow uses the Firebase **REST** API (`signInWithIdp`) and imports no JS SDK, so these are dead weight. Delete both before committing.
3. **Prod config** — set `SESSION_JWT_SECRET` (≥32 chars) in Secret Manager for every deployed service. Without it, services fall back to the insecure dev default.

---

## 1. Real KYC government-verification adapter (Task 1)

Replaces the mock with a real Sandbox/Quicko (api.sandbox.co.in) provider, exercised only on the toggle-ON (`government_verification_enabled`) path. Honors the OTP-vs-direct asymmetry: Aadhaar is a genuine 2-step OTP; PAN/GSTIN/TAN are direct lookups whose verdict is sealed into an AES verdict token so the send→confirm contract stays stateless.

**New files**
- `AuthService.Infrastructure/Configuration/KycProviderOptions.cs` — config binding (Provider/BaseUrl/ApiVersion/ApiKey/ApiSecret/Timeout/TokenTtl/Consent/Reason/Endpoints), `FromConfiguration`, `HasCredentials`.
- `AuthService.Infrastructure/Services/Kyc/SandboxAccessTokenProvider.cs` — singleton access-token cache (23h, semaphore-guarded), `GetTokenAsync(ct, forceRefresh)`, `KycProviderException`.
- `AuthService.Infrastructure/Services/Kyc/KycVerdictTokenCodec.cs` — `Encode/Decode` AES verdict token (via `IEncryptionService`) carrying non-OTP direct-verify results.
- `AuthService.Infrastructure/Services/Kyc/SandboxKycProvider.cs` — implements `IDocumentVerificationProvider` + `IKycProvider`; named HttpClient `SandboxKyc`; 401-refresh-retry, 4xx→not-verified, 5xx→exception.
- `AuthService/KYC-PROVIDERS.md` — integration doc.
- `tests/unit/AuthService/SandboxKycProviderTests.cs` — 19 tests (mocked `HttpMessageHandler`).

**Edits**
- `IDocumentVerificationProvider.cs` — added `string ProviderName { get; }`.
- `MockDocumentVerificationProvider.cs` — `ProviderName => "mock"`.
- `SendDocumentOtpCommand.cs` — persists `Provider = verificationProvider.ProviderName` (was hardcoded `"mock"`).
- `DependencyInjection.cs` — `KYC_PROVIDER=sandbox` registration (named HttpClient + singleton token provider + scoped codec/provider); mock otherwise.
- `appsettings.json` — `Kyc` section (no secrets; key/secret come from env/user-secrets).

> Live calls need real `KYC_API_KEY` / `KYC_API_SECRET`; until then `KYC_PROVIDER` stays unset → mock.

---

## 2. Firebase social sign-in wiring (Task 2)

Wired the **`snap-account`** project (note the hyphen; #754356628614, CLI account dev.gtmkumar@gmail.com) and Google provider.

- `mobile/app.json` — `extra.firebase` web config (apiKey is non-secret) + `extra.googleAuth.webClientId`.
- `.env.example` — `FIREBASE_PROJECT_ID=snap-account`.
- Backend service-account JSON loaded into Platform.WebApi user-secrets (`Firebase:ServiceAccountJson`).

### Three bugs found by live-testing the "already implemented" flow

| Bug | Symptom | Fix |
|-----|---------|-----|
| **A** | mobile posted `{idToken}`, backend expected `{firebaseIdToken}` → always 400 | `mobile/src/lib/socialAuth.ts` now posts `{firebaseIdToken, provider}` |
| **B** | malformed bearer threw uncaught `FormatException` → **500** | broadened catch in `FirebaseAuthService` + middleware → **401**, never 500 |
| **C** | backend returned a Firebase **custom token** as the session bearer, but shared middleware validates **ID tokens** → every post-login call 401s | architectural fix below (user chose "backend-issued session JWT", all flows) |

---

## 3. Bug C — backend-issued session JWT for ALL login flows

Backend now mints its own SnapAccount session token for every issuance site (OTP / password / 2FA / social / refresh). Firebase only verifies the *initial* social identity; the shared middleware validates the SnapAccount JWT everywhere.

- **NEW** `Shared/SnapAccount.Shared.Infrastructure/Auth/SessionTokenSecret.cs` — unified secret resolver: `Auth:SessionSecret` → `SESSION_JWT_SECRET` → `LOCAL_AUTH` secret → `FirebaseAuthMiddleware.DefaultLocalSecret`.
- `FirebaseAuthService.CreateCustomTokenAsync` — mints an HS256 session JWT (existing `LocalJwt` codec) carrying `userId/organizationId/roles/permissions`, resolved via `EffectivePermissionResolver` (wildcard `["*"]` for SUPER_ADMIN; wildcard in dev to preserve local mobile). Added `IAuthDbContext` dependency + `BuildSessionClaimsAsync`. Interface name kept → **5 handlers + 7 mocking tests unchanged**.
- `FirebaseAuthMiddleware.cs` — validates session JWT first (`SessionJwt` auth type); Firebase `VerifyIdToken` kept as fallback **only when `FirebaseApp.DefaultInstance is not null`**, wrapped so unverifiable tokens never 500; DEV_AUTH_BYPASS canned tokens unchanged.
- `RefreshTokenCommand.cs` — passes `userId` so refreshed tokens resolve full claims.
- `LocalAuthService.cs` — uses the same `SessionTokenSecret.Resolve`.
- **NEW** `tests/unit/AuthService/SessionTokenJwtTests.cs` — 9 tests (service + middleware).
- `tests/integration/AuthService/AddUserApiTests.cs` — fixed a **pre-existing** repo bug: `LocalLoginDto` read `accessToken`; the endpoint returns `token`.

---

## Validation

- **AuthService unit: 553 green** (9 new) · **integration: 102 green** (matches baseline).
- Full **12-service backend build clean** (0 warnings / 0 errors).
- Live curl: bogus / malformed bearer → **401, zero 500s**; Firebase Admin initialises with the service account; backend boots clean in real-Firebase mode (`DEV_AUTH_BYPASS=false LOCAL_AUTH=false SESSION_JWT_SECRET=…`).
- Background backend stopped; port 5101 clear.

## Not yet done

- **Interactive Google-consent E2E** in a simulator (real consent → session JWT → bearer works). Needs the simulator + possibly an OAuth redirect-URI (`snapaccount://` / Expo proxy) registered in the Firebase/GCP console.
- **Commit / PR** — none of this is committed; it sits on top of the merged PR #32 work.
- Pre-existing admin **"Pending Invites — Couldn't load invites"** bug (out of scope, noted only).
