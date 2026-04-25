# SnapAccount — Security Audit Report

> **Author:** Security Reviewer Agent
> **Date:** 2026-04-04
> **Version:** 1.0
> **Classification:** INTERNAL — Restricted
> **Scope:** Full codebase audit covering backend, admin frontend, mobile app, database schema, infrastructure, and CI/CD pipelines

---

## 1. Executive Summary

### Overall Security Posture: **HIGH RISK** (pre-launch)

SnapAccount has a well-designed security architecture with several strong foundations:
- OTP hashed with SHA-256 + phone salt before storage
- Refresh tokens hashed (SHA-256) and rotated on use
- Row-Level Security (RLS) policies on all user-owned database tables
- Workload Identity Federation (OIDC, no service account keys) in CI/CD
- Non-root Docker containers
- GCP Secret Manager for credential storage
- Data localization in asia-south1 (Mumbai) for DPDP Act compliance
- Aadhaar stored as last-4 digits only
- Explicit consent table with IP/device/timestamp

However, several critical and high-severity issues must be resolved before launch:

### Top 3 Findings That Must Be Fixed Before Launch

**1. SEC-001 (Critical) — Razorpay Webhook Signature Verification Not Implemented**
The `/subscriptions/razorpay/webhook` endpoint exists but returns `501 Not Implemented`. Without HMAC-SHA256 signature verification, any attacker can forge payment events, falsely crediting subscription upgrades.

**2. SEC-002 (Critical) — Wildcard CORS on All Backend Services**
`AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()` is configured in the AuthService (and likely all other services). This permits cross-origin requests from any domain, making CSRF and data exfiltration attacks possible.

**3. SEC-003 (Critical) — Hangfire Dashboard Exposed Without Authentication**
`app.UseHangfireDashboard("/hangfire")` is registered with no authorization policy. Any unauthenticated user who can reach the service URL can view, trigger, delete, and retry background jobs including sensitive operations.

---

## 2. Authentication & Authorization

### 2.1 OTP Implementation

**Finding:** OTP is hashed correctly using SHA-256 with a phone+OTP composite input before storage (`ComputeSha256Hash($"{phoneNumber}:{otp}")`). The plain OTP is never persisted to the database.

**Concern — OTP Generation Entropy:**
```csharp
var otp = Random.Shared.Next(100000, 999999).ToString();
```
`Random.Shared` is a pseudorandom generator. While statistically adequate for OTP generation in most contexts, it is not a cryptographically secure RNG. The correct approach is `RandomNumberGenerator.GetInt32(100000, 1000000)` from `System.Security.Cryptography`.

**Concern — Schema Comment vs Code Discrepancy:**
The database schema comment says `otp_hash VARCHAR(256) NOT NULL -- bcrypt hash of OTP` but the implementation uses SHA-256, not bcrypt. The schema comment is misleading; SHA-256 with phone salt is acceptable (and faster for OTP verification) but should be documented clearly.

**OTP Expiry:** Enforced — 5 minutes. PASS.
**Brute-Force Protection:** Enforced — 3 attempts, 30-minute cooldown. PASS.
**Cooldown Check:** Checked on both send and verify paths. PASS.

### 2.2 Firebase ID Token Validation

**Finding:** Firebase ID tokens are validated server-side via `FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken)` in `FirebaseAuthMiddleware`. This uses the Firebase Admin SDK which validates signature, expiry, audience, and issuer. PASS.

**Concern — Middleware Does Not Short-Circuit on Failed Tokens:**
```csharp
catch (FirebaseAuthException ex)
{
    // Do not short-circuit — let the endpoint's [Authorize] handle it
}
```
This is acceptable by design (the `[Authorize]`/`RequireAuthorization()` check handles rejection) but means an invalid token simply passes through without the `FirebaseUid` being set in `HttpContext.Items`. Ensure all protected endpoints use `RequireAuthorization()`. From code review, most do — see section 2.5 for the one exception found.

### 2.3 Refresh Token Handling

**Findings:**
- Refresh tokens are stored as SHA-256 hashes — plain token never stored. PASS.
- Refresh tokens are rotated on use (old token revoked, new token issued). PASS.
- 30-day expiry enforced. PASS.
- Refresh tokens are revoked on account deletion. PASS.
- `RefreshToken.IsValid` checks `!IsRevoked && !IsExpired && DeletedAt == null`. PASS.

