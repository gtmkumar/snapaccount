# Handoff — Mobile↔Backend integration, Expo upgrade, RBAC, password auth, Android

**Date:** 2026-06-02
**Branch:** `feat/mobile-backend-integration` (commit `503eff0`, 35 files) — **not merged, not pushed.**
Base: `main` @ `f6a88d3`. Merge to main: `git checkout main && git merge --ff-only feat/mobile-backend-integration`.

---

## What shipped this session

### 1. Mobile app wired to the real backend (was a mock/demo)
- `mobile/src/lib/api.ts`: per-service base URLs (auth `:5101`, documents `:5047`), bearer from auth store, `resolveHost()` rewrites `localhost`→`10.0.2.2` on Android, strips Content-Type for `FormData` (lets RN set the multipart boundary).
- Signup rewired to real endpoints: PhoneEntry→`/auth/otp/send`, OTPVerify→`/auth/otp/verify`, BusinessProfileWizard→`PUT /auth/profile` + `POST /auth/organizations`. New users keep token via `setSession`; `isAuthenticated` flips only when onboarding completes (`markAuthenticated`).
- `firebase.ts` mock starts logged-out; `RootNavigator` drives auth from the store.

### 2. Backend dev bridge (free, GCP-free local)
- `FirebaseAuthService.CreateCustomTokenAsync` mints a **LOCAL_AUTH HS256 JWT** when `LOCAL_AUTH`/`DEV_AUTH_BYPASS` is set (Firebase isn't configured locally). The shared `FirebaseAuthMiddleware` LOCAL_AUTH path accepts it across services.
- DocumentService GCP-free fallbacks behind `GcpStartup.IsEnabled`: `LocalFileStorageService`, `NoOpPubSubPublisher`, `DevOcrJobEnqueuer` (completes OCR inline with a stub → scans reach PROCESSED).
- Fixed DocumentService missing `ToTable` mappings (`document.Documents`→`document.document`); upload defaults a doc's org to the uploader's org so it shows in the admin customer list.

### 3. Expo SDK 52→56 (RN 0.76→0.85, React 18→19)
- Required to build on **Xcode 26.4** (old stack hit fmt/AFNetworking/ReactCommon walls; RN 0.85 uses prebuilt core).
- Removed unused native libs (`@react-native-firebase/*`, `react-native-ssl-pinning`, `react-native-otp-verify`, chart libs); added `react-native-worklets`, `@expo/config-plugins`; `mobile/.npmrc` `legacy-peer-deps=true`.
- Fixed `CameraScreen` Fabric crash (overlays were children of `<CameraView>` → now siblings) + FlashMode `screen` case; `tsconfig` `ignoreDeprecations`.

### 4. Action-level RBAC (closes HANDOFF-action-level-rbac.md)
- New `src/admin/src/components/shared/Can.tsx`; Documents page gates Review/Export (`document.read`) and Assign (`document.update`).
- `database/migrations/046_*`: grant `DATA_ENTRY_OPERATOR` → `document.read` + `document.update` (applied to local DB).
- `DocumentQueuePage.test.tsx` updated; **807 admin tests pass.**

### 5. Phone+password auth (SMS-free) + configurable methods
- `POST /auth/password/register`, `POST /auth/password/login` (PBKDF2 via `IPasswordHasher.Verify` added).
- `GET /auth/methods` (config-driven, auto-detects SMS via `Msg91:OtpAuthKey`; overrides `Auth:Methods:{Otp,WhatsApp,Password}`). Rule: when OTP/WhatsApp enabled, clients **hide** the password option.
- Mobile `PasswordAuthScreen` (login/register toggle) + `useAuthMethods` hook + PhoneEntry gating.

### 6. Firebase + security
- Firebase admin service account (project `snap-account`) stored in **AuthService dotnet user-secrets** (`Firebase:ServiceAccountJson`, `GCP:ProjectId`). Loose key file deleted; `.gitignore` now ignores `*firebase-adminsdk*.json` / `*-adminsdk-*.json`.
- Free-tier: local dev uses MSG91 dev-OTP + LocalJwt (no Firebase SMS cost). Document AI / paid GCP kept OFF.

---

## Verified working
- **iOS** (iPhone 16e, iOS 26.4 sim) and **Android** (android-36 emulator): app builds, runs, reaches backend, logs in, lands on the **dashboard** (shows "Test Traders" business).
- Signup creates a real customer → appears in **admin Users page** (Asha Mehta / Asha Enterprises / GSTIN, PAN masked).
- Document upload → OCR stub → **PROCESSED** → in list (curl + in-app).
- Phone+password register/login (401 on bad password).

## Known issues / follow-ups
1. **Only AuthService(:5101) + DocumentService(:5047) run locally.** GST/ITR/Loans/Chat mobile tabs render but hang or show mock data (their services aren't up, and the mobile only routes `/documents` separately — everything else → :5101). Run all 12 via Aspire + add per-service routing for full coverage.
2. **Documents "NaN documents"** count bug; in-app multipart upload was stuck pre-fix (api.ts fix applied; needs a clean re-test — sim camera produces blank images, `addmedia` is broken on this CoreSimulator).
3. **`PUT /auth/profile` 500s for brand-new users** (no `user_profile` row → DbUpdateConcurrencyException) — wizard treats it best-effort; business data (org) still flows. Pre-existing backend bug.
4. **Upgrade type-debt**: RN 0.85/React 19 surfaced ~8 `tsc` errors in untouched files (`absoluteFillObject`, `NotificationBehavior`, etc.) — don't affect runtime; separate cleanup.
5. **UI automation note**: the 6-box OTP field + custom `components/ui/Input` drop synthetic input (idb/adb) — login automation needs digit-by-digit + tapping "Verify & Continue". Not an app bug.

## How to run locally (free, GCP-free)
```
# Backend (from backend/, each its own terminal)
ASPNETCORE_ENVIRONMENT=Development LOCAL_AUTH=true ASPNETCORE_URLS=http://localhost:5101 \
  dotnet run --no-launch-profile --project Services/AuthService/AuthService.Api
ASPNETCORE_ENVIRONMENT=Development LOCAL_AUTH=true ASPNETCORE_URLS=http://localhost:5047 \
  ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgres;Search Path=document" \
  dotnet run --no-launch-profile --project Services/DocumentService/DocumentService.Api
# Mobile:  cd mobile && npx expo run:ios   (or run:android — JAVA_HOME=openjdk@17, AVD snap_pixel/android-36)
# Admin:   already on :3000 (Vite proxies /api/auth -> :5101). Login admin@snapaccount.local / Admin@12345
# OTP in dev: grep the AuthService console for "OTP for <phone>:"
```
Full mobile↔backend + Android details: see memory `mobile-backend-local-dev.md`.