**Concern — Missing Firebase Token Revocation on Logout:**
The `FirebaseAuthService.RevokeRefreshTokensAsync()` method exists, but there is no evidence it is called during the account deletion flow or explicit logout. Firebase ID tokens have a 1-hour TTL; if a user's refresh token is revoked but Firebase tokens are not explicitly revoked at the Firebase level, sessions can persist for up to 1 hour after logout/deletion.

### 2.4 Device Binding

**Finding:** Maximum 2 active devices per account is enforced in `User.AddDevice()` domain logic.
```csharp
var activeDeviceCount = _devices.Count(d => d.IsActive && d.DeletedAt == null);
if (activeDeviceCount >= 2)
    return Result.Failure(Error.Conflict(...));
```
PASS. However, this check is at the application layer only; no database constraint enforces this. A race condition could allow more than 2 devices if concurrent requests arrive simultaneously.

### 2.5 RBAC and Endpoint Authorization

**Finding:** The AuthService correctly uses `RequireAuthorization()` on all sensitive endpoints. The public endpoints (OTP send, OTP verify, token refresh, health check) correctly omit authorization.

**Critical Gap — GST, Loan, ITR, Subscription, and other services do not have authentication:**
```csharp
// GstService Program.cs
gst.MapGet("/returns", () => Results.Json(new { message = "Not yet implemented" }, statusCode: 501));
// No .RequireAuthorization()
```
All stub services (GstService, LoanService, ItrService, SubscriptionService, AccountingService, ChatService, NotificationService, ReportService, AiService) register their route groups without `RequireAuthorization()` and without adding `FirebaseAuthMiddleware`. When these endpoints are implemented, they must add the Firebase middleware and require authorization.

**Finding:** RBAC permission check is defined in the database schema and seed data (roles and permissions) but the application-layer enforcement (checking if a user has a specific permission before executing a command) is not yet implemented in the reviewed handlers. The `[Authorize CA/Admin]` comment in `ApproveReturnCommand.cs` indicates this is planned but not done.

---

## 3. Data Protection (DPDP Act 2023 Compliance)

### 3.1 Aadhaar Storage

**Finding:** The schema stores only `aadhaar_last4 VARCHAR(4)`. In the `UpdateUserProfileRequest` DTO, only `AadhaarLast4` is accepted. The full Aadhaar number is never stored. **PASS — Compliant with UIDAI guidelines.**

### 3.2 PAN Storage

**Finding:** PAN is stored in plaintext as `VARCHAR(10)` in `auth.user_profile.pan_number` and `auth.organization.pan_number`. PAN is considered sensitive PII under DPDP Act 2023. It should be encrypted at rest using application-level encryption (e.g., AES-256 with a KMS-managed key) rather than stored in plaintext. **MEDIUM RISK — PAN plaintext storage.**

### 3.3 Consent Capture

**Finding:** Two consent tables are present:
- `shared.consent_record` — General DPDP consent tracking with consent version, consent text hash, IP, device, user agent.
- `loan.loan_consent` — Loan-specific consent with full consent text, IP, device ID, timestamps, and revocability.

**PASS.** Consent infrastructure is well-designed. The loan consent explicitly captures the exact consent text shown to the user plus revocation capability.

### 3.4 Right to Erasure

**Finding:** `User.RequestAccountDeletion()` sets `IsDeleted = true`, `DeletedAt = now`, `IsActive = false`, and fires `AccountDeletionRequestedEvent`. The handler also revokes all refresh tokens. A `shared.data_deletion_request` table tracks erasure requests with legal hold support. **PASS.**

**Concern:** The erasure flow currently soft-deletes the `auth.user` record only. A full DPDP-compliant erasure must also anonymize or delete: user profile (PAN, Aadhaar last-4, address), organization data, documents, financial data, and AI embeddings. The `AccountDeletionRequestedEvent` should trigger cascading erasure across all 11 services. Evidence that this cross-service erasure is implemented was not found.

### 3.5 Audit Log Immutability

**Finding:** `shared.audit_log` is partitioned by month and has a comment `-- Audit log is APPEND-ONLY`. However, there is no PostgreSQL-level enforcement (e.g., no `DELETE` rule, no `RESTRICT` policy for delete operations). The RLS policy only restricts reads. An application bug or malicious insider with database access could delete audit records.

**Recommendation:** Add a PostgreSQL rule: `CREATE RULE no_delete_audit AS ON DELETE TO shared.audit_log DO INSTEAD NOTHING;` or use `pg_audit` + Cloud SQL audit logging as a second immutable trail.

### 3.6 Data Localization

**Finding:** All GCP resources are created in `asia-south1` (Mumbai). Cloud SQL, Cloud Storage, Secret Manager, Pub/Sub, Redis, and Artifact Registry all use this region. **PASS — Compliant with DPDP Act 2023 data localization requirement.**

### 3.7 Seven-Year Retention

**Finding:** Cloud Storage lifecycle policy transitions documents to NEARLINE at 1 year, COLDLINE at 2 years, ARCHIVE at 5 years, and deletes at 2557 days (approximately 7 years). **PASS.**

**Concern:** The database retention (PostgreSQL records) is not covered by this policy. Partitioned audit log tables cover 2026 only — no automation creates future partitions or enforces DB-level retention policies.

---

## 4. API Security

### 4.1 Authentication on Endpoints

**Finding:** AuthService public endpoints (OTP send/verify, token refresh, `/healthz`) are correctly unauthenticated. All other AuthService endpoints use `.RequireAuthorization()`. PASS for AuthService.

**Critical Gap:** All other 10 services (GstService, LoanService, etc.) do not yet add the `FirebaseAuthMiddleware` or `RequireAuthorization()`. These are stub services, but the pattern must be established before any endpoint goes live.

### 4.2 Rate Limiting

**Finding:** The database contains a `shared.api_rate_limit` configuration table and the project brief specifies `Cloud Armor + API Gateway` and `Memorystore (Redis)` for rate limiting. However, no rate limiting middleware was found in any service's `Program.cs`. The `aspnetcore` rate limiting middleware (`AddRateLimiter`) is not configured.

**High Risk:** OTP send and verify endpoints are particularly vulnerable without server-side rate limiting (the application-layer cooldown exists but relies on DB state which can be bypassed by changing phone numbers rapidly).

### 4.3 SQL Injection

**Finding:** All database access uses EF Core with LINQ queries and no raw SQL found in reviewed code. **PASS — SQL injection risk mitigated through parameterized queries.**

### 4.4 Input Validation

**Finding:** FluentValidation is registered: `builder.Services.AddValidatorsFromAssembly(...)` and the `ValidationBehavior` MediatR pipeline behavior is added in AuthService. A `SendOtpCommandValidator` is referenced in `Program.cs`. PASS for AuthService.

**Concern:** The `SendOtpRequest` record accepts a `PhoneNumber` string without visible format validation in the endpoint itself — validation is delegated to the FluentValidation pipeline. The validator implementation was not found in the searched files; it must enforce the Indian mobile format (starts with 6/7/8/9, exactly 10 digits).

### 4.5 CORS Configuration

**Critical Finding:**
```csharp
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));
```
`AllowAnyOrigin()` with credentials is a severe misconfiguration. This allows any website to make cross-origin requests to the API. For production, CORS must be restricted to known origins (admin panel domain, mobile app domain).

**Note:** `AllowAnyOrigin()` cannot be combined with `AllowCredentials()` in .NET — so this does not directly enable cross-origin credential theft. However, it does allow arbitrary origins to read API responses, which is inappropriate for a financial platform.

### 4.6 HTTPS Enforcement

**Finding:** Cloud Run enforces HTTPS termination at the load balancer level. The `--ingress=internal-and-cloud-load-balancing` flag on backend services means they are not directly publicly accessible. The admin panel uses `--ingress=all`. Backend services use `http://+:8080` internally which is correct for a containerized environment where TLS is terminated at the load balancer. **PASS** — with the caveat that the admin panel should explicitly redirect HTTP to HTTPS in the nginx config.

---

## 5. Secrets Management

### 5.1 Hardcoded Secrets

**Finding:** No hardcoded secrets found in application code. All credentials are loaded from configuration or environment variables.

**Concern — `GOOGLE_APPLICATION_CREDENTIALS` environment variable:**
```csharp
var urlSigner = UrlSigner.FromServiceAccountPath(
    Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS")
    ?? throw new InvalidOperationException("GOOGLE_APPLICATION_CREDENTIALS is not set."));
```
This pattern requires the service account JSON file to be present on disk. On Cloud Run with Workload Identity, this variable should not be needed — the Application Default Credentials (ADC) mechanism should be used instead. This code will fail on Cloud Run unless `GOOGLE_APPLICATION_CREDENTIALS` is explicitly set, which would require a service account key file — defeating Workload Identity Federation.

**Concern — Default database password in appsettings.json:**
```json
"DefaultConnection": "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql;Search Path=auth"
```
This development password appears in the checked-in `appsettings.json`. While intended for local dev only, the absence of a root `.gitignore` file means this file could be committed. Recommend moving even the dev connection string to `.env` / user secrets.

### 5.2 GCP Secret Manager Usage

**Finding:** All external credentials (Firebase, Razorpay, MSG91, etc.) are stored as Secret Manager secrets. The CI/CD pipeline fetches secrets at deploy time and injects them as environment variables. **PASS.**

### 5.3 `.env` in `.gitignore`

**Finding:** Only the `mobile/.gitignore` was found to exist as a root-level gitignore file. There is **no root `.gitignore`** for the repository. This means `.env` files at the repository root and `src/admin/` are not protected from accidental git commits. **HIGH RISK.**

### 5.4 Firebase Config in Frontend

**Finding:** The Firebase web config values (API key, auth domain, project ID, app ID) are passed as Vite build args and baked into the React bundle. Firebase web API keys are designed to be public (they identify the project, not authenticate to it) and are protected by Firebase Security Rules and authorized domains. **ACCEPTABLE** — this is the documented Firebase pattern.

---

## 6. Infrastructure Security

### 6.1 Service Accounts and Least Privilege

**Finding:** Thirteen separate service accounts are created, one per microservice. Each is granted only the IAM roles it needs. **PASS — Principle of least privilege is followed.**

**Concern:** The `document-service-sa` is granted `roles/storage.objectAdmin` which includes delete and overwrite capabilities. `roles/storage.objectCreator` + `roles/storage.objectViewer` would be more restrictive. However, document deletion may be a required operation for DPDP erasure.

### 6.2 Workload Identity Federation

**Finding:** GitHub Actions uses OIDC-based Workload Identity Federation (`gcloud iam workload-identity-pools providers create-oidc`) with attribute conditions scoped to the specific GitHub org and repository. No service account keys are created or used in CI/CD. **PASS — Best practice.**

### 6.3 Docker Container Non-Root

**Finding:**
- Backend Dockerfile: Creates `appuser` (UID 10001) and switches to it before running the application. **PASS.**
- Admin Dockerfile: Creates `appuser` (UID 10001) and switches to it. **PASS.**

### 6.4 VPC Configuration

**Finding:** All backend microservices are deployed with `--ingress=internal-and-cloud-load-balancing` and `--vpc-connector=snapaccount-vpc-connector` with `--vpc-egress=private-ranges-only`. Services are not directly publicly accessible. **PASS.**

**Concern:** The admin panel is deployed with `--ingress=all` and `--allow-unauthenticated`. This is correct for a web app but means the admin panel's Cloud Run service itself is publicly reachable. Authentication is handled by Firebase Auth at the application level, which is acceptable, but IP allowlisting for admin access should be considered.

### 6.5 GitHub Actions Secrets

**Finding:** GitHub Actions uses Variables (not Secrets) for non-sensitive values (project ID, region, etc.) and fetches sensitive values from Secret Manager at deploy time. The workflow uses `permissions: contents: read; id-token: write` which is correctly scoped. **PASS.**

**Concern:** The CI workflow injects `VITE_FIREBASE_API_KEY: ci-placeholder-not-a-real-key` for the build step — this is correct for CI since the actual key is pulled from Secret Manager in the CD workflow. **PASS.**

### 6.6 Hangfire Dashboard

**Critical Finding:** The Hangfire dashboard is exposed at `/hangfire` with no authentication in the AuthService:
```csharp
app.UseHangfireDashboard("/hangfire");
```
By default, Hangfire only restricts access to `localhost`. On Cloud Run with `--ingress=internal-and-cloud-load-balancing`, this may be internally accessible to other services and potentially via the load balancer. The dashboard must be protected:
```csharp
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new HangfireAdminDashboardAuthorizationFilter()]
});
```

---

## 7. Indian Financial Compliance Security

### 7.1 GST Rate Versioning

**Finding:** `GstTaxRate` entity uses `ValidFrom` / `ValidTo` temporal columns. Rates with `ValidTo == null` are currently active. The `GstTaxRate.Create()` factory method is private-set, preventing arbitrary mutation. **PASS.**

**Concern:** Rate manipulation risk: The `shared.system_configuration` table allows admin-configurable values. If tax rates are also exposed through this table without separate access controls, an internal threat actor could manipulate tax calculations. Tax rates in `gst.gst_tax_rate` should only be modifiable by `SYSTEM_ADMIN` role with mandatory audit log entries.

### 7.2 Loan Consent

**Finding:** `loan.loan_consent` table captures: exact consent text, consent version, `is_granted`, `granted_at` timestamp, `ip_address` (INET type), `device_id`, and revocation fields. **PASS — Compliant with RBI digital lending guidelines.**

### 7.3 ITR Data Tamper-Evidence

**Finding:** The `shared.audit_log` records `old_values` and `new_values` as JSONB for all financial modifications. However, the audit log immutability concern from Section 3.5 applies — the log is not cryptographically signed or protected at the DB level.

**Concern:** Tax computation results (`itr.tax_computation` table) should have an integrity hash (SHA-256 of the computation inputs and output) stored alongside the result. This was not found in the reviewed schema.

### 7.4 Partner Bank API Credential Isolation

**Finding:** `loan.partner_bank.api_key_secret_ref` stores a GCP Secret Manager reference, not the actual API key. Each bank's credentials are stored as separate secrets. **PASS — Per-bank credential isolation is implemented.**

### 7.5 Razorpay Webhook Signature Verification

**Critical Finding:** The Razorpay webhook endpoint at `/subscriptions/razorpay/webhook` returns `501 Not Implemented`. When implemented, Razorpay webhooks must be verified using HMAC-SHA256:
```csharp
var expectedSignature = HMACSHA256(razorpayWebhookSecret, rawRequestBody);
if (receivedSignature != expectedSignature) return Results.Unauthorized();
```
Without this, any HTTP client can forge payment webhook events and trigger subscription upgrades. The `PaymentGatewaySettings.tsx` UI captures a webhook secret field, which is the correct approach — but the backend verification is missing.

---

## 8. Mobile Security

### 8.1 API Keys / Firebase Config in Bundle

**Finding:** The mobile app uses `@react-native-firebase/app` which loads Firebase configuration from platform-native files (`google-services.json` on Android, `GoogleService-Info.plist` on iOS). These files are listed in `mobile/.gitignore` and are not committed to the repository. **PASS.**

**Concern:** The API base URL is sourced from `expo-constants` (`Constants.expoConfig?.extra?.apiBaseUrl`) which is baked into the app bundle at build time. This is acceptable and does not expose secrets.

### 8.2 Auth Token Storage

**Finding:** The `authStore.ts` uses `expo-secure-store` as the persistence backend for Zustand:
```typescript
const secureStorage = {
  getItem: async (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => SecureStore.setItemAsync(key, value),
};
```
Auth state is persisted to `expo-secure-store` (iOS Keychain, Android Keystore). **PASS.**

**Concern:** The `firebaseToken` is explicitly excluded from persistence (`// Note: firebaseToken NOT persisted — always refreshed from Firebase`). However, `isAuthenticated: true` and `user` data (including phone number) are persisted to SecureStore. The `user.panNumber` field is included in the `UserProfile` type — if PAN is ever set on the user object and the full profile is persisted, PAN would be stored in SecureStore. SecureStore is encrypted at the OS level, so this is lower risk, but PAN should be excluded from the persisted partialize.

### 8.3 Certificate Pinning

**Finding:** No certificate pinning was found in the mobile codebase. For a financial application handling sensitive PII and payment data, certificate pinning (or at minimum, public key pinning) should be considered to prevent MITM attacks using rogue CA certificates.

### 8.4 Aadhaar Display Masking

**Finding:** The schema stores only `aadhaar_last4`. The mobile auth store type includes `aadhaarVerified: boolean` but does not include any Aadhaar digits. Display masking is inherently guaranteed by never storing or transmitting the full number. **PASS.**

### 8.5 Screenshot Protection on Sensitive Screens

**Finding:** No screenshot prevention (e.g., `FLAG_SECURE` on Android, `UITextField.isSecureTextEntry` patterns on iOS) was found in the mobile screens. ITR documents, GST returns, loan applications, and bank details screens should prevent screenshots at the OS level.

---

## 9. Findings Table

| ID | Severity | Component | Finding | Recommendation | Status |
|----|----------|-----------|---------|----------------|--------|
| SEC-001 | Critical | SubscriptionService | Razorpay webhook endpoint returns 501 — no signature verification implemented | Implement HMAC-SHA256 webhook signature verification before launch | OPEN |
| SEC-002 | Critical | AuthService (all services) | CORS configured with `AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()` | Restrict CORS to specific allowed origins per environment | OPEN |
| SEC-003 | Critical | AuthService | Hangfire dashboard at `/hangfire` exposed without authentication | Add `HangfireDashboardAuthorizationFilter` requiring SYSTEM_ADMIN role | OPEN |
| SEC-004 | High | All non-Auth services | Stub endpoints have no `FirebaseAuthMiddleware` or `RequireAuthorization()` | Establish authentication pattern before any stub endpoint goes live | OPEN |
| SEC-005 | High | OtpService | OTP generated with `Random.Shared` (non-cryptographic) | Use `RandomNumberGenerator.GetInt32(100000, 1000000)` instead | OPEN |
| SEC-006 | High | Repository root | No root `.gitignore` — `.env` files at repo root and `src/admin/` are unprotected | Add root `.gitignore` including `.env`, `*.env.local`, `*.json` credential files | OPEN |
| SEC-007 | High | DPDP Compliance | Account deletion does not cascade erasure across all 11 services | Implement cross-service erasure via `AccountDeletionRequestedEvent` | OPEN |
| SEC-008 | High | AuthService | Firebase session tokens not revoked server-side on logout/deletion | Call `RevokeRefreshTokensAsync()` on account deletion and logout | OPEN |
| SEC-009 | High | GoogleCloudStorageService | Signed URL generation uses `GOOGLE_APPLICATION_CREDENTIALS` file — incompatible with Workload Identity on Cloud Run | Use `UrlSigner.FromServiceAccountId()` with ADC or IAM service account impersonation | OPEN |
| SEC-010 | High | Database | `shared.audit_log` has no delete restriction — no immutability enforcement at DB level | Add PostgreSQL rule `CREATE RULE no_delete_audit AS ON DELETE TO shared.audit_log DO INSTEAD NOTHING` | OPEN |
| SEC-011 | High | Backend (all services) | No application-level rate limiting middleware configured | Add `AddRateLimiter` middleware with Redis-backed counters for OTP, auth, and financial endpoints | OPEN |
| SEC-012 | High | RBAC | Permission checks are planned but not implemented in any command handler | Add permission check in MediatR pipeline behavior or per command handler before launch | OPEN |
| SEC-013 | Medium | auth.user_profile | PAN number stored in plaintext | Encrypt PAN at application layer using AES-256 with GCP KMS-managed key | OPEN |
| SEC-014 | Medium | Mobile | No certificate pinning | Implement TLS certificate pinning for API calls on Android and iOS | OPEN |
| SEC-015 | Medium | Mobile | No screenshot prevention on sensitive screens | Add `FLAG_SECURE` (Android) and equivalent iOS protections on ITR, GST, loan screens | OPEN |
| SEC-016 | Medium | Auth device binding | Device limit (max 2) enforced only at application layer — race condition possible | Add database-level check or pessimistic locking in `AddDevice` transaction | OPEN |
| SEC-017 | Medium | Admin panel | Admin panel Cloud Run service is `--allow-unauthenticated --ingress=all` | Consider IP allowlisting or Cloud Identity-Aware Proxy (IAP) for admin panel | OPEN |
| SEC-018 | Medium | AuthService | Root-level `.gitignore` missing means `appsettings.json` dev credentials could be committed | Move dev DB connection string to user secrets (`dotnet user-secrets`) | OPEN |
| SEC-019 | Medium | Database | Audit log partition tables only cover 2026; no automation for future partitions | Create a pg_cron or Cloud Scheduler job to auto-create monthly partitions | OPEN |
| SEC-020 | Medium | ITR | Tax computation results have no integrity hash | Add SHA-256 hash of computation inputs stored alongside results | OPEN |
| SEC-021 | Low | OtpService | Schema comment says bcrypt; code uses SHA-256 | Update schema comment to accurately reflect SHA-256 implementation | OPEN |
| SEC-022 | Low | AuthService | `FirebaseAuthMiddleware` does not short-circuit on token failure | Document the intended behavior; add warning log when token is present but invalid and `RequireAuthorization` is not set | OPEN |
| SEC-023 | Low | Mobile | `user.panNumber` is in `UserProfile` type — could be persisted to SecureStore | Exclude `panNumber` from the `partialize` function in `authStore.ts` | OPEN |
| SEC-024 | Low | document-service-sa | Granted `roles/storage.objectAdmin` — more than required | Reduce to `roles/storage.objectCreator` + `roles/storage.objectViewer` unless deletion is required | OPEN |
| SEC-025 | Low | Cloud Run admin | No HTTP-to-HTTPS redirect in nginx config | Add redirect in `nginx.conf`: `return 301 https://$host$request_uri` | OPEN |

---

## 10. Compliance Checklist

### DPDP Act 2023

- [x] Explicit consent before data processing (`shared.consent_record`)
- [x] Consent is versioned and timestamped with IP + device
- [x] Right to erasure — account deletion endpoint and `data_deletion_request` table
- [ ] Cross-service erasure cascade not implemented (SEC-007)
- [x] Data localization — all resources in asia-south1
- [x] Aadhaar masked — only last-4 stored
- [ ] Breach notification workflow not implemented (72-hour requirement)
- [x] 7-year retention on Cloud Storage with lifecycle policies
- [ ] Database retention policy not automated
- [ ] Data processing register / Privacy Policy URL not observed in codebase

### RBI Digital Lending Guidelines

- [x] Explicit loan consent with timestamp, IP, device ID
- [x] Consent revocable
- [x] Interest rate display fields in `loan.loan_offer`
- [x] Loan consent text stored verbatim
- [ ] Fair Practices Code implementation not verifiable from code
- [ ] Cooling-off period implementation not found

### UIDAI Aadhaar Guidelines

- [x] Full Aadhaar number never stored
- [x] Only last-4 digits stored in `auth.user_profile.aadhaar_last4`
- [x] eKYC consent flow present (`OtpType = KYC_AADHAAR` in OTP system)
- [ ] Aadhaar OTP verification uses UIDAI API — integration not yet implemented (TODO in OtpService)

### ICAI CA Audit Requirements

- [x] Immutable audit log table (`shared.audit_log`)
- [x] `old_values` / `new_values` stored for financial modifications
- [x] `actor_user_id` and `actor_type` in all audit entries
- [ ] Audit log immutability not enforced at DB level (SEC-010)
- [ ] CA digital signature workflow not observed in code

### PCI-DSS Considerations (Razorpay Integration)

- [x] Card data handled entirely by Razorpay — SnapAccount never touches card numbers
- [x] Razorpay is the payment processor; SnapAccount is in SAQ A scope (lowest)
- [ ] Razorpay webhook signature verification not implemented (SEC-001 — Critical)
- [x] Webhook secret UI field present in admin settings
- [ ] No TLS version enforcement found (ensure TLS 1.2+ minimum)

### GST Portal API Security

- [x] GST portal credentials stored in Secret Manager (`gst-portal-client-id`, `gst-portal-client-secret`)
- [x] GST tax rates use temporal versioning
- [ ] GST rate modification access control not enforced (SEC-012)
- [ ] GST portal API integration not yet implemented (TODO stubs)

---

## 11. Recommendations by Priority

### Priority 1 — Before Any Production Traffic

**P1.1 — Implement Razorpay Webhook Signature Verification (SEC-001)**
Add HMAC-SHA256 verification in `SubscriptionService`. Load the webhook secret from Secret Manager. Reject any webhook request whose `X-Razorpay-Signature` header does not match.
```csharp
var expectedSig = HMACSHA256(webhookSecret, requestBody);
if (!CryptographicOperations.FixedTimeEquals(
    Convert.FromHexString(receivedSig),
    expectedSig)) return Results.Unauthorized();
```

**P1.2 — Restrict CORS to Known Origins (SEC-002)**
Replace `AllowAnyOrigin()` with explicit origin allowlist:
```csharp
options.AddDefaultPolicy(p => p
    .WithOrigins("https://admin.snapaccount.in", "https://snapaccount.in")
    .AllowAnyMethod()
    .AllowAnyHeader()
    .AllowCredentials());
```

**P1.3 — Secure Hangfire Dashboard (SEC-003)**
```csharp
app.UseHangfireDashboard("/hangfire", new DashboardOptions {
    Authorization = [new HangfireSystemAdminFilter()]
});
```
`HangfireSystemAdminFilter` should check the `FirebaseDecodedToken` claims for the `SYSTEM_ADMIN` role.

### Priority 2 — Within Sprint Before Launch

**P2.1 — Add `FirebaseAuthMiddleware` and `RequireAuthorization()` to All Service Stubs (SEC-004)**
Establish this as a mandatory pattern in the service template. Create a shared extension method that adds the middleware and sets the authorization defaults.

**P2.2 — Implement Application-Level Rate Limiting (SEC-011)**
Add `builder.Services.AddRateLimiter(...)` using Redis sliding window for OTP endpoints (max 5 requests per phone per 10 minutes) and fixed window for authenticated endpoints.

**P2.3 — Replace `Random.Shared` with `RandomNumberGenerator.GetInt32` (SEC-005)**
One-line fix with high impact on OTP security.

**P2.4 — Revoke Firebase Session on Logout and Account Deletion (SEC-008)**
Call `firebaseAuthService.RevokeRefreshTokensAsync(user.FirebaseUid)` in the account deletion handler and any logout endpoint.

**P2.5 — Add Root `.gitignore` (SEC-006)**
Create `/Users/gtmkumar/Documents/source/snapaccount/.gitignore` covering `.env*`, `*.env.local`, `google-services.json`, `GoogleService-Info.plist`, `*.pfx`, `*.p12`, `*.pem`, and `appsettings.*.json` (non-base settings files).

### Priority 3 — Within Month of Launch

**P3.1 — Implement RBAC Permission Checks (SEC-012)**
Add a `PermissionBehavior<TRequest, TResponse>` MediatR pipeline behavior that reads required permissions from a command attribute and validates against the current user's roles.

**P3.2 — Implement Cross-Service DPDP Erasure (SEC-007)**
The `AccountDeletionRequestedEvent` should be published to a Pub/Sub topic. Each service subscribes and anonymizes/deletes user data within its schema. Implement a saga or choreography pattern.

**P3.3 — Fix Signed URL Generation for Cloud Run (SEC-009)**
Replace `UrlSigner.FromServiceAccountPath(GOOGLE_APPLICATION_CREDENTIALS)` with:
```csharp
var credential = await GoogleCredential.GetApplicationDefaultAsync();
var urlSigner = UrlSigner.FromCredential(credential);
```

**P3.4 — Enforce Audit Log Immutability at DB Level (SEC-010)**
Add PostgreSQL `RULE` or enable point-in-time recovery logs as a secondary immutable record.

**P3.5 — Encrypt PAN at Rest (SEC-013)**
Use GCP Cloud KMS with a DEK/KEK pattern. Encrypt PAN before writing to DB, decrypt on authorized read.

### Priority 4 — Quarterly Review

**P4.1 — Certificate Pinning for Mobile (SEC-014)**
Use a library like `react-native-ssl-pinning` with SHA-256 hashes of the API server's public key.

**P4.2 — Screenshot Prevention on Sensitive Screens (SEC-015)**
Use `expo-screen-capture` to disable screenshots on ITR, GST, and loan screens.

**P4.3 — Breach Notification Workflow**
Implement an automated breach detection and notification workflow that satisfies the DPDP Act's 72-hour notification requirement.

**P4.4 — Automated Audit Log Partition Management**
Create a Cloud Scheduler job or `pg_cron` function that creates monthly `shared.audit_log` partitions one month in advance.

**P4.5 — Penetration Testing**
Conduct a third-party penetration test before launch covering OWASP Top 10, Indian-specific regulatory requirements, and React Native app security.

---

*End of Security Audit Report*
*Next review: 2026-07-04 (quarterly)*
