# SnapAccount Security Review Report

> **Classification:** INTERNAL — Restricted
> **Reviewer:** security-reviewer agent
> **Last Updated:** 2026-06-11

---

## Cumulative Summary (All Phases)

| Phase | CRITICAL | HIGH | MEDIUM | LOW | INFO | Status |
|-------|----------|------|--------|-----|------|--------|
| 4 (original audit) | 3 | 9 | 8 | 5 | 0 | Complete — all findings documented in security-audit.md |
| 5 (re-audit / fix verification) | 0 | 1 | 1 | 1 | 2 | Complete |
| 6 (6A+6E final gate) | 0 | 4 | 5 | 3 | 3 | Complete |
| 6 (re-audit 2026-04-25) | 0 | 0 | 0 | 0 | 0 | Complete — 4 HIGH confirmed fixed; no new findings |
| 6B+6D (2026-04-25) | 0 | 3 | 3 | 1 | 1 | Complete — NO-GO |
| 6B+6D re-audit (2026-04-25) | 0 | 0 | 0 | 0 | 0 | Complete — GO; 4 confirmed fixed, 0 new findings |
| 6C (2026-04-25) | 0 | 1 | 5 | 0 | 2 | Complete — NO-GO |
| 6C re-audit (2026-04-25) | 0 | 0 | 0 | 0 | 0 | Complete — GO; 4 confirmed fixed, 0 new findings |
| 6F Final Gate (2026-04-25) | 0 | 1 | 5 | 1 | 2 | Complete — NO-GO (SEC-051 HIGH + prior deferred unresolved) |
| 6F Re-audit after hotfixes (2026-04-25) | 0 | 0 | 0 | 0 | 2 | Complete — **GO** — 1 HIGH + 7 MED confirmed fixed; 0 new HIGH/MED/LOW |
| Module 1 Auth/RBAC (2026-05-29) | 1 | 3 | 3 | 2 | 2 | Complete — **NO-GO** (initial review; implementation was pre-code) |
| Module 1 Auth/RBAC Re-review (2026-05-29) | 0 | 1 | 1 | 1 | 2 | Complete — **GO with conditions** |
| Increment 1.1 — Permission Catalog Mgmt + OrgContextGuard (2026-05-29) | 0 | 0 | 1 | 1 | 1 | Complete — **GO** |
| **Total (Phases 4–Increment 1.1)** | **4** | **21** | **29** | **14** | **15** | — |
| **Total open (pre-prod blockers)** | **0** (M1-001 backlogged) | **2** (NEW-002, M1-R-001) | **6** (SEC-030/031/032/041 deferred + M1-R-002 + I1.1-001) | **7** (SEC-035/036/037/056/NEW-003 + M1-R-003 + I1.1-002) | **6** (INFO-001/006/007 + M1-R-INFO-001/002 + I1.1-INFO-001) | Increment 1.1: **GO** |
| Increment 1.3 — Add User + user_permission + Assignable Roles (2026-05-29) | 0 | 1 | 1 | 1 | 1 | Complete (initial) — **NO-GO** |
| Increment 1.3 Re-confirm after I1.3-001 fix (2026-05-29) | 0 | 0 | 0 | 0 | 0 | I1.3-001 FIXED — **GO** |
| **Total (Phases 4–Increment 1.3 final)** | **4** | **21** | **30** | **15** | **16** | — |
| **Total open (pre-prod blockers)** | **0** | **2** (NEW-002, M1-R-001) | **7** (deferred + M1-R-002 + I1.1-001 + I1.3-002) | **8** (deferred + M1-R-003 + I1.1-002 + I1.3-003) | **7** (INFO-001/006/007 + M1-R-INFO-001/002 + I1.1-INFO-001 + I1.3-INFO-001) | Increment 1.3: **GO** |
| Increment 1.4 Phase A — Reference-Data CRUD (2026-05-29) | 0 | 0 | 0 | 1 | 1 | Complete — **GO** |
| **Total (Phases 4–Increment 1.4A)** | **4** | **21** | **30** | **16** | **17** | — |
| **Total open (pre-prod blockers)** | **0** | **2** (NEW-002, M1-R-001) | **7** (unchanged) | **9** (+ I1.4A-001) | **8** (+ I1.4A-INFO-001) | Increment 1.4A: **GO** |
| SEC-AI-02: AiService P7a (2026-06-11) | 0 | 4 | 5 | 4 | 2 | Complete — **NO-GO** (4 HIGH require fixes before staging) |
| SEC-AI-02 Re-verification (2026-06-11) | 0 | 1 | 2 | 0 | 0 | Complete — **NO-GO** (RV-03 HIGH race not closed; RV-01/RV-02 new MEDIUM) — 3 HIGH fixed, 3 MEDIUM fixed, 2 LOW fixed |
| SEC-AI-02 Remediation Pass 2 + Final Gate (2026-06-11) | 0 | 0 | 0 | 1 | 0 | Complete — **GO** (all RV-03/RV-01/RV-02/M-01/L-03/L-04/I-02 fixed; FG-01 LOW new; 2 CONDITIONS tracked) |
| **Total (Phases 4–SEC-AI-02 final gate)** | **4** | **26** | **37** | **21** | **19** | — |
| **Total open (pre-prod blockers)** | **0** | **2** (NEW-002, M1-R-001) | **9** (prior deferred + M1-R-002 + I1.1-001 + I1.3-002) | **10** (prior deferred + M1-R-003 + I1.1-002 + I1.3-003 + I1.4A-001 + FG-01 cancel-leak) | **9** (prior INFO) | SEC-AI-02 final gate: **GO** |
| Wave 6 — GAP-106 PCI Scope + GAP-025 VAPT Plan (2026-06-11) | 0 | 0 | 0 | 2 | 3 | Complete — **GO** (2 LOW new: GAP-PCI-01, GAP-PCI-02; 3 INFO new: GAP-PCI-03, GAP-PCI-04, dead VerifyWebhookSignature) |
| **Total (Phases 4–Wave 6)** | **4** | **26** | **37** | **23** | **22** | — |
| **Total open (pre-prod blockers)** | **0** | **2** (NEW-002, M1-R-001) | **9** (unchanged) | **12** (+ GAP-PCI-01, GAP-PCI-02) | **12** (+ GAP-PCI-03, GAP-PCI-04, dead VerifyWebhookSignature) | Wave 6: **GO** |

---

## Phase 5 Security Review — Fix Verification

**Scope:** Re-audit of all 25 Phase 4 findings after Phase 5 fixes; new issues introduced by fixes
**Review Date:** 2026-04-05
**Reviewer:** security-reviewer agent

---

### Verification Table

| ID | Severity | Expected Fix | Verified? | Evidence |
|----|----------|-------------|-----------|---------|
| SEC-001 | Critical | HMAC-SHA256 webhook with `CryptographicOperations.FixedTimeEquals` | YES — with caveat | `backend/Services/PlatformService/Platform.WebApi/Program.cs` lines 104–114. HMAC-SHA256 implemented; `CryptographicOperations.FixedTimeEquals` present. Caveat noted below (NEW-001). |
| SEC-002 | Critical | `WithOrigins(...)` instead of `AllowAnyOrigin()` | YES | `backend/Services/PlatformService/Platform.WebApi/Program.cs` lines 72–79; `backend/Services/PlatformService/Platform.WebApi/Program.cs` lines 25–32; `backend/Services/FinanceService/Finance.WebApi/Program.cs` lines 23–30. All use `WithOrigins(AdminPanel, Mobile)` with config fallback. |
| SEC-003 | Critical | Hangfire dashboard has `HangfireRoleAuthorizationFilter` | YES | `backend/Services/PlatformService/Platform.WebApi/Program.cs` lines 132–135. `DashboardOptions { Authorization = [new HangfireRoleAuthorizationFilter("SYSTEM_ADMIN")] }` in place. |
| SEC-004 | High | All stub services have `FirebaseAuthMiddleware` + `RequireAuthorization()` | YES | Verified in GstService (`Program.cs` lines 67–84) and SubscriptionService (`Program.cs` lines 69–81). All stub endpoints call `.RequireAuthorization()`. Webhook endpoint correctly exempt with HMAC verification instead. |
| SEC-005 | High | `RandomNumberGenerator.GetInt32(100000, 1000000)` | YES | `backend/Services/PlatformService/Platform.Infrastructure/Auth/Services/OtpService.cs` line 42. |
| SEC-006 | High | Root `.gitignore` covers `.env*`, credential files, `*.pem`, `appsettings.*.json` | YES | `/Users/gtmkumar/Documents/source/snapaccount/.gitignore` present. Covers `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `google-services.json`, `GoogleService-Info.plist`, `service-account*.json`, `*.pfx`, `*.p12`, `*.pem`, `*.key`, `appsettings.Development.json`, `appsettings.Local.json`, `appsettings.Staging.json`, `appsettings.Production.json`, and `**/bin/`. |
| SEC-007 | High | `AccountDeletionRequestedEventHandler` publishes to Pub/Sub | YES | `backend/Services/PlatformService/Platform.Application/Auth/EventHandlers/AccountDeletionRequestedEventHandler.cs` lines 29–44. Publishes to `account-deletion-events` topic via `IEventPublisher`. Pub/Sub failure is caught and logged without blocking deletion. |
| SEC-008 | High | `RequestAccountDeletionCommandHandler` calls `RevokeRefreshTokensAsync` | YES — with new defect | `backend/Services/PlatformService/Platform.Application/Auth/Commands/RequestAccountDeletion/RequestAccountDeletionCommandHandler.cs` lines 29–35. Firebase revocation is called. New defect noted (NEW-002): the comment says "Non-fatal" but the code returns the failure result, making Firebase revocation fatal to the deletion flow. |
| SEC-009 | High | `GoogleCredential.GetApplicationDefaultAsync()` | YES | `backend/Shared/SnapAccount.Shared.Infrastructure/Storage/GoogleCloudStorageService.cs` lines 52–58. `GoogleCredential.GetApplicationDefaultAsync(ct)` used; `UrlSigner.FromCredential(credential)` pattern in place. |
| SEC-010 | High | PostgreSQL rules exist to block DELETE and UPDATE on `shared.audit_log` | YES | `database/shared/V2__audit_log_immutability.sql` lines 10–16. Both `no_delete_audit_log` and `no_update_audit_log` rules created with `DO INSTEAD NOTHING`. |
| SEC-011 | High | `AddRateLimiter` configured on all services | YES | `backend/Services/PlatformService/Platform.WebApi/Program.cs` lines 82–93 (sliding window, 5 req / 10 min, applied to OTP endpoints at lines 155 and 164). SubscriptionService and GstService use fixed window (100 req/min). |
| SEC-012 | High | `PermissionBehavior<TRequest, TResponse>` implements `IPipelineBehavior` | YES | `backend/Services/PlatformService/Platform.Application/Auth/Behaviors/PermissionBehavior.cs`. `[RequiresPermissionAttribute]` and `PermissionBehavior<TRequest, TResponse>` both implemented. Registered in MediatR pipeline at `Platform.WebApi/Program.cs` line 56. |
| SEC-013 | Medium | `AesPanEncryptionService.cs` with AES-256 | YES | `backend/Services/PlatformService/Platform.Infrastructure/Auth/Services/AesPanEncryptionService.cs`. AES-256-CBC with PKCS7 padding; IV prepended to ciphertext; 32-byte key enforced; key sourced from config (GCP Secret Manager in prod). |
| SEC-014 | Medium | `mobile/src/lib/pinnedHttpClient.ts` exists | YES — placeholder certs | `mobile/src/lib/pinnedHttpClient.ts` exists. `react-native-ssl-pinning` integrated. `PINNED_CERTS` array contains `sha256/PLACEHOLDER_HASH_1==` and `sha256/PLACEHOLDER_HASH_2==` — placeholder values not replaced with real hashes. Bug-log acknowledges this: "placeholder cert hashes need replacing by DevOps before prod build." See INFO-001. |
| SEC-015 | Medium | `useSensitiveScreen` found on sensitive screens | YES | Hook at `mobile/src/hooks/usePreventScreenCapture.ts` wraps `expo-screen-capture`. Found on 9 files: `ITRDashboardScreen.tsx`, `GstDashboardScreen.tsx`, `Gstr3bScreen.tsx`, `GstApprovalScreen.tsx`, `LoanHubScreen.tsx`, `LoanEligibilityScreen.tsx`, `LoanStatusScreen.tsx`, `ReportDetailScreen.tsx`, and the hook file itself. |
| SEC-016 | Medium | `IsolationLevel.Serializable` transaction in `AddDeviceCommandHandler` | YES | `backend/Services/PlatformService/Platform.Application/Auth/Commands/AddDevice/AddDeviceCommandHandler.cs` line 21. `GetByIdWithSerializableTransactionAsync` called, per comment at lines 17–20. |
| SEC-017 | Medium | `infra/scripts/deploy-admin.sh` and `docs/devops/admin-panel-security.md` exist | PARTIAL | Both files exist. Cloud Armor policy creation scripted. Script explicitly warns at lines 97–103 that LB/NEG wiring is a manual step. `--allow-unauthenticated --ingress=all` remains on Cloud Run service (line 71–72 of deploy-admin.sh) — Cloud Armor only effective once LB is wired. Consistent with bug-log status PARTIAL. |
| SEC-018 | Medium | `#{DB_PASSWORD}#` placeholder in `appsettings.json`, no plaintext password | YES | `backend/Services/PlatformService/Platform.WebApi/appsettings.json` line 10 uses `#{DB_PASSWORD}#`. The `bin/Release/net10.0/appsettings.json` copy retains the old plaintext password but is covered by `**/bin/` in `.gitignore` and is not a source file. |
| SEC-019 | Medium | `database/shared/V3__audit_log_partition_automation.sql` partition function exists | YES | File present. `shared.create_audit_log_partitions(months_ahead)` function creates monthly partitions up to N months ahead. Immediately calls `SELECT shared.create_audit_log_partitions(12)` on migration run. |
| SEC-020 | Medium | `TaxComputation` entity has `ComputationHash` field | YES | `backend/Services/FinanceService/Finance.Domain/Itr/Entities/TaxComputation.cs` line 40. SHA-256 of canonical JSON inputs computed on `Create()` (line 81); `VerifyIntegrity()` method uses `CryptographicOperations.FixedTimeEquals` (lines 89–92). |
| SEC-021 | Low | `database/auth/V2__fix_otp_hash_comment.sql` corrects bcrypt comment | YES | `database/auth/V2__fix_otp_hash_comment.sql`. `COMMENT ON COLUMN auth.otp_request.otp_hash` updated to accurately describe SHA-256 with phone+OTP composite input. |
| SEC-022 | Low | Warning log in `FirebaseAuthMiddleware` catch block | YES | `backend/Shared/SnapAccount.Shared.Infrastructure/Auth/FirebaseAuthMiddleware.cs` lines 36–41. `logger.LogWarning(...)` logs the path when a token is present but invalid. |
| SEC-023 | Low | `partialize` strips `panNumber: undefined` from persisted state | YES | `mobile/src/store/authStore.ts` lines 132–156. `panNumber: undefined` explicitly set on `user`, `currentOrganization`, and all entries in `organizations[]` array. `firebaseToken` also excluded. |
| SEC-024 | Low | `document-service-sa` uses `objectCreator` + `objectViewer` instead of `objectAdmin` | YES | `infra/setup.sh` lines 501–507. Comment documents the downgrade rationale; `roles/storage.objectCreator` and `roles/storage.objectViewer` granted. Note: existing GCP projects require manual IAM revoke per bug-log. |
| SEC-025 | Low | HSTS header or HTTP redirect in `src/admin/nginx.conf` | YES | `src/admin/nginx.conf` line 77. `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"` header added. Comment explains redirect is enforced at Cloud LB; commented-out block with `X-Forwarded-Proto` redirect logic provided for non-GCP deployments. |

---

### New Issues Introduced by Phase 5 Fixes

#### [HIGH] NEW-002: Firebase Revocation Failure Blocks Account Deletion
- **File:** `backend/Services/PlatformService/Platform.Application/Auth/Commands/RequestAccountDeletion/RequestAccountDeletionCommandHandler.cs`
- **Line:** 33–35
- **Description:** The inline comment at line 33 states "Non-fatal: log but do not block deletion if Firebase revocation fails", but the implementation immediately returns the failure result (`if (revokeResult.IsFailure) return revokeResult`). This means a transient Firebase API error or network timeout will cause the entire account deletion flow to fail and return an error to the user. The user's local refresh tokens have already been revoked at line 25, but the `auth.user` record is never marked as deleted (line 37 is not reached). This creates an inconsistent state: local tokens revoked, Firebase session still active, account not soft-deleted. From a DPDP Act 2023 perspective, a user exercising their Right to Erasure can be denied deletion by a Firebase service hiccup.
- **Recommended Fix:** Demote the Firebase revocation failure to a warning log only — do not return the failure result. Continue to `userRepository.UpdateAsync(user, cancellationToken)`. A background retry job should handle Firebase revocation for accounts where it failed. This matches the intent of the inline comment.
- **Reference:** DPDP Act 2023, Section 12 (Right to Erasure); CWE-754 (Improper Check for Unusual or Exceptional Conditions)

#### [MEDIUM] NEW-001: SEC-001 HMAC Comparison Uses Hex String Bytes, Not Decoded Bytes
- **File:** `backend/Services/PlatformService/Platform.WebApi/Program.cs`
- **Line:** 108–113
- **Description:** `CryptographicOperations.FixedTimeEquals` is called with `Encoding.UTF8.GetBytes(signature)` and `Encoding.UTF8.GetBytes(expectedSignature)` — both arguments are UTF-8 byte representations of lowercase hex strings, not decoded raw hash bytes. This is not a security bypass vulnerability (both sides encode the same way, and a timing-safe comparison of hex strings is still correct). However, the comparison is length-sensitive: if the received `X-Razorpay-Signature` header has different length than the computed hex (e.g., the Razorpay header is uppercase or contains a trailing newline), `FixedTimeEquals` returns `false` immediately without comparing content, partially defeating the timing-safe intent. The standard practice is to decode both hex strings to `byte[]` before comparing, which also ensures both buffers are always the same length (32 bytes for SHA-256).
- **Recommended Fix:** Replace the comparison with:
  ```
  var receivedBytes = Convert.FromHexString(signature);
  var expectedBytes = Convert.FromHexString(expectedSignature);
  if (!CryptographicOperations.FixedTimeEquals(receivedBytes, expectedBytes))
      return Results.Unauthorized();
  ```
  Also add a length pre-check and a `try/catch` around `Convert.FromHexString` to handle malformed header values gracefully.
- **Reference:** CWE-208 (Observable Timing Discrepancy); OWASP Cryptographic Failures

#### [LOW] NEW-003: AES-256-CBC Used Instead of AES-256-GCM for PAN Encryption
- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Auth/Services/AesPanEncryptionService.cs`
- **Line:** 38–48
- **Description:** PAN is encrypted with AES-256-CBC (PKCS7 padding). CBC mode provides confidentiality but not integrity — a padding oracle attack or ciphertext manipulation could corrupt or forge encrypted PAN values without detection. AES-256-GCM (Authenticated Encryption with Associated Data) is the current recommended mode as it provides both confidentiality and integrity in a single operation, and is supported natively by `System.Security.Cryptography.AesGcm` in .NET.
- **Recommended Fix:** Migrate to `AesGcm` with a 12-byte nonce and 16-byte tag. Storage format: `Base64( Nonce[12] || Tag[16] || Ciphertext )`. The GCM tag prevents ciphertext tampering and eliminates padding oracle risk.
- **Reference:** CWE-326 (Inadequate Encryption Strength); NIST SP 800-38D

#### [INFO] INFO-001: Certificate Pinning Uses Placeholder Hashes
- **File:** `mobile/src/lib/pinnedHttpClient.ts`
- **Line:** 49–52
- **Description:** `PINNED_CERTS` contains `sha256/PLACEHOLDER_HASH_1==` and `sha256/PLACEHOLDER_HASH_2==`. The pinning infrastructure is correctly implemented but will not pin to any real certificate until replaced. In development/staging this is acceptable, but these must be replaced with actual SHA-256 public-key hashes before any production build. The file header includes a clear rotation procedure.
- **Recommended Fix:** DevOps engineer must extract the production API certificate's public key hash and update these values before the production build. Add a CI check that fails the build if either placeholder string is still present in a production-targeted build.

#### [INFO] INFO-002: SEC-015 Missing `useSensitiveScreen` on AccountingService Screens
- **File:** `mobile/src/screens/` (accounting-related screens)
- **Description:** The `useSensitiveScreen` hook was applied to ITR, GST, and Loan screens (confirmed in 8 screens). Accounting screens (balance sheet, P&L, trial balance, journal entries) were not enumerated in the grep results. If accounting screens exist that display financial data, they should also call `useSensitiveScreen`. This is informational — accounting screens may be server-rendered reports opened in a WebView and thus inherit different protections.
- **Recommended Fix:** Audit all screens displaying financial data (balance sheet, P&L, bank details, journal entries) and apply `useSensitiveScreen` uniformly.

---

### Phase 5 Summary

| Severity | Phase 4 Findings | Fixed | Still Open | New Issues |
|----------|-----------------|-------|------------|------------|
| Critical | 3 | 3 | 0 | 0 |
| High | 9 | 9 | 0 | 1 (NEW-002) |
| Medium | 8 | 7 | 1 (SEC-017 PARTIAL) | 1 (NEW-001) |
| Low | 5 | 5 | 0 | 1 (NEW-003) |
| Info | 0 | — | — | 2 (INFO-001, INFO-002) |

**CRITICAL: 0 FIXED / 0 OPEN | HIGH: 9 FIXED / 1 OPEN (new) | MEDIUM: 7 FIXED / 2 OPEN | LOW: 5 FIXED / 1 OPEN (new) | INFO: 2**

---

### Overall Verdict

**BLOCKERS REMAIN**

One HIGH-severity finding was introduced by Phase 5 (NEW-002) and must be fixed before approval. The three original Critical findings are all resolved. SEC-017 remains PARTIAL by design (LB wiring is a manual infrastructure step, documented).

**Must fix before approval:**
1. **NEW-002 (HIGH)** — `RequestAccountDeletionCommandHandler` makes Firebase revocation fatal to account deletion, contradicting the inline comment and creating inconsistent state. Fix is a one-line change: remove `return revokeResult` and log a warning instead.

**Fix before production build (not a blocker for code approval, but a blocker for go-live):**
2. **NEW-001 (MEDIUM)** — HMAC comparison uses UTF-8-encoded hex strings; should decode to raw bytes before `FixedTimeEquals`.
3. **INFO-001** — Placeholder certificate hashes in `pinnedHttpClient.ts` must be replaced before production.

**Recommended (post-launch):**
4. **NEW-003 (LOW)** — Migrate PAN encryption from AES-256-CBC to AES-256-GCM.
5. **INFO-002** — Verify `useSensitiveScreen` coverage on accounting screens.

---

*Report generated: 2026-04-05*
*Phase 5 review updated: 2026-04-05*

---

## Phase 6 (6A + 6E) Security Review

**Scope:** AccountingService (new), NotificationService (new handlers + adapters), CallbackService (new 12th microservice), GstService (3/6 stubs converted), Admin frontend (3 Callback pages, NotificationCenter, GstReturnReviewPage), Mobile (CameraScreen, RequestCallbackModal/Status, pushTokenManager, notificationRouter), Infra (Cloud Scheduler + Pub/Sub recurring jobs, Secret Manager placeholders, CallbackService Cloud Run), DB migrations 016/017/018.
**Review Date:** 2026-04-25
**Reviewer:** security-reviewer agent

---

### Section 1 — Backend Service Checklist

#### AccountingService

| Control | Result | Notes |
|---------|--------|-------|
| FirebaseAuthMiddleware applied | PASS | Program.cs line 82 |
| RequireAuthorization() on all endpoints | PASS | All 7 endpoints wired |
| Org-scoped queries | PASS | OrganizationId from ICurrentUser passed to all queries |
| PermissionBehavior registered | FAIL — see SEC-026 | No PermissionBehavior in DI; no [RequiresPermission] on any accounting command |
| Rate limiting | PASS | "standard" 100/min on all endpoints |
| DPDP erasure cascade | PARTIAL — see SEC-027 | accounting.ledger_entries not in erasure handler |
| PII in logs | PASS | No PAN/GSTIN/Aadhaar observed in log statements |
| Secrets via Secret Manager | PASS | DB password via placeholder; Firebase via ADC |
| Idempotency (dedupe_hash) | PASS | OcrResultSubscriber computes SHA-256(documentId || payloadHash) per P6-HANDOFF-03 |
| Pub/Sub AuthN | PASS | SubscriberClient uses ADC / Workload Identity |
| Input validation | PASS | FluentValidation present on commands |

#### NotificationService

| Control | Result | Notes |
|---------|--------|-------|
| FirebaseAuthMiddleware applied | PASS | Program.cs line 81 |
| RequireAuthorization() on all endpoints | PARTIAL — see SEC-028 | /dlq and /dlq/{id}/retry have RequireAuthorization but no role/permission gate; any authenticated user can access DLQ |
| Org-scoped queries | N/A | Notification service is user-scoped; inbox filtered by ICurrentUser.UserId |
| PermissionBehavior registered | FAIL — see SEC-026 | Same issue as AccountingService; no PermissionBehavior in DI |
| Rate limiting | PASS | "standard" 100/min on all endpoints |
| DPDP erasure cascade | PARTIAL — see SEC-027 | notification.* tables not referenced in AccountDeletionRequestedEventHandler |
| PII in logs | PASS | Phone masked to first 6 chars; email masked to user@**** |
| Secrets via Secret Manager | PASS | Msg91:ApiKey, SendGrid:ApiKey via IConfiguration (Secret Manager in prod) |
| DLT gate for SMS | PASS | Both fan-out pipeline and adapter enforce DltTemplateId not empty |
| Idempotency (event dedupe) | PASS | SHA-256 dedupe key per (userId, eventCode, channel), 6h window |
| Template PII leakage review | PASS — see INFO-001 | 26 catalog entries reviewed; no template embeds tax amounts, refund amounts, or account numbers |
| MSG91 DLT compliance | PASS | DLT gate blocks dispatch until template registered |
| Pub/Sub AuthN (RecurringJobsSubscriber) | PASS | ADC / Workload Identity |
| In-process dedupe for recurring jobs | LOW — see SEC-031 | HashSet<string> dedupe resets on restart; effective only within a process lifetime |

#### CallbackService

| Control | Result | Notes |
|---------|--------|-------|
| FirebaseAuthMiddleware applied | PASS | Program.cs line 77 |
| RequireAuthorization() on all endpoints | PASS | All 11 endpoints wired |
| Org-scoped list query | PASS | ListCallbacks passes ICurrentUser.OrganizationId |
| GetCallbackById — IDOR risk | FAIL — see SEC-029 | Query fetches by ID only; no org_id or user_id ownership check |
| State transition commands — IDOR | FAIL — see SEC-029 | AssignCallback, CompleteCallback, CancelCallback etc fetch by ID only; any authenticated user can manipulate any callback |
| PermissionBehavior registered | FAIL — see SEC-026 | No PermissionBehavior in DI; no [RequiresPermission] on any command |
| Rate limiting | PASS | "standard" 100/min on all endpoints |
| DPDP erasure cascade | FAIL — see SEC-027 | callback.call_notes and callbacks.user_id not in erasure handler (P6-HANDOFF-05 unresolved) |
| PII in logs | PASS | No sensitive data logged in observed handlers |
| Secrets via Secret Manager | PASS | DB password via placeholder pattern |
| Input validation | PASS | FluentValidation; IssueDescription capped at 1000 chars; note Content capped at 5000 chars |
| Callback audit trail | PARTIAL — see SEC-030 | assignments_log table exists in DB; application-layer handler (AssignCallbackCommand) does not write to it |
| KPI MV org filter | PASS (placeholder) | GetKpiSnapshot returns placeholder with organizationId — no data exposed; MV query deferred |

#### GstService (3/6 stub conversions)

| Control | Result | Notes |
|---------|--------|-------|
| PermissionBehavior | PASS | FileReturnCommand has [RequiresPermission("gst.returns.file")] |
| Auth middleware | PASS (inherited from Phase 4/5 review) | |
| Input validation | PASS | FluentValidation present |

---

### Section 2 — Frontend (Admin) Checklist

| Control | Result | Notes |
|---------|--------|-------|
| All API calls via src/admin/src/lib/ | PASS | callbackApi.ts and notificationApi.ts use shared api instance |
| No hardcoded URLs | PASS | Base URL from VITE_API_BASE_URL env var per callbackApi.ts comment |
| No dangerouslySetInnerHTML with untrusted input | PASS | No occurrences found in new pages |
| CSRF: tokens in Authorization header | PASS | Shared axios instance uses Bearer token pattern |
| Server-side org filter authoritative | PASS | listCallbacks passes params; server enforces OrganizationId |
| Zod validation on API responses | PASS | callbackApi.ts and notificationApi.ts use z.parse() on all responses |
| i18n — no hardcoded user-visible strings | PASS | All new pages use t() from react-i18next |
| PAN/Aadhaar masked in UI | N/A | Callback/notification pages do not display PAN or Aadhaar |
| DLQ endpoint in notificationApi — type safety | LOW — see SEC-032 | getNotificationDlq returns `res.data as { items: unknown[]; totalCount: number }` with no Zod parse |

---

### Section 3 — Mobile Checklist

| Control | Result | Notes |
|---------|--------|-------|
| SecureStore for FCM token | PASS | pushTokenManager.ts uses SecureStore.setItemAsync for REGISTERED_TOKEN_KEY and DEVICE_ID_KEY |
| No AsyncStorage for sensitive data | PASS | No AsyncStorage usage found in new mobile files |
| Certificate pinning still in place | PASS (Phase 5 finding, unchanged) | react-native-ssl-pinning; new endpoints use same base URL |
| Screenshot prevention on RequestCallbackModal | FAIL — see SEC-033 | useSensitiveScreen not applied to RequestCallbackModalScreen; screen may contain financial reason text |
| Screenshot prevention on CallbackStatus | FAIL — see SEC-033 | Same — CallbackStatusScreen not checked for useSensitiveScreen |
| Deep-link id validation in notificationRouter | FAIL — see SEC-034 | id extracted from notification payload and passed directly to navigation without UUID format validation |
| FCM token rotation listener | PASS | addPushTokenListener wired; registerTokenIfNew deduplicates via SecureStore |
| No PII in console.log | PASS | pushTokenManager logs only status messages; no tokens, phone numbers or user data logged in full |
| i18n — no hardcoded strings | PASS | RequestCallbackModalScreen uses t() throughout |

---

### Section 4 — Infra Checklist

| Control | Result | Notes |
|---------|--------|-------|
| Secret Manager placeholders created | PASS | msg91-api-key, msg91-sender-id, sendgrid-api-key, firebase-admin-json in setup.sh lines 442–462 |
| No real secret values committed | PASS | All values are placeholder strings |
| CallbackService SA created | PASS | callback-service-sa created at setup.sh line 502 |
| CallbackService IAM: least privilege | PASS | pubsub.publisher + pubsub.subscriber + secretmanager.secretAccessor only |
| Cloud Scheduler → Pub/Sub via OIDC | PASS | pubsub-scheduler-recurring-jobs.sh line 186 uses --oidc-service-account-email |
| Cloud Run services in asia-south1 | PASS | REGION="asia-south1" in setup.sh line 29; cloud-run-services.sh uses same region |
| CallbackService Cloud Run defined | PASS | cloud-run-services.sh lines 238–245 |

---

### Section 5 — Cross-Cutting Checklist

| Control | Result | Notes |
|---------|--------|-------|
| 26 notification templates — PII leakage | PASS | Event catalog reviewed; all entries are generic titles (e.g., "GST Return Due in 7 Days") with no tax amounts, refund values, or account numbers embedded |
| MSG91 DLT compliance gate in code | PASS | Fan-out pipeline checks DltTemplateId before dispatch; adapter adds defensive check |
| Callback audit trail (who-requested) | PARTIAL — see SEC-030 | DB schema has assignments_log; application-layer not writing to it |
| Callback state-machine immutability | PARTIAL — see SEC-030 | DB schema is append-only for assignments_log; application layer does not populate it |
| DPDP cascade for new tables | FAIL — see SEC-027 | callback.* and notification.* not in erasure event handler |

---

### Findings

#### [HIGH] SEC-026 — PermissionBehavior Not Registered in AccountingService, NotificationService, or CallbackService

- **Files:** `AccountingService.Infrastructure/DependencyInjection.cs`, `NotificationService` (DI not read but confirmed via grep returning empty), `CallbackService.Infrastructure/DependencyInjection.cs`
- **Lines:** CallbackService DI line 23 (AddCallbackApplicationServices); AccountingService DI line 67 (end of method, no PermissionBehavior)
- **Description:** The shared `DependencyInjection.cs` (line 53) explicitly documents that `PermissionBehavior` must be registered per-service after calling `AddApplicationServices()`. None of the three new services register it. As a result, the `[RequiresPermission]` attribute on commands is silently ignored — any authenticated user can invoke privileged commands such as `CloseFiscalYear`, `ReversePosting`, `ReviewPosting`, and all callback state transitions without role checks. The GstService stub conversions (e.g., `FileReturnCommand`) already use `[RequiresPermission("gst.returns.file")]` correctly, proving the pattern is known but was not applied to Phase 6A+6E services.
- **Severity:** HIGH — RBAC bypass on financial write operations.
- **Recommended Fix:** In each service's `Infrastructure/DependencyInjection.cs` (or `Program.cs`), after `AddApplicationServices()`, register `PermissionBehavior` via `cfg.AddOpenBehavior(typeof(PermissionBehavior<,>))` within the MediatR configuration. Apply `[RequiresPermission("accounting.*")]` attributes to privileged commands (`CloseFiscalYear`, `ReversePosting`, `ReviewPosting`, `BootstrapCoa`); apply `[RequiresPermission("callbacks.agent")]` to `AssignCallback`, `CompleteCallback`, `EscalateCallback`; apply `[RequiresPermission("notifications.operator")]` to no commands currently but gate DLQ retry.
- **Agent:** backend-agent
- **Reference:** SEC-012 (Phase 4), OWASP A01:2021 Broken Access Control

#### [HIGH] SEC-027 — DPDP Right-to-Erasure Cascade Missing for callback.* and notification.* Tables (P6-HANDOFF-05)

- **File:** `backend/Services/PlatformService/Platform.Application/Auth/Users/EventHandlers/AccountDeletionRequestedEventHandler.cs`
- **Lines:** 21–47
- **Description:** The `AccountDeletionRequestedEventHandler` publishes to `account-deletion-events` Pub/Sub topic. This was the Phase 5 fix for SEC-007. However, the downstream consumer services must subscribe and implement erasure logic for their own tables. As of Phase 6, two new data stores contain user PII that is not covered: (1) `callback.call_notes` — notes authored by or about a user; must be soft-deleted (`deleted_at = NOW()`). (2) `callback.callbacks.user_id` — must be anonymized to NULL with `anonymized_at` and `anonymization_reason = 'DPDP_ORG_ERASURE'` columns (both columns exist in migration 018, so the schema is ready). (3) `notification.notification_log` — contains `user_id` and rendered notification body which may contain user-specific data. (4) `notification.dlq_items` — contains `user_id` and original send payload. The DB columns for anonymization exist; enforcement is application-layer only and has not been implemented. This is P6-HANDOFF-05 confirmed unresolved.
- **Severity:** HIGH — DPDP Act 2023 Right to Erasure violation; regulatory non-compliance.
- **Recommended Fix:** backend-agent must implement `AccountDeletionEventConsumer` in both CallbackService and NotificationService that subscribes to `account-deletion-events` and: (a) soft-deletes `callback.call_notes` where `author_id = userId`; (b) sets `callback.callbacks.user_id = NULL, anonymized_at = NOW(), anonymization_reason = 'DPDP_ORG_ERASURE'` where `user_id = userId`; (c) sets `notification.notification_log.user_id = NULL` and nulls rendered body where `user_id = userId`; (d) sets `notification.dlq_items.user_id = NULL` where `user_id = userId`.
- **Agent:** backend-agent
- **Reference:** DPDP Act 2023 Section 17; SEC-007 (Phase 4); P6-HANDOFF-05

#### [HIGH] SEC-028 — DLQ Endpoints Accessible to Any Authenticated User (Missing Operator-Role Gate)

- **File:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Notification/Notifications.cs`
- **Lines:** 67–80 (GetDlq), 74–80 (RetryDlqItem)
- **Description:** `GET /notifications/dlq` and `POST /notifications/dlq/{id}/retry` use `.RequireAuthorization()` only, with no permission attribute or role check. Any authenticated mobile user can enumerate all failed notification delivery records (which may include other users' event codes, channels, and error messages) and trigger arbitrary retry dispatches. The DLQ is explicitly described as "operator review" tooling. The RLS policy `dlq_items_user_isolation` provides some protection at DB layer (user_id = current_user OR user_id IS NULL), but this relies on `app.current_user_id` being set correctly by the ORM session and does not prevent an authenticated user from seeing NULL-user_id system-level DLQ entries.
- **Severity:** HIGH — Unauthorized information disclosure and ability to trigger unintended notification dispatches.
- **Recommended Fix:** Add `[RequiresPermission("notifications.operator")]` to `GetDlqQuery` and `RetryDlqItemCommand`. Register PermissionBehavior in NotificationService DI (per SEC-026). Additionally, once PermissionBehavior is active, ensure that the `notifications.operator` permission is only assignable to SYSTEM_ADMIN / CA roles.
- **Agent:** backend-agent
- **Reference:** OWASP A01:2021 Broken Access Control; CWE-862 Missing Authorization

#### [HIGH] SEC-029 — IDOR on GetCallbackById and All Callback State Transition Endpoints

- **File:** `backend/Services/AssistService/Assist.WebApi/Endpoints/Callback/Callbacks.cs`
- **Lines:** 157–161 (GetCallbackById), 163–168 (AssignCallback), 170–175 (ConfirmCallback), 177–181 (CompleteCallback), 183–188 (EscalateCallback), 190–195 (CancelCallback), 197–202 (RescheduleCallback), 205–211 (AddNote)
- **Description:** `GetCallbackById` does not inject `ICurrentUser` and passes only the GUID to the query handler. The handler fetches by `c.Id == callbackId` with no `org_id` or `user_id` ownership check. Any authenticated user who knows or guesses a callback UUID can read the full detail including phone number, issue description, call notes (including internal notes), and resolution summary belonging to another organization. All state-transition endpoints (Assign, Confirm, Complete, Escalate, Cancel, Reschedule, AddNote) have the same pattern — they send only the GUID to their command handlers without checking ownership. The DB-layer RLS policy (`callbacks_org_or_assignee_isolation`) provides protection only when `app.current_user_id` is set in the Postgres session, which EF Core does not do by default without an interceptor.
- **Severity:** HIGH — Cross-organization data exposure and unauthorized state manipulation; IDOR.
- **Recommended Fix:** (1) Inject `ICurrentUser` into `GetCallbackById`, `AssignCallback`, `ConfirmCallback`, `CompleteCallback`, `EscalateCallback`, `CancelCallback`, `RescheduleCallback`, and `AddNote` endpoint handlers. (2) Pass `currentUser.OrganizationId` (or for agent operations `currentUser.UserId`) to each query/command. (3) In each handler, add `&& (c.OrganizationId == request.OrganizationId || c.AssignedAgentId == request.RequestingUserId)` to the EF Core `FirstOrDefaultAsync` predicate. (4) Alternatively, implement a `SetCurrentUserIdInterceptor` (analogous to `AuditableEntityInterceptor`) that sets `SET LOCAL app.current_user_id = ...` on each DB command, enabling RLS to enforce ownership at the DB layer.
- **Agent:** backend-agent
- **Reference:** OWASP A01:2021 Broken Access Control; CWE-639 Authorization Bypass Through User-Controlled Key

#### [MEDIUM] SEC-030 — Callback Audit Trail Not Written by Application Layer

- **File:** `backend/Services/AssistService/Assist.Application/Callback/Callbacks/Commands/AssignCallback/AssignCallbackCommand.cs` (representative; same pattern in all transition commands)
- **Lines:** 23–42
- **Description:** Migration 018 creates `callback.assignments_log` as an append-only audit table tracking who assigned whom, when, and why. The `AssignCallbackCommandHandler` (and all other transition handlers) updates `callback.callbacks` but never inserts a row into `assignments_log`. This means the "who-assigned, who-completed, who-escalated" audit trail required by the Phase 6E scope is absent at runtime. The `callback.callbacks` table has `updated_by` column but this is insufficient — it records only the last actor, not the full history.
- **Severity:** MEDIUM — Compliance gap; audit trail integrity requirement unmet.
- **Recommended Fix:** Each state-transition handler that modifies `callback.callbacks` must also insert a corresponding row into `callback.assignments_log`. For non-assignment transitions (complete, escalate, cancel), a more general `callback_state_transitions` append-only table may be appropriate, or the `shared.audit_log` table can be used. At minimum, AssignCallbackCommandHandler must insert into `assignments_log` with `(callback_id, from_user_id = old assigned_to, to_user_id = req.AgentId, assigned_by = currentUser.UserId, assigned_at = NOW())`.
- **Agent:** backend-agent
- **Reference:** SEC-010 (Phase 4 — shared.audit_log append-only pattern); CWE-778 Insufficient Logging

#### [MEDIUM] SEC-031 — RecurringJobsSubscriber In-Process Dedupe Resets on Restart

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Notification/Messaging/RecurringJobsSubscriber.cs`
- **Lines:** 23, 39–47
- **Description:** The `_processedEventIds` HashSet used for deduplication is an instance field, scoped to the process lifetime. On Cloud Run instance restart or scale-out to multiple instances, the dedupe state is lost and previously delivered Pub/Sub messages with the same `MessageId` could be processed again. Cloud Run scales horizontally and restarts regularly. For recurring job triggers (GST deadline, ITR reminders), double-dispatch may cause users to receive duplicate push/SMS/email notifications.
- **Severity:** MEDIUM — Double-send risk on scale-out or restart; user experience and TRAI DLT compliance impact (sending identical SMS twice within minutes).
- **Recommended Fix:** Replace the in-process HashSet with a short-TTL Redis `SET NX EX` check using the Pub/Sub `MessageId` as key (TTL = 10 minutes). Redis is already provisioned in the infra (setup.sh). Alternatively, persist processed event IDs to a `notification.processed_pubsub_events` table with a partial index on `(message_id, processed_at)` and a TTL-based purge job.
- **Agent:** backend-agent
- **Reference:** P6E-RISK-01 note on idempotency; CWE-362 Race Condition

#### [MEDIUM] SEC-032 — BootstrapCoa Endpoint Has No Authorization Check on Organization Ownership

- **File:** `backend/Services/FinanceService/Finance.WebApi/Endpoints/Accounting/Accounting.cs`
- **Lines:** 145–151
- **Description:** `POST /accounting/organizations/{id}/bootstrap-coa` accepts an arbitrary organization UUID from the URL path and sends it directly to the command handler without any check that the calling user belongs to or owns that organization. Any authenticated user can trigger COA bootstrap for any organization UUID. While bootstrapping an already-bootstrapped org is idempotent (will return existing records), it could be used to probe valid organization IDs or cause unintended state in a fresh organization.
- **Severity:** MEDIUM — Unauthorized cross-org action; information disclosure.
- **Recommended Fix:** Inject `ICurrentUser` and verify `id == currentUser.OrganizationId` before dispatching the command. Add `[RequiresPermission("accounting.coa.bootstrap")]` to `BootstrapOrganizationChartOfAccountsCommand` (once PermissionBehavior is registered per SEC-026).
- **Agent:** backend-agent
- **Reference:** OWASP A01:2021; CWE-639

#### [MEDIUM] SEC-033 — Screenshot Prevention Missing on RequestCallbackModalScreen and CallbackStatusScreen

- **File:** `mobile/src/screens/callbacks/RequestCallbackModalScreen.tsx`, `mobile/src/screens/callbacks/CallbackStatusScreen.tsx`
- **Lines:** RequestCallbackModalScreen (entire component — no `useSensitiveScreen` hook call found)
- **Description:** `RequestCallbackModalScreen` accepts free-text `issueDescription` (up to 500 chars) which users are expected to describe financial issues (GST, ITR, loan problems). This constitutes sensitive personal/financial information. `CallbackStatusScreen` displays callback status, assigned agent name, scheduled time, and potentially issue description. Neither screen applies `useSensitiveScreen()` (the `expo-screen-capture` hook applied to 8 screens in Phase 5 per SEC-015). A screenshot of these screens while the app is in the background or during screen recording would expose financial issue descriptions and callback scheduling details.
- **Severity:** MEDIUM — Sensitive financial context data exposed via screenshots.
- **Recommended Fix:** Apply `useSensitiveScreen()` from `hooks/useSensitiveScreen` at the top of both `RequestCallbackModalScreen` and `CallbackStatusScreen`, consistent with the pattern established for sensitive screens in Phase 5.
- **Agent:** mobile-dev
- **Reference:** SEC-015 (Phase 4)

#### [MEDIUM] SEC-034 — Deep-Link id Parameter Not Validated in notificationRouter

- **File:** `mobile/src/notifications/notificationRouter.ts`
- **Lines:** 44–49 (callback case), 51–56 (document case)
- **Description:** The notification router extracts `id` from the FCM push payload data (`const { type, id } = data`) and passes it directly to React Navigation without format validation. A maliciously crafted push notification (or a compromised FCM message) could supply an `id` value that is not a valid UUID — for example an excessively long string, a path traversal sequence (`../../admin`), or a script fragment. While React Navigation's typed route parameters provide some protection, the `as (...args: any[]) => void` cast bypasses TypeScript type checking entirely. This allows arbitrary string values to flow into navigation state.
- **Severity:** MEDIUM — Deep-link injection risk; may cause navigation to unintended screens or trigger unvalidated API calls downstream.
- **Recommended Fix:** Add UUID format validation before navigation: `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; if (id && UUID_RE.test(id)) { navigate(...) }`. Remove the `as any` cast and use the typed `navigationRef.navigate` overload. Reject silently (log warning) if `id` fails validation.
- **Agent:** mobile-dev
- **Reference:** CWE-601 URL Redirection / Open Redirect; OWASP Mobile Top 10 M1

#### [LOW] SEC-035 — snapaccount_admin BYPASSRLS Role Not Defined in Any Migration or Init Script (P6-HANDOFF-06)

- **Files:** All files in `database/migrations/` and `database/init/`
- **Description:** P6-HANDOFF-06 requires that `notification.dlq_items` operator tooling run under a `snapaccount_admin` role with `BYPASSRLS`. The migration 017 comment (line 148) references "operators use an elevated backend connection that bypasses RLS" but the `snapaccount_admin` role with `BYPASSRLS` privilege is not defined in any migration, init script, or setup.sh. The only reference to this role is in `database/shared/cloud-scheduler-partition-job.md` as an environment variable name. Without this role being created, the DLQ endpoint used by operators will either fail RLS checks (if the EF Core session user is a low-privilege role) or operators will be using the superuser `postgres` role, which is a security anti-pattern.
- **Severity:** LOW — Operational risk and security hygiene; not immediately exploitable but leaves the BYPASSRLS pattern undocumented and unverifiable.
- **Recommended Fix:** db-engineer must add to `database/init/00_extensions_and_schemas.sql` (or a new `database/init/01_roles.sql`): `CREATE ROLE snapaccount_admin WITH BYPASSRLS LOGIN; GRANT CONNECT ON DATABASE snapaccount TO snapaccount_admin; GRANT USAGE ON SCHEMA notification, callback TO snapaccount_admin;` and document in CLAUDE.md that the NotificationService DLQ tooling must connect with this role. The `NotificationService.Infrastructure/DependencyInjection.cs` should support a separate admin connection string for operator-mode endpoints.
- **Agent:** db-engineer
- **Reference:** P6-HANDOFF-06; PostgreSQL BYPASSRLS

#### [LOW] SEC-036 — FCM Push Data Payload Exposes Event Code in Cleartext to Device Notification Tray

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Notification/Adapters/FcmPushAdapter.cs`
- **Lines:** 41–44
- **Description:** The FCM `data` payload includes `event_code` (e.g., `ITR_REFUND_CREDITED`, `LOAN_EMI_DUE`) and `locale` as plaintext key-value pairs. On Android, `data` messages may be visible in the notification shade or accessible via notification history APIs if the app is not the active receiver. While event codes are not PII themselves, they can reveal sensitive context (e.g., a `LOAN_EMI_DUE` event on a shared device screen implies the user has an outstanding loan). More critically, if a future developer adds `amount` or `account_number` to the data map, it will be exposed immediately.
- **Severity:** LOW — Minimal current risk; preventive hygiene.
- **Recommended Fix:** Restrict the `data` map to navigation-intent fields only (`type`, `id`). Move `event_code` to an internal-only field if needed for analytics, or remove it from the push payload. Establish a code convention that no financial values (amounts, account numbers, GSTIN) may be added to FCM data maps.
- **Agent:** backend-agent
- **Reference:** OWASP Mobile Top 10 M2; CWE-200

#### [LOW] SEC-037 — OcrResultSubscriber Uses Hardcoded Fallback Account UUIDs

- **File:** `backend/Services/FinanceService/Finance.Infrastructure/Accounting/Messaging/OcrResultSubscriber.cs`
- **Lines:** 88–90
- **Description:** When `SuggestedDebitAccountId` or `SuggestedCreditAccountId` are null in the OCR payload, the subscriber falls back to hardcoded UUIDs `00000000-0000-0000-0000-000000001200` (Accounts Receivable) and `00000000-0000-0000-0000-000000004100` (Revenue). These are synthetic UUIDs that almost certainly do not correspond to actual `accounting.account` rows. If the per-org COA bootstrap has not been run, EF Core will throw a foreign key violation at post time, or worse — if these UUIDs coincidentally exist in a test org's accounts table, incorrect postings will be silently accepted.
- **Severity:** LOW — Data integrity risk rather than security; included because incorrect financial postings can mask fraud or trigger audit findings.
- **Recommended Fix:** Replace the hardcoded fallback with a `Result.Failure` if `SuggestedDebitAccountId` or `SuggestedCreditAccountId` is null and no per-org mapping has been configured. NACK the Pub/Sub message so it is retried after Phase 6B mapping service is available.
- **Agent:** backend-agent

#### [INFO] INFO-001 — Notification Template Catalog: 26 Events Reviewed, No PII Leakage Found

- **File:** `backend/Services/PlatformService/Platform.Application/Notification/Catalog/NotificationEventCatalog.cs`
- **Description:** All 26 event catalog entries reviewed. Event names and categories are generic (e.g., "GST Return Due in 7 Days", "ITR Refund Credited", "Callback Scheduled"). No template embeds tax amounts, refund values, account numbers, PAN, GSTIN, or Aadhaar. The `Variables` dictionary mechanism allows callers to inject values at dispatch time — it is the caller's responsibility to not pass sensitive values; this is noted for future code review.
- **Status:** PASS

#### [INFO] INFO-002 — Dedup Window Is Date-of-Send Only; Does Not Prevent Repeated Quiet-Hours Suppression

- **File:** `backend/Services/PlatformService/Platform.Application/Notification/Notifications/Commands/SendNotification/SendNotificationCommand.cs`
- **Lines:** 83–96
- **Description:** The 6-hour dedup window is checked before quiet-hours suppression. This means if a notification is suppressed by quiet hours (not sent), the dedup key is still not written to the log (because `Suppressed` status is not persisted to `NotificationLog`). A notification suppressed at 11 PM for quiet hours will be retried at the next fan-out call — which is correct behavior. No security issue, noted for product awareness.
- **Status:** INFO only

#### [INFO] INFO-003 — Cloud Scheduler OIDC Confirmed; Pub/Sub Topic-Level IAM Not Verified

- **File:** `infra/pubsub-scheduler-recurring-jobs.sh` line 186
- **Description:** Cloud Scheduler jobs use OIDC (`--oidc-service-account-email`) to authenticate to the Pub/Sub push endpoint. This is correct. The setup.sh comment notes that topic-level IAM binding is applied in `pubsub-scheduler-recurring-jobs.sh` rather than project-level, maintaining least privilege. The actual `gcloud pubsub topics add-iam-policy-binding` call was not visible in the lines read; devops-engineer should confirm it is present.
- **Status:** INFO — confirm topic-level binding exists in pubsub-scheduler-recurring-jobs.sh

---

### Handoff Decisions

#### P6-HANDOFF-04 — MV RLS Decision: ACCEPT API-Layer Filter with Mandatory Test

**Decision:** ACCEPTED — API-layer `org_id` filter (option a).

**Rationale:** PostgreSQL does not support row-level security on materialized views. The `callback.kpi_daily_snapshot` MV aggregates data at `(org_id, snapshot_date)` granularity, meaning each row is already org-scoped by the GROUP BY key. The `GetKpiSnapshot` endpoint in `Callbacks.cs` line 213 currently returns a placeholder, but the existing `ListCallbacks` and API pattern confirm that `ICurrentUser.OrganizationId` is always available at the endpoint layer. Requiring a `SECURITY INVOKER` SQL function wrapper (option b) would add a DB migration, require a new DB role, and add latency with no practical advantage given the MV's pre-aggregated structure.

**Conditions for acceptance:**
1. The full KPI query implementation (when completed) MUST add a `WHERE org_id = @orgId` clause parameterized from `ICurrentUser.OrganizationId`. This must be verified in the Phase 6B backend review.
2. backend-agent must add an integration test asserting that an authenticated user from Org A cannot see KPI data for Org B.
3. This decision is documented in `docs/security/phase-6-mv-rls-decision.md`.

**Decision filed to:** `docs/security/phase-6-mv-rls-decision.md` (separate file)

#### P6-HANDOFF-05 — DPDP Erasure Cascade: FAIL — Callbacks and Notifications Not Covered

**Finding:** The `AccountDeletionRequestedEventHandler` publishes to `account-deletion-events` but neither `CallbackService` nor `NotificationService` has a subscriber implementing erasure. The DB columns for anonymization (`anonymized_at`, `anonymization_reason`) exist in migration 018. This is filed as **SEC-027** (HIGH).

#### P6-HANDOFF-06 — notification.dlq_items BYPASSRLS Role Audit: NOT CONFIRMED

**Finding:** The `snapaccount_admin` role with `BYPASSRLS` is referenced in documentation but is not defined in any migration or init script. This is filed as **SEC-035** (LOW). The `dlq_items_user_isolation` RLS policy is in place and correctly restricts user-scoped rows. The gap is for operator/system access to NULL-user_id rows. The DLQ GetDlq endpoint currently has no permission gate (SEC-028, HIGH) so the BYPASSRLS question is secondary to fixing the missing role-check first.

---

### Phase 6 Summary

CRITICAL: 0 | HIGH: 4 (SEC-026, SEC-027, SEC-028, SEC-029) | MEDIUM: 5 (SEC-030, SEC-031, SEC-032, SEC-033, SEC-034) | LOW: 3 (SEC-035, SEC-036, SEC-037) | INFO: 3 (INFO-001, INFO-002, INFO-003)

**Go / No-Go Recommendation:** CONDITIONAL NO-GO

The four HIGH findings must be resolved before production deployment:
- SEC-026: PermissionBehavior not registered — financial write commands unprotected
- SEC-027: DPDP erasure not extended to callback/notification tables — regulatory violation
- SEC-028: DLQ accessible to any authenticated user — data exposure
- SEC-029: IDOR on GetCallbackById and all state-transition commands — cross-org data access

The five MEDIUM findings (SEC-030 through SEC-034) should be resolved before go-live but are not blockers for staging deployment.

Staging deployment is acceptable for QA/integration testing provided:
1. The staging DB does not contain real user PII.
2. The DLQ endpoint is not exposed in the staging admin panel until SEC-028 is fixed.

---

*Phase 6 review completed: 2026-04-25*
*Next review: Phase 6B/6C or upon fix verification of SEC-026 through SEC-029*

---

## Phase 6F Review (2026-04-25)

**Scope:** ChatService (16 REST endpoints + SignalR hub at /hubs/chat, Redis backplane, AccountDeletionSubscriber), SubscriptionService (13 endpoints, state machine), /search aggregator (auth-schema fan-out via GlobalSearchQuery), /reports/{id}/share-link (CreateShareLinkCommand, 15-min TTL), /notifications/celebrations (FireCelebrationCommand), Admin frontend (CommandPalette/cmd+k, RoleGuard, DarkMode, PartnerBanksSettings, 8 Settings sections), Mobile (ChatDetailScreen + SignalR client, ChatListScreen, notificationRouter Phase-6F extensions), DB migration 029 (chat canonical tables + BEFORE DELETE triggers), migration 030 (chat indexes + tsvector).
**Review Date:** 2026-04-25
**Reviewer:** security-reviewer agent

---

### Section 1 — ChatService Backend

| Control | Result | Evidence |
|---------|--------|----------|
| FirebaseAuthMiddleware applied | PASS | Program.cs line 81 |
| RequireAuthorization() on all endpoints | PASS | All 16 REST endpoints + MapHub require auth |
| [Authorize] on ChatHub | PASS | ChatHub.cs line 17 |
| JoinThread participant check | PASS | ChatHub.cs lines 79–88: DB query verifies caller is thread_participant before AddToGroupAsync |
| PermissionBehavior registered | PASS | DependencyInjection.cs (Application layer) line 20: `AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>))` |
| [RequiresPermission] on assign/resolve/escalate | PASS | AssignThreadCommand: `[RequiresPermission("chat.thread.assign")]`; ResolveThreadCommand: `[RequiresPermission("chat.thread.resolve")]`; EscalateThreadCommand: `[RequiresPermission("chat.thread.escalate")]` |
| IDOR: org-scoped queries (sampled 5 handlers) | PASS | GetThreadDetail, GetMessages, SendMessage, AssignThread, ResolveThread — all filter `t.OrganizationId == orgId` inline; Error.NotFound on mismatch |
| Participant check on SendMessage | PASS | SendMessageCommandHandler lines 70–71: `!thread.Participants.Any(p => p.UserId == currentUser.UserId)` → Error.Forbidden |
| Idempotency (client_message_id) | PASS | SendMessageCommandHandler lines 74–83: dedup on (thread_id, client_message_id); returns existing message |
| SearchHistory org-scoped | PASS | SearchHistoryQueryHandler line 65: `x.Thread.OrganizationId == orgId` filter applied; no cross-org leak |
| DPDP AccountDeletionSubscriber | PASS | AccountDeletionSubscriber.cs: anonymizes sender_user_id + stamps anonymized_at + soft-deletes ThreadParticipants |
| DB BEFORE DELETE triggers (migration 029) | PASS | Migration 029 lines 154–165: `chat.threads_block_delete()` trigger; lines 234–241: `chat.messages_block_delete()` trigger |
| Redis presence TTL 30s | PASS | PresenceService.cs line 15: `TimeSpan.FromSeconds(30)` |
| Rate limiting on SendMessage | MEDIUM — see SEC-053 | "standard" 100 req/min shared policy; no dedicated tight window for message flooding |
| Rate limiting on SignalR hub methods | MEDIUM — see SEC-051 | No rate limiting on Hub methods (JoinThread, Heartbeat, SendMessage-via-hub if added); only REST endpoints rate-limited |
| Redis private-network only | PASS | Cloud Run VPC connector required (wired in infra); Redis connection string from config, not hardcoded |

### Section 2 — SubscriptionService

| Control | Result | Evidence |
|---------|--------|----------|
| FirebaseAuthMiddleware applied | PASS | Program.cs line 80 |
| PermissionBehavior registered | PASS | DependencyInjection.cs line 20 |
| [RequiresPermission] on plan CRUD | PASS | CreatePlanCommand: `[RequiresPermission("subscription.plan.create")]`; UpdatePlanCommand checked (pattern confirmed) |
| Org-scoped IDOR (cancel/upgrade/downgrade) | PASS | CancelSubscriptionCommandHandler: `.Where(s => s.Id == ... && s.OrganizationId == orgId)` |
| State machine invalid transitions return Conflict | PARTIAL | Subscription.cs domain model enforces via exceptions caught by Result pattern; Conflict status code mapped in MapError |
| **Razorpay webhook HMAC (SEC-001 regression)** | **FAIL — see SEC-051** | No webhook endpoint exists in SubscriptionService 6F build. POST /subscriptions/{id}/payments is Firebase-JWT-authenticated; Razorpay cannot call it. SEC-001 HMAC is effectively disabled. |
| AccountDeletionSubscriber for subscriptions | FAIL — see SEC-052 | No AccountDeletionSubscriber in SubscriptionService.Infrastructure.DependencyInjection.cs; subscription.subscriptions.organization_id and subscription.invoices are not in erasure cascade |

### Section 3 — /search Aggregator

| Control | Result | Evidence |
|---------|--------|----------|
| ICurrentUser org-scoping | PASS | GlobalSearchQueryHandler lines 60–88: non-admin restricted to own user_id; admin restricted to own org |
| Cross-org data leak prevention | PASS | User search for admins filtered by org membership; org search for admins filters by org; non-admins see only themselves |
| Rate limiting | PASS | Search.cs: `.RequireRateLimiting("standard")` |
| No URL reflection of query (XSS) | PASS | Query sent via API call only (CommandPalette.tsx); not reflected in URL |
| Input validation min length | PASS | GlobalSearchQueryValidator: MinimumLength(2); MaximumLength(200) |

### Section 4 — /reports/{id}/share-link

| Control | Result | Evidence |
|---------|--------|----------|
| TTL ≤ 15 min (SEC-046 carry-forward) | PASS | CreateShareLinkCommandHandler line 60: `TimeSpan.FromMinutes(15)`; SEC-046 comment present |
| Org-scoped before generating signed URL | PASS | `j.OrgId == orgId` in EF query before generating URL |

### Section 5 — /notifications/celebrations

| Control | Result | Evidence |
|---------|--------|----------|
| Server-side replay prevention (per-user × per-kind) | PASS | FireCelebrationCommandHandler lines 61–69: query by (userId, eventCode); returns AlreadyFired=true on duplicate |
| AllowedKinds server-validated | PASS | FireCelebrationCommandValidator: static AllowedKinds array; case-insensitive `.Must()` check |
| No PII in celebration event code | PASS | Event codes are generic category names (e.g., `celebration.first_gst_filed`); no user data embedded |

### Section 6 — Admin Frontend

| Control | Result | Evidence |
|---------|--------|----------|
| CommandPalette: query sent via API only (no URL reflection) | PASS | CommandPalette.tsx: `api.get('/search', { params: { q: query } })` — query not written to URL |
| CommandPalette: Zod validation on API response | PASS | SearchResponseSchema.parse(res.data) at line 109 |
| RoleGuard: client-side only (backend must enforce too) | PASS | RoleGuard correctly warns this is UI-only; backend enforces PermissionBehavior + RequiresPermission independently |
| RoleGuard: loading/unauth handled | PASS | Loading spinner while `user == null`; unauthenticated redirects to /login with next param |
| PartnerBanksSettings: write-only secret pattern | PASS | Input type="password" for API Key, Client Secret, Password; no read-back of stored secrets |
| PayloadViewer SEC-045: OAuth token masking | FAIL — still OPEN | PayloadViewer.tsx line 134: `<pre>{payload}</pre>` renders raw payload verbatim after displaying "OAuth token is masked" text. Bearer tokens visible in admin UI. Deferred from 6C, not fixed in 6F. |
| Settings PATCH endpoints org-scoped + permission-checked | INFO — see INFO-004 | PATCH /auth/feature-flags, /auth/config/ai, /auth/org/settings, /auth/config/whatsapp, /auth/config/language do not exist in any backend service (AuthService has only 2 endpoint files); Settings UI calls ghost endpoints |
| No dangerouslySetInnerHTML with untrusted content | PASS | Email body rendered in `<iframe sandbox="">` (line 117); JSON rendered via JsonTree recursive renderer |
| No XSS in search results rendered | PASS | Results rendered as text/string interpolation via JSX — no innerHTML |

### Section 7 — Mobile

| Control | Result | Evidence |
|---------|--------|----------|
| ChatDetailScreen useSensitiveScreen | PASS | ChatDetailScreen.tsx line 218: `useSensitiveScreen()` applied |
| SEC-033 FIXED: RequestCallbackModalScreen useSensitiveScreen | PASS — FIXED | RequestCallbackModalScreen.tsx line 79: `useSensitiveScreen()` confirmed |
| SignalR JWT token factory | FAIL — see SEC-054 | ChatDetailScreen.tsx line 232: `buildChatHubConnection(HUB_BASE_URL, async () => null)` — token factory always returns null; SignalR hub will connect without auth token; hub's `[Authorize]` will reject the connection |
| notificationRouter: UUID validation on new chat/loan types | FAIL — see SEC-034 (still OPEN) | Lines 64–74: `threadId` (chat) and `loanId` (loan) passed to navigation without UUID_RE validation, same as pre-existing `id` (callback/document); pattern not fixed for Phase 6F extensions |
| SEC-048: biometric (Alert.alert placeholder) | OPEN | LoanConsentScreen.tsx line 7: "Biometric: Alert fallback (expo-local-authentication not yet installed — P6-HANDOFF-24)" — still unchanged in 6F |
| SEC-050: consent_text_version dynamic fetch | OPEN | LoanConsentScreen.tsx line 46: `const CONSENT_VERSION = '1.4'` still hardcoded; comment on line 44 says "in production, fetch this from backend consent catalog" |
| No AsyncStorage for sensitive chat data | PASS | Hub token factory returns null (avoids storage issue); REST calls use apiClient (Bearer JWT from FirebaseAuth) |
| No PII in console.log | PASS | No console.log of message bodies or user IDs observed in ChatDetailScreen |

### Section 8 — Database (Migration 029)

| Control | Result | Evidence |
|---------|--------|----------|
| BEFORE DELETE triggers on chat.messages | PASS | migration 029 lines 234–241: `trg_chat_messages_block_delete` trigger defined |
| BEFORE DELETE triggers on chat.threads | PASS | migration 029 lines 162–165: `trg_chat_threads_block_delete` trigger defined |
| anonymized_at / anonymization_reason columns | PASS | chat.messages schema (lines 190–193): `anonymized_at TIMESTAMPTZ`, `anonymized_by UUID`, `anonymization_reason VARCHAR(100)` |
| Audit timestamps on all chat tables | PASS | created_at/updated_at/deleted_at on all 6 tables |
| client_message_id UNIQUE constraint | PASS | Composite UNIQUE on (thread_id, client_message_id) in ChatMessageConfiguration |

### Section 9 — Cross-Cutting Regression Check

| Prior Finding | Status | Evidence |
|--------------|--------|----------|
| SEC-026 (PermissionBehavior) | CONFIRMED-FIXED | ChatService + SubscriptionService both register PermissionBehavior in DI |
| SEC-027 (DPDP callback/notification) | CONFIRMED-FIXED | AccountDeletionSubscribers verified in Phase 6 re-audit; ChatService adds new subscriber |
| SEC-028 (DLQ gate) | CONFIRMED-FIXED | RetryDlqItemCommand: `[RequiresPermission("notification.dlq.manage")]` still present |
| SEC-029 (IDOR callbacks) | CONFIRMED-FIXED | Pattern stable; no regression observed |
| SEC-038 (IDOR GstService notices) | CONFIRMED-FIXED (Phase 6B re-audit) | No regression in 6F code |
| SEC-039 (IDOR ItrService filings) | CONFIRMED-FIXED (Phase 6B re-audit) | No regression in 6F code |
| SEC-040 (DPDP GstService/ItrService) | CONFIRMED-FIXED (Phase 6B re-audit) | No regression in 6F code |
| SEC-043 (gst-write-strict rate limit) | CONFIRMED-FIXED (Phase 6B re-audit) | No regression in 6F code |
| SEC-044 (webhook null-bypass LoanService) | CONFIRMED-FIXED (Phase 6C re-audit) | No regression in 6F code |
| SEC-046 (15-min TTL) | CONFIRMED-FIXED | CreateShareLinkCommand confirmed 15-min TTL |
| SEC-047 (disbursedAmount in push) | CONFIRMED-FIXED (Phase 6C re-audit) | No regression in 6F code |
| SEC-049 (watermark) | CONFIRMED-FIXED (Phase 6C re-audit) | No regression in 6F code |
| **SEC-001 (Razorpay HMAC)** | **REGRESSION — see SEC-051** | No webhook endpoint exists in SubscriptionService 6F build |
| SEC-033 (useSensitiveScreen callbacks) | CONFIRMED-FIXED in 6F | RequestCallbackModalScreen.tsx line 79 verified |
| SEC-041 (ItrService client PAN cipher) | OPEN — SEC-041 TODO comment still present | UploadForm16Command.cs line 53: "SEC-041 TODO" |
| SEC-042 (admin localStorage draft) | OPEN — not checked in 6F scope | Out of 6F scope; deferred |
| SEC-045 (PayloadViewer oauth masking) | OPEN — still unmasked in 6F | PayloadViewer.tsx line 134 verified |
| SEC-048 (biometric Alert.alert) | OPEN | LoanConsentScreen.tsx comment line 7 still present |
| SEC-050 (consent_text_version hardcoded) | OPEN | LoanConsentScreen.tsx line 46: still '1.4' |
| SEC-034 (deep-link UUID validation) | OPEN and extended | notificationRouter.ts: threadId + loanId added without UUID validation in 6F |

---

### Findings

#### [HIGH] SEC-051 — Razorpay Webhook HMAC Verification Eliminated (SEC-001 Regression)

- **File:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Subscription/Subscriptions.cs`
- **Line:** 108–114 (POST /subscriptions/{id}/payments)
- **Description:** The Phase 5 fix for SEC-001 implemented Razorpay webhook HMAC-SHA256 verification using `CryptographicOperations.FixedTimeEquals`. In Phase 6F, the `SubscriptionService` has been rebuilt from scratch and no Razorpay webhook endpoint exists. The `POST /subscriptions/{id}/payments` endpoint at line 108 is Firebase-JWT-authenticated (`RequireAuthorization()`). Razorpay cannot supply a Firebase JWT — it calls with an `X-Razorpay-Signature` HMAC header. This means: (1) Razorpay cannot actually trigger subscription renewals via webhook; (2) if any future developer adds an anonymous endpoint for the webhook, the HMAC verification is not present to protect it; (3) the `RecordPaymentCommand` docstring at line 11 falsely claims "SEC-001 HMAC verified" when there is no such endpoint. This is a critical architectural regression — subscriptions cannot be renewed by Razorpay event, breaking the core billing flow. Any authenticated user can call `POST /subscriptions/{id}/payments` with an arbitrary payment ID to fraudulently mark their subscription as renewed.
- **Severity:** HIGH — Financial fraud vector (any authenticated user can renew any subscription in their org with fake payment data); SEC-001 regression; billing broken.
- **Recommended Fix:** Restore a dedicated Razorpay webhook endpoint (`POST /subscriptions/webhooks/razorpay`) that: (a) is anonymous (no `RequireAuthorization()`); (b) reads `X-Razorpay-Signature` header; (c) computes `HMAC-SHA256(payload, webhook_secret)`; (d) compares with `CryptographicOperations.FixedTimeEquals` using decoded bytes; (e) only then dispatches `RecordPaymentCommand` internally. Remove `RequireAuthorization()` from the webhook path and add it only to operator/manual payment endpoints. The `AppHost.cs` already references a Razorpay webhook HMAC secret at line 105 — use it.
- **Agent:** backend-agent
- **Reference:** SEC-001 (Phase 4/5); CWE-862 Missing Authorization; OWASP A01:2021

#### [MEDIUM] SEC-052 — SubscriptionService Missing AccountDeletionSubscriber (DPDP Erasure Gap)

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Subscription/DependencyInjection.cs`
- **Lines:** All — no `AddHostedService<AccountDeletionSubscriber>()` call exists
- **Description:** `subscription.subscriptions` stores `organization_id` and Razorpay payment metadata. `subscription.invoices` stores `organization_id`, billing amounts (INR), GST amounts, and Razorpay payment IDs. When a user invokes their DPDP Act 2023 right to erasure, the AuthService publishes to `account-deletion-events`. The SubscriptionService has no subscriber, so subscription records and invoice history linked to the deleted user's organization are not processed. Per RBI/GSTN regulations, subscription invoices must be retained 7 years but the user reference within them must be anonymized. No anonymization columns exist in the subscription.subscriptions or subscription.invoices tables.
- **Severity:** MEDIUM — DPDP Act 2023 compliance gap; the impact is lower than HIGH because subscriptions are org-scoped (not user-scoped), so the primary PII is the organization record rather than individual user data.
- **Recommended Fix:** Add `AccountDeletionSubscriber` to SubscriptionService.Infrastructure that: (a) anonymizes `subscription.subscriptions.razorpay_customer_id = NULL` where `org_id` matches the deleted user's org (if user is the org owner); (b) retains invoice records but nulls any user_id-linked fields. Add `anonymized_at` and `anonymization_reason` columns to both tables via a new migration. Register with `AddHostedService<AccountDeletionSubscriber>()`.
- **Agent:** backend-agent
- **Reference:** DPDP Act 2023 Section 17; pattern from SEC-027, SEC-040

#### [MEDIUM] SEC-053 — SendMessage REST Endpoint Shares General Rate-Limit Policy (No Anti-Flood Dedicated Window)

- **File:** `backend/Services/AssistService/Assist.WebApi/Endpoints/Chat/Chat.cs`
- **Line:** 60–63 (SendMessage endpoint uses "standard" policy)
- **Description:** `POST /chat/threads/{id}/messages` shares the "standard" 100-requests-per-minute fixed-window policy with all other chat endpoints (GetInbox, GetThread, GetMessages, MarkRead, etc.). A user can send 100 messages per minute per IP, which is functionally unlimited for messaging abuse. Phase 6B GstService correctly introduced a dedicated "gst-write-strict" (30 req/min) policy for write endpoints that trigger expensive operations — the same pattern should apply to message send, which triggers SignalR hub broadcasts and DB writes.
- **Severity:** MEDIUM — Abuse/flooding risk; SignalR broadcasts amplify load; no per-user message throttle.
- **Recommended Fix:** Register a dedicated `"chat-send"` rate-limit policy (e.g., 20 messages per minute per user, sliding window) and apply it to `POST /chat/threads/{id}/messages` only. Keep "standard" for read endpoints.
- **Agent:** backend-agent
- **Reference:** SEC-043 pattern (Phase 6B gst-write-strict); OWASP API Security Top 10 — API4:2023 Unrestricted Resource Consumption

#### [MEDIUM] SEC-054 — SignalR JWT Token Factory Returns Null in ChatDetailScreen

- **File:** `mobile/src/screens/chat/ChatDetailScreen.tsx`
- **Line:** 232
- **Description:** `buildChatHubConnection(HUB_BASE_URL, async () => null)` passes a token factory that always returns `null`. The `ChatHub` on the server has `[Authorize]` and `RequireAuthorization()` — connections without a valid JWT are rejected. This means the SignalR real-time feature is non-functional in the current build. At runtime, `startChatHub()` will throw or silently fail (hub returns 401/403 on negotiation), leaving users without real-time message delivery. The comment reads "token injected in real app via FirebaseAuth" but no injection mechanism is wired; the `getToken` callback is never populated with a real auth token.
- **Severity:** MEDIUM — Real-time functionality broken in current build; if this is mistakenly deployed, chat messages are delivered only via REST polling fallback, not SignalR; and if the hub connection is somehow established against a misconfigured server without auth, unauthenticated real-time access becomes possible.
- **Recommended Fix:** Replace the null factory with the actual Firebase token retrieval. The `authStore` (which uses SecureStore) holds the Firebase token. The token factory should call `auth.currentUser?.getIdToken()` from `@react-native-firebase/auth` or read from the `authStore`. Example: `buildChatHubConnection(HUB_BASE_URL, async () => { return await auth().currentUser?.getIdToken() ?? null; })`. This must be wired before the 6F mobile build ships.
- **Agent:** mobile-dev
- **Reference:** SEC-001 pattern (token validation); OWASP Mobile Top 10 M1

#### [MEDIUM] SEC-055 — notificationRouter 6F Extensions Inherit SEC-034 UUID Validation Gap

- **File:** `mobile/src/notifications/notificationRouter.ts`
- **Lines:** 64–74
- **Description:** Phase 6F added two new deep-link cases: `chat_message_received` (passes `threadId` to ChatDetail navigation) and `loan_disbursed`/`loan_approved` (passes `loanId` to LoanStatus navigation). Neither `threadId` nor `loanId` has UUID format validation. The existing SEC-034 finding documented this gap for `id` (callback/document). Rather than fixing the existing issue, the 6F extension duplicates it. A maliciously crafted push notification (compromised FCM channel or Pub/Sub injection) could pass non-UUID values into navigation state.
- **Severity:** MEDIUM — Extends known SEC-034 attack surface to two additional routes; combined risk of deep-link injection on 4 navigable routes.
- **Recommended Fix:** Add `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` at module scope and validate `threadId`, `loanId`, `id` before calling `nav(...)`. Silently drop (log warning) on validation failure. Remove all `as any` casts.
- **Agent:** mobile-dev
- **Reference:** SEC-034 (Phase 6); CWE-601; OWASP Mobile Top 10 M1

#### [LOW] SEC-056 — Settings API Calls Ghost Endpoints Not Implemented in Backend

- **File:** `src/admin/src/lib/settingsApi.ts`
- **Lines:** 57 (PATCH /auth/org/settings), 77 (PATCH /auth/config/ai), 91 (PATCH /auth/feature-flags/{flag}), 109 (PATCH /auth/config/language), 128 (PATCH /auth/config/whatsapp)
- **Description:** The admin Settings page calls five PATCH endpoints in AuthService that do not exist in any backend service. `Platform.WebApi/Endpoints/Auth/` contains only `Auth.cs` and `Search.cs`. No feature-flag, AI config, org settings, language, or WhatsApp config endpoint is defined. API calls will receive 404 responses. This is noted as a security finding because: (a) the absence of a backend endpoint for feature-flag toggling means there is no server-side enforcement of flag changes made in the UI; and (b) if stub endpoints are added later without proper permission gating, they become an unprotected privilege escalation path.
- **Severity:** LOW — Functional gap more than security issue currently; security risk materializes only when endpoints are created without gates.
- **Recommended Fix:** Ensure all Settings PATCH endpoints, when implemented, have `[RequiresPermission("admin.settings.*")]` attributes and are gated to `SYSTEM_ADMIN` role. Track implementation in Phase 7 scope.
- **Agent:** backend-agent

#### [INFO] INFO-004 — SEC-045 (PayloadViewer OAuth Masking) Deferred Again — Third Phase Unresolved

- **File:** `src/admin/src/components/ui/PayloadViewer.tsx`
- **Line:** 134
- **Description:** SEC-045 was first filed in Phase 6C, deferred to 6F, and is now entering its third deferred phase without resolution. The `oauth-token` kind renders the raw payload in a `<pre>` tag after displaying a "masked" label — the opposite of masking. Live bearer tokens from bank API responses visible in the admin UI. This is a pre-production blocker.
- **Status:** ESCALATION — Frontend-dev must resolve in Phase 7 stabilization. If token display is needed, show only `iss`, `exp`, `scope` claims parsed from the JWT. Never render the raw token string.

#### [INFO] INFO-005 — ChatService: No Dedicated Rate Limit on SignalR Hub Methods

- **File:** `backend/Services/AssistService/Assist.Infrastructure/Chat/SignalR/ChatHub.cs`
- **Description:** The `[Authorize]` attribute ensures authenticated access. However, hub methods `JoinThread`, `Heartbeat`, and any future hub-level send method have no application-layer rate limit. ASP.NET Core's `IRateLimiter` does not apply to SignalR hub method invocations (only to HTTP endpoints). A connected client could call `JoinThread` in a tight loop to spam group membership operations. Redis `Groups.AddToGroupAsync` is not idempotent at the StackExchange.Redis layer — repeated calls increment reference counts.
- **Severity:** INFO — Structural gap to be addressed with a custom hub filter in Phase 7.
- **Recommended Fix:** Implement a custom `IHubFilter` that checks a per-connection invocation counter stored in Redis (or in-memory for the connection lifetime) and rejects hub method calls above a threshold (e.g., 30 JoinThread calls / connection lifetime).

---

### Deferred Items Status (from prior phases)

| ID | Severity | Was | Status in 6F |
|----|----------|-----|-------------|
| SEC-033 | Medium | useSensitiveScreen on callback screens | FIXED — RequestCallbackModalScreen.tsx line 79 confirmed |
| SEC-034 | Medium | UUID validation on deep-link id | STILL OPEN; 6F extended scope to threadId + loanId without fix |
| SEC-041 | Medium | ItrService client PAN cipher | STILL OPEN — TODO comment remains |
| SEC-042 | Medium | Admin localStorage draft | OUT OF 6F SCOPE — deferred to Phase 7 |
| SEC-045 | Medium | PayloadViewer OAuth masking | STILL OPEN — third deferred phase |
| SEC-048 | Medium | Real biometric (expo-local-authentication) | STILL OPEN — Alert.alert fallback unchanged |
| SEC-050 | Medium | consent_text_version hardcoded | STILL OPEN — '1.4' hardcoded |

---

### Phase 6F Summary

CRITICAL: 0 | HIGH: 1 (SEC-051) | MEDIUM: 5 (SEC-052, SEC-053, SEC-054, SEC-055, plus deferred SEC-041/045/048/050/034 still open) | LOW: 1 (SEC-056) | INFO: 2 (INFO-004, INFO-005)

**New findings in 6F:** HIGH: 1, MEDIUM: 3 new (SEC-052, SEC-053, SEC-054), MEDIUM extensions: 1 (SEC-055), LOW: 1 (SEC-056), INFO: 2

### Go / No-Go Recommendation: NO-GO

**Blocking for final Phase 6 approval:**

1. **SEC-051 (HIGH)** — Razorpay webhook HMAC regression. SEC-001 HMAC fix is effectively reverted. Subscription renewals broken; any authenticated user can fraudulently mark subscription paid. Must restore the unauthenticated webhook endpoint with HMAC verification before production.

**Must fix before production (deferred no longer acceptable after final gate):**

2. **SEC-054 (MEDIUM)** — SignalR JWT token factory returns null; real-time chat non-functional in current mobile build.
3. **SEC-048 (MEDIUM)** — Real biometric gate still Alert.alert(); now appearing in THREE consecutive phase reviews without fix.
4. **SEC-045 (MEDIUM)** — PayloadViewer renders raw OAuth token; now appearing in THREE consecutive phase reviews.

**Remaining open Mediums (accept for prod with tracking):**

5. SEC-052 — SubscriptionService DPDP erasure gap.
6. SEC-053 — SendMessage flood potential.
7. SEC-055 — notificationRouter UUID validation on new routes.
8. SEC-034 — all deep-link routes unvalidated.
9. SEC-041 — client PAN cipher in ItrService.
10. SEC-050 — consent_text_version hardcoded.

---

*Phase 6F review completed: 2026-04-25*

---

## Phase 6 Re-Audit — 2026-04-25 (Fix Verification: SEC-026..029)

**Scope:** Focused re-audit of the 4 HIGH findings from Phase 6. Backend-agent hotfix applied (173/173 unit tests pass, 0 errors/0 warnings). SEC-034 status updated per qa-mobile P6-QA-MOBILE-01.
**Review Date:** 2026-04-25
**Reviewer:** security-reviewer agent
**Full memo:** `docs/security/phase-6-re-audit.md`

### SEC-026 — CONFIRMED-FIXED

PermissionBehavior registered in all three services (AccountingService, NotificationService, CallbackService). Each `DependencyInjection.cs` calls `cfg.AddOpenBehavior(typeof(PermissionBehavior<,>))` after `AddApplicationServices()`. Each service's `PermissionBehavior.cs` is identical and correct: it reads `RequiresPermissionAttribute` via reflection, checks `ICurrentUser.IsAuthenticated` then `ICurrentUser.HasPermission()`, and returns `Result.Failure(Error.Unauthorized/Forbidden)` when either check fails — fails closed. Representative commands verified: `CloseFiscalYearCommand` carries `[RequiresPermission("accounting.fiscal_year.close")]`; `AssignCallbackCommand` carries `[RequiresPermission("callback.assign")]`.

**Status: CONFIRMED-FIXED**

### SEC-027 — CONFIRMED-FIXED

`AccountDeletionSubscriber` (implementing `BackgroundService`) added to both `CallbackService.Infrastructure` and `NotificationService.Infrastructure`. Both are registered via `services.AddHostedService<AccountDeletionSubscriber>()` in their respective `DependencyInjection.cs` files. Callback subscriber: soft-deletes `call_notes` where `AuthorId == userId`; calls `cb.Anonymize("DPDP_ORG_ERASURE")` on all matching callbacks. The `Callback` domain entity has `UserId` typed as `Guid?` and exposes a correct `Anonymize(string reason)` method that sets `UserId = null`, `AnonymizedAt = DateTime.UtcNow`, and `AnonymizationReason = reason`. Notification subscriber: soft-deletes `notification_log` and `dlq_items` where `UserId == userId`. Both subscribers deserialize the event correctly, handle malformed payloads by ACKing to avoid redelivery loops, and NACK on exception to trigger retry.

**Status: CONFIRMED-FIXED**

### SEC-028 — CONFIRMED-FIXED

`[RequiresPermission("notification.dlq.manage")]` is present on both `GetDlqQuery` (line 15) and `RetryDlqItemCommand` (line 17). With PermissionBehavior now registered in NotificationService (SEC-026 fix), the end-to-end gate is active. Any call to the DLQ endpoints by a user without the `notification.dlq.manage` permission will be rejected by the pipeline with `Error.Forbidden` before the handler executes.

**Status: CONFIRMED-FIXED**

### SEC-029 — CONFIRMED-FIXED

`GetCallbackByIdQueryHandler` scopes the EF `FirstOrDefaultAsync` predicate inline with `&& (orgId == null || c.OrganizationId == orgId)` — no fetch-then-check pattern; cross-org requests return `NotFound` at the query level. Mutation handlers (`AssignCallbackCommandHandler`, `CompleteCallbackCommandHandler`, `EscalateCallbackCommandHandler`) each inject `ICurrentUser`, perform a post-fetch org ownership check (`if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)`), and return `Error.NotFound` (not `Error.Forbidden`) to avoid existence leak. Pattern consistent across all sampled handlers.

**Note on orgId == null bypass:** The guard `orgId == null || c.OrganizationId == orgId` means a caller with no OrganizationId claim can read any callback. This is deliberate — SYSTEM_ADMIN and operator roles may have null OrganizationId. Acceptable given they must hold the `callback.assign` / `callback.complete` permissions (enforced by SEC-026). Flagged as a low-risk observation, not a new finding.

**Status: CONFIRMED-FIXED**

### SEC-034 — REMAINS OPEN (updated per P6-QA-MOBILE-01)

`mobile/src/notifications/notificationRouter.ts` lines 44–56: the `id` value extracted from the FCM push notification payload is passed directly to `navigation.navigate('CallbackStatus', { callbackId: id })` and `navigation.navigate('DocumentDetail', { documentId: id })` without any UUID format validation. The `as (...args: any[]) => void` cast at lines 47 and 54 explicitly bypasses TypeScript's type system. This was not part of the backend hotfix scope. qa-mobile's P6-QA-MOBILE-01 independently confirms the gap via unit test — the test in `mobile/__tests__/notifications/notificationRouter.test.ts` asserts the current unvalidated behavior as documentation of the bug, not as a passing fix. When mobile-dev applies the UUID regex guard, that test must be inverted to assert that non-UUID ids do NOT trigger navigation.

**Owner:** mobile-dev
**Status: OPEN (Medium severity) — must be fixed before production release**

### Deferred Findings (5 MEDIUM + 3 LOW)

All five MEDIUM findings (SEC-030 through SEC-034) and three LOW findings (SEC-035 through SEC-037) from the original Phase 6 review are confirmed still open and unchanged. The hotfix did not touch any files in the MEDIUM/LOW scope, so no regression risk exists. These remain deferred to a post-staging follow-up pass.

### Phase 6 Re-Audit Summary

CONFIRMED-FIXED: SEC-026 (HIGH), SEC-027 (HIGH), SEC-028 (HIGH), SEC-029 (HIGH)
STILL-OPEN: SEC-034 (MEDIUM, unchanged — mobile-dev), SEC-030/031/032/033 (MEDIUM, deferred), SEC-035/036/037 (LOW, deferred)
NEW CRITICAL/HIGH: NONE

**Go / No-Go: GO**

All 4 HIGH blockers confirmed fixed by source-code inspection. No new Critical or High findings observed. Staging deployment is clear. Production deployment requires SEC-034, SEC-033, SEC-030 resolved, and INFO-001 placeholder cert hashes replaced before any production build.

*Re-audit completed: 2026-04-25*

---

## Phase 6B + 6D Security Review (2026-04-25)

**Scope**: GstService (26 endpoints, Mock+Production GSTN/IRP/EWB adapters), ItrService (17 endpoints, TaxComputationEngine, AY-versioned slabs), Admin frontend (3 GST pages, 3 ITR pages, CaTaxComputationPanelPage), Mobile (3 GST screens, 9 ITR screens, notificationRouter regression check)
**Review Date**: 2026-04-25
**Reviewer**: security-reviewer agent

---

### Re-confirmation of SEC-026..029

| ID | Status | Evidence |
|----|--------|----------|
| SEC-026 | CONFIRMED-FIXED | `GstService.Application/DependencyInjection.cs` line 22: `PermissionBehavior<,>` registered as `IPipelineBehavior<,>` after shared pipeline. `[RequiresPermission]` decorators confirmed on `GenerateEInvoiceCommand`, `CreateEWayBillCommand`, `FileNilReturnCommand`, `RespondToNoticeCommand`, `AssignNoticeToCaCommand`. |
| SEC-027 | CONFIRMED-FIXED (partial) | GstService and ItrService still lack AccountDeletionSubscribers — see SEC-038/039. CallbackService + NotificationService subscribers confirmed in place from Phase 6A+6E fix. |
| SEC-028 | CONFIRMED-FIXED | Not in scope for Phase 6B/6D (NotificationService unchanged). |
| SEC-029 | REGRESSION — see SEC-038 | The IDOR pattern re-appears in GstService notice handlers and all ItrService filing handlers. The fix pattern from SEC-029 (inject ICurrentUser, filter by org_id) was not applied to Phase 6B/6D new handlers. |

---

### Findings

#### [HIGH] SEC-038 — IDOR on GST Notice Handlers (GetNotice, RespondToNotice, AssignNoticeToCa)

- **Files**:
  - `backend/Services/FinanceService/Finance.Application/Gst/Notices/Queries/GetNotice/GetNoticeQuery.cs` line 51
  - `backend/Services/FinanceService/Finance.Application/Gst/Notices/Commands/RespondToNotice/RespondToNoticeCommand.cs` line 43
  - `backend/Services/FinanceService/Finance.Application/Gst/Notices/Commands/AssignNoticeToCa/AssignNoticeToCaCommand.cs` line 36
- **Description**: All three handlers query `gst.notices` by `n.Id == request.NoticeId` only. There is no `OrganizationId` filter and no `ICurrentUser` injection. Any authenticated user who knows (or brute-forces) a notice UUID can read its full contents including attachments metadata, file a response on it, and re-assign it to any CA. The endpoint returns `OrganizationId` in the DTO, confirming cross-tenant data exposure. This is the same IDOR class as SEC-029 which was fixed in the CallbackService — the fix pattern was not carried forward to the GstService Phase 6B handlers.
- **Recommended Fix**: Inject `ICurrentUser` into each handler. Add `&& n.OrganizationId == currentUser.OrganizationId` to the EF Where clause. Return `Error.NotFound` (not `Forbidden`) on mismatch to avoid existence leakage — consistent with the SEC-029 fix in CallbackService handlers.
- **Reference**: CWE-639 (Authorization Bypass Through User-Controlled Key), OWASP API3:2023 Broken Object Level Authorization.

#### [HIGH] SEC-039 — IDOR on ITR Filing Handlers (all 10 mutation/query handlers)

- **Files**:
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Queries/GetFiling/GetFilingQuery.cs` line 28
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/ComputeTax/ComputeTaxCommand.cs` line 65
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/SubmitForCaReview/SubmitForCaReviewCommand.cs` line 24
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/CaApprove/CaApproveCommand.cs` (analogous pattern)
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/CaReject/CaRejectCommand.cs` (analogous pattern)
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/MarkFiled/MarkFiledCommand.cs` line 27
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/MarkEVerified/MarkEVerifiedCommand.cs` (analogous pattern)
  - `backend/Services/FinanceService/Finance.Application/Itr/Form16/Commands/UploadForm16/UploadForm16Command.cs` line 43
  - `backend/Services/FinanceService/Finance.Application/Itr/Notices/Commands/RespondToNotice/RespondToNoticeCommand.cs` (analogous pattern)
  - `backend/Services/FinanceService/Finance.Application/Itr/Filings/Queries/ListFilings/ListFilingsQuery.cs` line 29
- **Description**: Every ITR filing handler loads records by `FilingId` or `AssesseeId` from the request body — there is no `ICurrentUser` injection and no check that the filing's `AssesseeId` belongs to the authenticated user. An authenticated user can compute tax on another user's filing (modifying it), submit it for CA review, mark it as filed with a forged acknowledgement number, or read the full filing detail. `ListFilingsQuery` filters by caller-supplied `assesseeId` query parameter, not the authenticated identity — any user can list any other user's filings by supplying their `assesseeId`. This affects all 17 ITR endpoints.
- **Recommended Fix**: Inject `ICurrentUser` into all handlers. For `ListFilings`: replace `request.AssesseeId` filter with a lookup of the current user's assessee record first, then scope to that assessee. For all mutation handlers: after loading the filing, verify `filing.AssesseeId == currentUser's assesseeId` (looked up from itr.assessee_profiles). Return `Error.NotFound` on mismatch.
- **Reference**: CWE-639, OWASP API3:2023.

#### [HIGH] SEC-040 — DPDP: No AccountDeletionSubscriber in GstService or ItrService

- **Files**:
  - `backend/Services/FinanceService/Finance.Infrastructure/Gst/DependencyInjection.cs` (missing subscriber registration)
  - `backend/Services/FinanceService/Finance.Infrastructure/Itr/DependencyInjection.cs` line 79 (ItrRecurringJobsSubscriber registered; no AccountDeletionSubscriber)
- **Description**: Neither GstService nor ItrService has an `AccountDeletionSubscriber` BackgroundService subscribing to the `account-deletion-events` Pub/Sub topic. Both services store PII subject to DPDP Act 2023 Right to Erasure: GstService holds `gst.invoices` (customer/supplier GSTIN, names), `gst.notices` (notice body, response text, attachment metadata); ItrService holds `itr.assessee_profiles` (PAN ciphertext, full name, email, phone, DOB, address), `itr.filings` (computation JSON with salary/income breakdown), `itr.form_16_extracts` (employer PAN cipher, salary figures), `itr.notices` (notice body, response attachments). P6-HANDOFF-16 and P6-HANDOFF-21 explicitly required these subscribers; they are present in CallbackService and NotificationService from the SEC-027 fix but were not applied to the two Phase 6B/6D services.
- **Recommended Fix**: Implement `AccountDeletionSubscriber : BackgroundService` in both `GstService.Infrastructure/Messaging/` and `ItrService.Infrastructure/Messaging/`. Subscribe to `account-deletion-events`. For GstService: soft-delete `gst.invoices` rows with matching `organization_id`; null-out `gst.notices` body/response/attachments + set `anonymized_at`. For ItrService: soft-delete `itr.assessee_profiles`; null `full_name`, `email`, `phone`, `dob`, `address`, `pan` cipher in profile; null computation JSON in filings; purge `form_16_extracts.parsed_json`; null notice bodies. Register both subscribers in the respective `DependencyInjection.cs`. Follow the pattern established in CallbackService.Infrastructure for idempotent handling.
- **Reference**: DPDP Act 2023 Section 12 (Right of erasure), CWE-212 (Improper Removal of Sensitive Information Before Storage or Transfer).

#### [MEDIUM] SEC-041 — Form 16 Upload Accepts Client-Submitted PAN Cipher Without Server-Side Encryption

- **File**: `backend/Services/FinanceService/Finance.Application/Itr/Form16/Commands/UploadForm16/UploadForm16Command.cs` lines 37–54
- **Description**: The `UploadForm16Command` accepts `EmployeePanCipher` directly from the request body and stores it verbatim via `Form16Extract.Create(...)`. The validator (`RuleFor(x => x.EmployeePanCipher).NotEmpty()`) only checks presence, not ciphertext format or integrity. A client can submit an arbitrary string — including a plaintext PAN, an empty string (as the mobile currently does at `Form16UploadScreen.tsx` line 68), or crafted binary data — and it will be stored in `itr.form_16_extracts.employee_pan_cipher`. The backend has `IPanEncryptionService` (SEC-013 pattern) available but the handler does not call it. The mobile client is expected to supply pre-encrypted ciphertext but there is no server-side enforcement that the ciphertext is valid AES-256-CBC output.
- **Recommended Fix**: The handler should accept raw PAN (or the GCS URI from which Document AI extracts PAN server-side), call `IPanEncryptionService.Encrypt()` on the backend, and store the resulting ciphertext. Never trust a client-supplied ciphertext as the canonical encrypted value. If the design intent is that OCR runs server-side (via Document AI), the `EmployeePanCipher` parameter should be removed from the command entirely and populated post-OCR.
- **Reference**: CWE-311 (Missing Encryption of Sensitive Data), OWASP A02:2021 Cryptographic Failures.

#### [MEDIUM] SEC-042 — GST Notice Response Draft Stored in localStorage

- **File**: `src/admin/src/pages/gst/NoticeDetailPage.tsx` lines 30, 108, 148–152
- **Description**: The notice response composer auto-saves draft content (subject, body, channel, reference) to `localStorage` under the key `snap_gst_notice_draft_{noticeId}`. `localStorage` is persistent, unencrypted browser storage accessible to all JavaScript on the same origin. The response body may contain legally sensitive content about the GST notice dispute. If the admin panel ever has an XSS vulnerability (even transient), the draft content is immediately available to any injected script. `localStorage` is also synchronised across browser tabs and persists after session termination. The `SessionStorage` API would be a safer alternative for transient draft state, or the draft should be server-persisted.
- **Recommended Fix**: Replace `localStorage` with `sessionStorage` for draft persistence. `sessionStorage` is tab-scoped and cleared on session end. If cross-session draft recovery is a product requirement, persist the draft server-side via a debounced PATCH to a backend draft endpoint, and do not store notice body content in browser storage at all.
- **Reference**: CWE-922 (Insecure Storage of Sensitive Information), OWASP A02:2021.

#### [MEDIUM] SEC-034 — notificationRouter Deep-Link id Not UUID-Validated (Carry-forward, No Regression)

- **File**: `mobile/src/notifications/notificationRouter.ts` lines 45–54
- **Description**: Confirmed still OPEN from Phase 6A+6E review. Lines 46 and 52 pass `id` from the FCM data payload directly to `navigationRef.navigate(...)` without UUID format validation. The Phase 6B/6D additions (`itr` and `gst` type handlers at lines 38–42) do not use `id` parameters and are safe. The pre-existing `callback` and `document` cases remain unfixed. Detailed description in original finding.
- **Recommended Fix**: Add UUID regex guard before each navigate call: `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; if (!id || !UUID_RE.test(id)) break;` in the `callback` and `document` case branches.
- **Reference**: CWE-20 (Improper Input Validation), OWASP Mobile M1.

#### [LOW] SEC-043 — e-Invoice and GST Notice Endpoints Use Standard Rate-Limit Policy Only

- **File**: `backend/Services/FinanceService/Finance.WebApi/Endpoints/Gst/Gst.cs` lines 96–103
- **Description**: `POST /gst/e-invoices` and `POST /gst/notices` apply `.RequireRateLimiting("standard")` — the same policy as all other GST endpoints. The checklist requirement specified that these two endpoints should have stricter rate limiting given their cost and abuse vectors: e-invoice generation triggers external IRP API calls (throttled by NIC at ~100/min per GSTIN); notice creation at volume could be used to create noise for compliance teams. The "standard" policy from GstService Program.cs is a fixed-window general policy, not a tighter per-GSTIN or per-org window for these high-value operations.
- **Recommended Fix**: Add a named rate-limit policy (e.g., `"gst-write"` at 20 req/min per IP or org) and apply `.RequireRateLimiting("gst-write")` on `POST /gst/e-invoices`, `POST /gst/e-way-bills`, and `POST /gst/notices`. This prevents runaway IRP API cost and notice spam.
- **Reference**: OWASP API4:2023 Unrestricted Resource Consumption.

#### [INFO] INFO-002 — Form16UploadScreen Sends Empty employeePanCipher (Mobile MVP Placeholder)

- **File**: `mobile/src/screens/itr/Form16UploadScreen.tsx` line 68
- **Description**: The mobile Form 16 upload passes `employeePanCipher: ''` (empty string). The backend validator currently requires `NotEmpty()` on this field (line 33 of `UploadForm16Command.cs`), so this would be rejected in production. This is a placeholder MVP gap — the mobile does not yet have PAN encryption plumbed end-to-end. The `itr.ts` client comment at line 35 confirms: "AES-256-CBC ciphertext from IPanEncryptionService — NEVER raw PAN". Combined with SEC-041, the full PAN encryption flow (server-side encryption after OCR) should be prioritised before any production Form 16 feature launch.
- **Recommended Fix**: Resolve SEC-041 first (move PAN encryption server-side). Once encryption is server-side, the mobile no longer needs to supply `EmployeePanCipher` and the field should be removed from the mobile API contract.

---

### Phase 6B + 6D Checklist Results

#### GstService — 26 endpoints

| Check | Result | Notes |
|-------|--------|-------|
| RequireAuthorization on all 26 endpoints | PASS | All endpoints in Gst.cs carry `.RequireAuthorization()` |
| RequireRateLimiting on all endpoints | PASS | All carry `.RequireRateLimiting("standard")` |
| PermissionBehavior registered in DI | PASS | `GstService.Application/DependencyInjection.cs` line 22 |
| `[RequiresPermission]` on FileNilReturn, RespondToNotice, AssignNoticeToCa, GenerateEInvoice, CreateEWayBill | PASS | Confirmed on all five command classes |
| Notice IDOR — GetNotice filters by OrganizationId | FAIL | SEC-038: no org-scope filter in any of the 3 notice handlers |
| Notice attachments — handler validates attachments_jsonb shape | PASS | Metadata-only GCS URI stored; no raw bytes accepted; GcsUri regex on UploadForm16 |
| IRP/EWB adapters redact tokens before persisting | PASS | `RedactSensitiveFields()` regex in both ProductionIrpClient and ProductionEwbClient |
| Rate limiting stricter on POST /gst/e-invoices and POST /gst/notices | FAIL | SEC-043: standard policy only |
| DPDP cascade for gst.invoices + gst.notices | FAIL | SEC-040: no AccountDeletionSubscriber |

#### ItrService — 17 endpoints

| Check | Result | Notes |
|-------|--------|-------|
| RequireAuthorization on all 17 endpoints | PASS | All endpoints in Itr.cs carry `.RequireAuthorization()` |
| PAN stored via IPanEncryptionService (not plaintext) | PARTIAL | UpdateProfileCommand stores client-supplied PanCipher; UploadForm16 stores client-supplied cipher — see SEC-041 |
| TaxComputationEngine reads from itr.tax_slab_versions — no hardcoded slabs | PASS | TaxComputationEngine.cs reads DB, no hardcoded constants |
| tax_slab_version_id + computation_hash pinned on every result | PASS | ComputeTaxCommand.cs line 94: `filing.PinComputation(...)` |
| itr_v_uri TTL — stable object key, on-demand signed URL | PASS | FilingConfiguration stores ItrVObjectKey (max 500); GetFilingQuery explicitly does not return URI (P6-HANDOFF-20 noted in doc comment) |
| DPDP cascade for itr.assessee_profiles + itr.filings + itr.form_16_extracts + itr.notices | FAIL | SEC-040: no AccountDeletionSubscriber |
| PermissionBehavior registered in DI | PASS | ItrService.Application/DependencyInjection.cs (analogous to GstService pattern) |
| `[RequiresPermission]` on all required commands | PASS | UpdateProfile, ComputeTax, SubmitForCaReview, CaApprove, CaReject, MarkFiled, MarkEVerified, RespondToNotice all carry attribute |
| Filing handlers scope by authenticated user (IDOR check) | FAIL | SEC-039: no ICurrentUser injection in any of the 10 filing handlers |
| Form 16 OCR — server-side, not trusting client parsed JSON | FAIL | SEC-041: backend stores client-submitted PAN cipher; OCR integration deferred |
| Refund polling subscriber — idempotent on event_id | PASS | ItrRefundPollingHandler checks existing RefundStatusEntry by FilingId before creating |
| Filing state machine — invalid transitions return Result.Failure | PASS | Filing.SubmitForCaReview(), ApproveByCa(), MarkFiled() return Result with conflict errors |

#### Admin Frontend

| Check | Result | Notes |
|-------|--------|-------|
| All API calls via src/admin/src/lib/* | PASS | NoticeDetailPage uses gstApi; CaTaxComputationPanelPage uses itrApi |
| No dangerouslySetInnerHTML with untrusted content | PASS | Not found in any Phase 6B/6D pages |
| Auth tokens in Authorization header (not cookies) | PASS | Confirmed from prior phases — apiClient pattern unchanged |
| CaTaxComputationPanelPage debounced recompute — no cross-org leakage | PASS | Server scopes result by filingId; sequence ref prevents stale results |
| PdfViewer uses signed GCS URLs | PASS | NoticeDetailPage line 344: renders `notice.attachments[0].signedUrl` |
| HsnSacTypeahead search query reflected in URL | PASS | Query passed via TanStack Query key only, not URL params — no XSS reflection vector |
| Response draft storage | FAIL | SEC-042: draft stored in localStorage |

#### Mobile

| Check | Result | Notes |
|-------|--------|-------|
| SecureStore for tokens | PASS | Unchanged from prior phases |
| PAN: panCipher passed through as-is (no raw PAN) | PASS (with INFO-002) | itr.ts comment and type confirm cipher-only; mobile sends empty string MVP placeholder |
| Form 16 upload — employeePanCipher empty in MVP | INFO | INFO-002: placeholder; will be rejected by backend validator |
| Deep-link router SEC-034 — no regression | PASS (open) | SEC-034 still open; new itr/gst handlers in router are safe (no id param) |
| No PII in logs — ITR screens | PASS | No console.log/error calls found in any itr/ screen files |
| useSensitiveScreen on Form16UploadScreen | PASS | `useSensitiveScreen()` called at line 48 |

#### Cross-cutting

| Check | Result | Notes |
|-------|--------|-------|
| New GST/ITR notification events in catalog | PASS | 6 GST + 6 ITR events in catalog; templates use {{message}} placeholder — no raw PII fields |
| DLT compliance for SMS templates | INFO (existing) | P6E-RISK-02 still open — DLT template IDs seeded as null |
| Cloud Scheduler Pub/Sub jobs — OIDC auth | PASS | Confirmed from Phase 6A+6E devops review; no new schedulers in 6B/6D |

---

### Phase 6B + 6D Summary

CRITICAL: 0 | HIGH: 3 (SEC-038, SEC-039, SEC-040) | MEDIUM: 3 (SEC-041, SEC-042, SEC-034 carry-forward) | LOW: 1 (SEC-043) | INFO: 1 (INFO-002)

**Go / No-Go: NO-GO**

Three HIGH findings must be resolved before this phase can be approved for staging:

1. **SEC-038** — IDOR on all three GST notice handlers. Any authenticated user can read/modify any org's notices. Fix: inject ICurrentUser, add org-scope filter.
2. **SEC-039** — IDOR on all ITR filing handlers. Any authenticated user can compute tax on, submit, or mark-filed another user's ITR. Fix: inject ICurrentUser, scope by assessee ownership.
3. **SEC-040** — DPDP Right-to-Erasure cascade missing in GstService and ItrService. Both services hold PAN ciphertext, salary data, and notice body content with no deletion path. Fix: implement AccountDeletionSubscriber in both services following the SEC-027 pattern.

The remaining MEDIUM/LOW findings (SEC-041, SEC-042, SEC-043) and INFO-002 are pre-production blockers that should be resolved before any production launch but do not block staging.

*Review completed: 2026-04-25*

---

### Re-audit (after backend hotfix, 2026-04-25)

**Scope**: Focused verification of SEC-038, SEC-039, SEC-040, SEC-043 (4 HIGH/LOW blockers marked FIXED by backend-agent). Spot-check of SEC-041 (deferred TODO), SEC-042 (admin draft storage), SEC-034 (deep-link UUID validation). No new application code changed in mobile, admin, or infra.
**Review Date**: 2026-04-25
**Reviewer**: security-reviewer agent
**Test baseline**: 240/240 unit tests pass, 0 build errors, 0 warnings (per backend-agent hotfix report)

---

#### SEC-038 — CONFIRMED-FIXED

**Files read**:
- `backend/Services/FinanceService/Finance.Application/Gst/Notices/Queries/GetNotice/GetNoticeQuery.cs`
- `backend/Services/FinanceService/Finance.Application/Gst/Notices/Commands/RespondToNotice/RespondToNoticeCommand.cs`
- `backend/Services/FinanceService/Finance.Application/Gst/Notices/Commands/AssignNoticeToCa/AssignNoticeToCaCommand.cs`
- `tests/unit/GstService/GstNoticeIdorTests.cs`

**Evidence**:

`GetNoticeQueryHandler` (line 42) injects `ICurrentUser` via primary constructor. The EF query at line 53 applies an inline org-scope filter: `n.OrganizationId == currentUser.OrganizationId && n.DeletedAt == null` — no fetch-then-check; cross-org requests cannot retrieve the entity at the query level. Returns `Error.NotFound` on miss (not `Error.Forbidden`) to avoid existence leak.

`RespondToNoticeCommandHandler` (line 35) injects `ICurrentUser`. Fetches by `n.Id` first (line 42), then post-fetch check at line 50: `if (notice.OrganizationId != currentUser.OrganizationId)` returns `Error.NotFound`. Comment on line 49 explicitly references SEC-038.

`AssignNoticeToCaCommandHandler` (line 28) follows identical pattern: `ICurrentUser` injected, post-fetch org check at line 43, `Error.NotFound` on mismatch. Comment on line 42 references SEC-038.

Test file `GstNoticeIdorTests.cs`: 7 tests present, seeding a notice owned by `_orgId` and asserting behavior for same-org and different-org callers. Cross-org `GetNotice_DifferentOrg_ReturnsNotFound` (line 60), `RespondToNotice_DifferentOrg_ReturnsNotFound` (line 100), `AssignNoticeToCa_DifferentOrg_ReturnsNotFound` (line 130) all assert `result.IsSuccess == false` and `error.Code.StartsWith("GstNotice.NotFound")`. Same-org success tests also present.

**Status: CONFIRMED-FIXED**

---

#### SEC-039 — CONFIRMED-FIXED (3 handlers sampled)

**Files read**:
- `backend/Services/FinanceService/Finance.Application/Itr/Filings/Queries/GetFiling/GetFilingQuery.cs`
- `backend/Services/FinanceService/Finance.Application/Itr/Filings/Queries/ListFilings/ListFilingsQuery.cs`
- `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/CaApprove/CaApproveCommand.cs`
- `tests/unit/ItrService/FilingIdorTests.cs`

**Evidence**:

`GetFilingQueryHandler` (line 27): `ICurrentUser` injected. Filing fetched by `f.Id`. Post-fetch, assessee is looked up by `f.AssesseeId`; if `assessee is null || assessee.OrganizationId != currentUser.OrganizationId` returns `Error.NotFound("Filing.NotFound", ...)`. Comment at line 37 references SEC-039.

`ListFilingsQueryHandler` (line 29): `ICurrentUser` injected. Verifies assessee org ownership before listing: `if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)` returns `new ListFilingsResponse([], 0, ...)` — empty list (not error) consistent with the specified behavior to avoid existence leak on the assessee. Comment at line 34 references SEC-039.

`CaApproveCommandHandler` (line 18): `ICurrentUser` injected. Same pattern as GetFiling: post-fetch assessee ownership check at line 29; `Error.NotFound` returned on cross-org. Comment at line 26 references SEC-039.

Test file `FilingIdorTests.cs`: 9 tests present, covering GetFiling, ListFilings, SubmitForCaReview, CaApprove, CaReject, MarkFiled, MarkEVerified, ComputeTax — all assert cross-org returns `NotFound` or empty list. `ListFilings_DifferentOrg_ReturnsEmptyList` (line 99) explicitly asserts `IsSuccess == true` with `TotalCount == 0` and empty `Items` — correct behavior. All 9 tests verify the expected outcome.

**Status: CONFIRMED-FIXED**

---

#### SEC-040 — CONFIRMED-FIXED

**Files read**:
- `backend/Services/FinanceService/Finance.Infrastructure/Gst/Messaging/AccountDeletionSubscriber.cs`
- `backend/Services/FinanceService/Finance.Infrastructure/Itr/Messaging/AccountDeletionSubscriber.cs`
- `backend/Services/FinanceService/Finance.Infrastructure/Gst/DependencyInjection.cs`
- `backend/Services/FinanceService/Finance.Infrastructure/Itr/DependencyInjection.cs`
- `tests/unit/GstService/GstDpdpErasureTests.cs`
- `tests/unit/ItrService/ItrDpdpErasureTests.cs`

**Evidence — GstService**:

`GstService.Infrastructure/Messaging/AccountDeletionSubscriber.cs`: Implements `BackgroundService`. Subscribes to `account-deletion-events` via configurable subscription name (`PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_GST` env var, default `gst-service-account-deletion-sub`). `EraseUserDataAsync` (line 100) performs: (1) soft-deletes `gst.gst_invoices` where `CreatedBy == userIdString` (line 111); (2) soft-deletes `gst.gst_notices` where `CreatedBy == userIdString`, with GCS attachment deletion (line 122); (3) anonymizes notices where `RespondedBy == userId` via `notice.AnonymizeRespondent()` (line 140); (4) cascades to soft-delete `gst.e_invoices` and `gst.e_way_bills` tied to erased invoice IDs (lines 144–167). Malformed messages are ACKed (line 74) to prevent redelivery loops; exceptions NACK (line 91). DI: `GstService.Infrastructure/DependencyInjection.cs` line 103: `services.AddHostedService<AccountDeletionSubscriber>()` confirmed present with SEC-040 comment.

**Evidence — ItrService**:

`ItrService.Infrastructure/Messaging/AccountDeletionSubscriber.cs`: Same `BackgroundService` pattern. Subscription name configurable (`PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION_ITR`, default `itr-service-account-deletion-sub`). `EraseUserDataAsync` (line 99) performs: (1) finds assessee profiles by `UserId == userIdString`, calls `assessee.Anonymize("DPDP_ERASURE")` then sets `DeletedAt` (line 117); (2) soft-deletes and anonymizes filings for erased assessees (line 128); (3) soft-deletes and anonymizes `form_16_extracts` for erased filings (line 145); (4) soft-deletes and anonymizes `itr.notices` for erased assessees (line 153); (5) anonymizes `refund_status_log` entries by nulling `CreatedBy`/`UpdatedBy` (line 169). DI: `ItrService.Infrastructure/DependencyInjection.cs` line 82: `services.AddHostedService<AccountDeletionSubscriber>()` confirmed present with SEC-040 comment.

**Tests**: `GstDpdpErasureTests.cs` (4 tests) verifies `GstNotice.AnonymizeRespondent()` clears `RespondedBy`, idempotency, and soft-delete behavior. `ItrDpdpErasureTests.cs` (6 tests) verifies `Assessee.Anonymize()`, `Filing.Anonymize()`, `Form16Extract.Anonymize()`, `ItrNotice.Anonymize()`, and two EF-in-memory tests confirming the subscriber's scoped cascade behavior including cross-user non-interference. All test assertions are substantive.

**Observation — GstService scope**:

The subscriber erases invoices/notices where `CreatedBy == userId`. This aligns with `gst.invoices` customer/supplier PII (P6-HANDOFF-16). It does not soft-delete org-level invoices that the user did not personally create. This is consistent with the DPDP Act 2023 requirement applying to personal data about the data principal, not all org data the user ever interacted with. Acceptable.

**Status: CONFIRMED-FIXED**

---

#### SEC-043 — CONFIRMED-FIXED

**Files read**:
- `backend/Services/FinanceService/Finance.WebApi/Program.cs`
- `backend/Services/FinanceService/Finance.WebApi/Endpoints/Gst/Gst.cs`

**Evidence**:

`Program.cs` lines 43–61: `AddRateLimiter` registers two policies. `"standard"` (line 45): 100 req/min, fixed window. `"gst-write-strict"` (line 53): 30 req/min, fixed window. Comment at line 52 explicitly references SEC-043. `options.RejectionStatusCode = 429` set (line 60). `app.UseRateLimiter()` called at line 79.

`Gst.cs` endpoints: `POST /notices` (line 93): `.RequireRateLimiting("gst-write-strict")`. `POST /e-invoices` (line 104): `.RequireRateLimiting("gst-write-strict")`. Comments on lines 92 and 103 reference SEC-043. All other endpoints use `"standard"`.

**Note**: The original finding (SEC-043) was classified LOW (not HIGH as stated in the bug-log FIXED entry — the bug-log entry re-labels it). The fix correctly addresses the substance of the finding. The `"gst-write-strict"` policy is 30 req/min vs the 30 req/min specified — matches the hotfix description exactly.

**One observation**: `POST /gst/e-way-bills` remains on `"standard"` (line 108). E-way bill creation also triggers the EWB external API and could benefit from the stricter policy. This is not a regression from the finding as filed (the finding named `/gst/e-invoices` and `/gst/notices` only), but is flagged as an INFO observation below.

**Status: CONFIRMED-FIXED**

---

#### SEC-041 — DEFERRED: TODO PRESENT, STATUS OPEN

**File read**: `backend/Services/FinanceService/Finance.Application/Itr/Form16/Commands/UploadForm16/UploadForm16Command.cs`

The handler was located at `UploadForm16Command.cs` (handler and command co-located, not a separate `*CommandHandler.cs` file). Lines 53–55 contain:

```
// SEC-041 TODO: EmployeePanCipher should be server-side encrypted via IPanEncryptionService
// (not client-supplied cipher). Deferred: requires adding IPanEncryptionService to
// ItrService.Application.Interfaces + Infrastructure implementation + DI wiring.
```

The TODO is present and correctly documents the deferred scope. The code still stores `request.EmployeePanCipher` verbatim (line 56). The SEC-039 ownership check is also present at lines 48–51 (ICurrentUser injected, assessee org check). The deferred status is consistent with the hotfix report.

**Status: OPEN (Medium) — deferred to Phase 6F. TODO comment confirmed present. Acceptable per scope agreement.**

---

#### SEC-042 — STILL OPEN (unfixed by this hotfix)

**File read**: `src/admin/src/pages/gst/NoticeDetailPage.tsx`

Lines 30, 108, 148–152 unchanged. `DRAFT_STORAGE_PREFIX = 'snap_gst_notice_draft_'` (line 30). `storageKey` assigned at line 108. `localStorage.getItem(storageKey)` on mount (line 131). `localStorage.setItem(storageKey, ...)` in `saveDraft` callback (line 149). `localStorage.removeItem(storageKey)` on successful submit (line 180).

No change to `sessionStorage` was made. This hotfix was scoped to backend only; frontend-dev did not receive a task for SEC-042.

**Status: OPEN (Medium) — carries to Phase 6F. Not a blocker for this hotfix approval gate.**

---

#### SEC-034 — CONFIRMED NOT REGRESSED

**File read**: `mobile/src/notifications/notificationRouter.ts`

File is identical to the version reviewed in the Phase 6 re-audit of 2026-04-25. Lines 44–56: `callback` and `document` cases still pass `id` directly to `navigationRef.navigate` without UUID validation. The `gst` (line 37) and `itr` (line 41) cases added in Phase 6B do not use `id` parameters — they navigate to dashboards only. No regression introduced by Phase 6B/6D mobile work.

**Status: OPEN (Medium) — no regression. Carries to Phase 6F (mobile-dev). Not a blocker for this hotfix approval gate.**

---

#### INFO — E-Way Bill Rate Limiting (Observation Only)

`POST /gst/e-way-bills` at `Gst.cs` line 108 uses `.RequireRateLimiting("standard")` (100 req/min). The EWB external API is subject to NIC rate limiting similarly to the IRP. This was not part of SEC-043 as filed and is not a regression. Flagged informally for backend-agent to consider applying `"gst-write-strict"` in Phase 6F.

**Severity: INFO (not a new finding)**

---

### Re-audit Summary

| ID | Severity | Status After Hotfix |
|----|----------|---------------------|
| SEC-038 | HIGH | CONFIRMED-FIXED — ICurrentUser injected; inline org-scope EF filter on GetNotice; post-fetch org check on RespondToNotice + AssignNoticeToCa; 7 IDOR unit tests verified |
| SEC-039 | HIGH | CONFIRMED-FIXED — ICurrentUser injected in all sampled handlers; assessee ownership check pattern consistent; ListFilings returns empty list (not error) for cross-org; 9 IDOR unit tests verified |
| SEC-040 | HIGH | CONFIRMED-FIXED — AccountDeletionSubscriber implemented in both GstService and ItrService; both registered via AddHostedService<> in DI; full erasure cascade per P6-HANDOFF-16 and P6-HANDOFF-21; 10 domain + integration tests verified |
| SEC-043 | LOW | CONFIRMED-FIXED — "gst-write-strict" policy (30 req/min) registered in Program.cs; applied to POST /gst/notices and POST /gst/e-invoices in Gst.cs |
| SEC-041 | MEDIUM | OPEN — deferred to Phase 6F; TODO comment confirmed present at correct location |
| SEC-042 | MEDIUM | OPEN — admin localStorage draft not fixed; frontend hotfix not in scope |
| SEC-034 | MEDIUM | OPEN — no regression; UUID validation still absent in notificationRouter.ts |

**CONFIRMED-FIXED: 4 (SEC-038 HIGH, SEC-039 HIGH, SEC-040 HIGH, SEC-043 LOW)**
**STILL-OPEN: 3 (SEC-041 Med/deferred, SEC-042 Med/deferred, SEC-034 Med/deferred)**
**NEW FINDINGS: 0**

### Go / No-Go

**GO**

All 4 findings that were blocking this hotfix approval gate are CONFIRMED-FIXED by source-code inspection. 240/240 tests pass. The three remaining OPEN items (SEC-041, SEC-042, SEC-034) are all Medium severity and are explicitly deferred to Phase 6F — this deferral is within the acceptance criteria specified by the orchestrator. No new Critical or High findings were discovered during this re-audit.

Phase 6B + 6D is clear for staging approval.

*Re-audit completed: 2026-04-25*

---

## Phase 6C Security Review (2026-04-25)

**Scope:** LoanService (13 endpoints, state machine, EligibilityEngine, bank adapters, disbursement webhook, AccountDeletionSubscriber), ReportService (LoanPackage PDF, signed URLs, sha256 hash), NotificationService (3 new loan events), Admin frontend (PartnerBanksSettingsPage, PayloadViewer, PdfViewerWebPackagePane, LoanDetailPage), Mobile (6 loan screens, consent flow, biometric gates), Database migrations 026–028.
**Review Date:** 2026-04-25
**Reviewer:** security-reviewer agent

---

### Pattern Cross-Reference: Prior Phase Fixes Inherited from Day 1

The following patterns from SEC-026..029 (Phase 6A+6E) and SEC-038..043 (Phase 6B+6D) were verified in Phase 6C code:

| Prior SEC | Pattern | Phase 6C Status |
|-----------|---------|-----------------|
| SEC-026 | PermissionBehavior registered in DI | CONFIRMED — `LoanService.Application/DependencyInjection.cs` line 20 |
| SEC-026 | `[RequiresPermission]` on all write commands | CONFIRMED — all 11 commands decorated |
| SEC-029 | ICurrentUser injected; EF inline org filter on queries | CONFIRMED — all sampled handlers apply OrgId predicate |
| SEC-027 | AccountDeletionSubscriber exists and wired | CONFIRMED — `AddHostedService<AccountDeletionSubscriber>()` in Infrastructure DI line 104 |
| SEC-027 | Anonymize-only (no hard-delete attempt) | CONFIRMED — no Delete calls; comment warns against deleting from consents/status_log |
| SEC-038/039 | IDOR pattern prevented on resource-by-ID handlers | CONFIRMED — all sampled handlers apply org filter; eligibility cross-org check at line 47-49 |
| SEC-040 | DPDP subscriber for new service | CONFIRMED — LoanService AccountDeletionSubscriber present and registered |
| P6-HANDOFF-28 | Status transition logs in same unit of work | CONFIRMED — all state-machine commands add ApplicationStatusLog before SaveChangesAsync |
| P6-HANDOFF-27 | ICredentialEncryptionService with AES-GCM | CONFIRMED — CredentialEncryptionService uses `AesGcm`; nonce 12 bytes / tag 16 bytes |

---

### Findings

#### [HIGH] SEC-044: Disbursement Webhook HMAC Verification Bypassable When WebhookSecretRef Is Null

- **File:** `backend/Services/FinanceService/Finance.Infrastructure/Loan/Webhooks/DisbursementWebhookHandler.cs`
- **Line:** 58–75
- **Description:** The HMAC-SHA256 signature verification block is guarded by `if (!string.IsNullOrEmpty(bank.WebhookSecretRef))`. If a partner bank record has a null or empty `WebhookSecretRef` — through admin error, partial configuration, or deliberate omission — the entire signature verification is silently skipped and the webhook is processed as legitimate. An attacker who can send HTTP to the webhook endpoint and knows a valid `bankId` (UUID, guessable from the admin UI or by enumeration) can record any disbursement amount for any loan application assigned to that bank, with zero authentication. This endpoint is intentionally unauthenticated (no JWT), so the HMAC is the sole trust boundary. Additionally, the implementation uses hex-string byte comparison (same as SEC-001/NEW-001 pattern) rather than decoded raw bytes — the constant-time comparison is length-sensitive to case normalization, not a bypass but a deficiency in the pattern.
- **Impact:** Unauthorized disbursement recording; financial data integrity violation; potential fraud trigger for LOAN_DISBURSED notifications.
- **Recommended Fix:** (1) Reject the webhook when `WebhookSecretRef` is null or empty: `if (string.IsNullOrEmpty(bank.WebhookSecretRef)) return WebhookProcessingResult.Rejected("Bank webhook secret is not configured.");` (2) Add a NOT NULL constraint or application-layer validation on `WebhookSecretRef` when creating REST/webhook-enabled PartnerBank records. (3) Replace UTF-8 hex-string comparison with `Convert.FromHexString` on both sides as recommended for SEC-001.
- **Reference:** CWE-306 (Missing Authentication), CWE-347 (Improper Verification of Cryptographic Signature)

---

#### [MEDIUM] SEC-045: OAuth Token Displayed Unmasked in PayloadViewer

- **File:** `src/admin/src/components/ui/PayloadViewer.tsx`
- **Line:** 129–136
- **Description:** The `oauth-token` kind branch renders the full `payload` string in a `<pre>` block with no masking. The component JSDoc states "OAuth tokens are never displayed — only masked + scopes shown" but the code contradicts this. The JSON kind auto-redacts via `redactJson`, but the `oauth-token` path bypasses redaction entirely. Any admin who opens Bank Communications detail for an OAuth-adapter bank reads the live bearer token from the DOM.
- **Impact:** Bearer token exposure; can be used to impersonate SnapAccount to the partner bank REST API.
- **Recommended Fix:** In the `oauth-token` branch, render only scopes and expiry (if parseable from payload) and mask the token to `Bearer ***${last6chars}`. Never render the full token string in the DOM.
- **Reference:** CWE-312 (Cleartext Storage of Sensitive Information); OWASP A02:2021

---

#### [MEDIUM] SEC-046: Signed URL TTL Is 1 Hour — Exceeds 15-Minute Maximum

- **File:** `backend/Services/FinanceService/Finance.Application/Loan/LoanApplications/Queries/GetPackageDownloadUrl/GetPackageDownloadUrlQuery.cs` line 45; `backend/Services/FinanceService/Finance.Application/Report/Reports/Queries/GetDownloadUrl/GetDownloadUrlQuery.cs` line 46
- **Description:** Both handlers use `TimeSpan.FromHours(1)`. P6-HANDOFF-20 specifies a maximum of 15 minutes for signed URLs exposing PII-containing documents. LoanPackage PDFs contain PAN, Aadhaar references, bank account numbers, and income data. A 1-hour window significantly increases the exposure window for URL leakage via browser history, referrer headers, or accidental forwarding.
- **Recommended Fix:** Change `TimeSpan.FromHours(1)` to `TimeSpan.FromMinutes(15)` in both handlers. The mobile client already uses `staleTime:0 / gcTime:0` ensuring fresh URL fetch per view.
- **Reference:** OWASP A01:2021; P6-HANDOFF-20

---

#### [MEDIUM] SEC-047: LoanDisbursed Notification Passes DisbursedAmount to Push Channel

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Notification/Messaging/LoanEventsSubscriber.cs`
- **Line:** 123–130
- **Description:** `DispatchNotificationAsync` builds a `variables` dictionary including `["disbursedAmount"] = $"₹{payload.DisbursedAmount.Value:N2}"`. This is passed to `SendNotificationCommand` for `LOAN_DISBURSED`, which uses Push (FCM) channel (`NotificationEventCatalog.cs` line 37). If the FCM template uses `{{disbursedAmount}}`, the exact rupee amount appears in the push notification body and is visible on device lock screens. The checklist explicitly required push body must NOT include disbursed_amount. Even if the current template does not use it, the variable is present and can leak if the template is updated without a security review.
- **Impact:** Financial PII on device lock screen; DPDP Act 2023 data minimization violation.
- **Recommended Fix:** Remove `disbursedAmount` from the variables dictionary for Push channel dispatch. Use a generic push message ("Your loan has been disbursed — open app for details"). Include amount only for email/SMS channels where the message is not displayed on lock screens.
- **Reference:** DPDP Act 2023 data minimization; CWE-312

---

#### [MEDIUM] SEC-048: Biometric Gates Are Alert-Dialog Bypasses — No Real Biometric Authentication

- **File:** `mobile/src/screens/loans/LoanConsentScreen.tsx` lines 140–156; `mobile/src/screens/loans/LoanPackagePreviewScreen.tsx` lines 61–80, 115–125
- **Description:** Both the view-time and submit-time biometric gates use `Alert.alert()` confirmation dialogs with no actual biometric check. Both files acknowledge this: "expo-local-authentication not installed — Alert fallback (P6-HANDOFF-24)". An `Alert.alert()` requires only a tap on "Confirm" — no fingerprint, no face ID, no device PIN. Consent signing is a legal commitment under DPDP Act 2023; the biometric requirement exists to bind the user's physical identity to the consent record.
- **Impact:** No identity verification before legal consent signing or PII document access. Physical access to an unlocked device is sufficient.
- **Recommended Fix:** Install `expo-local-authentication` and call `LocalAuthentication.authenticateAsync({ promptMessage: '...' })`. The Alert fallback is only acceptable in CI/simulator environments where `hasHardwareAsync()` returns false. P6-HANDOFF-24 must be resolved before production.
- **Reference:** NIST SP 800-63B AAL2; OWASP MASVS-AUTH-2

---

#### [MEDIUM] SEC-049: PDF Watermark Text Diverges from Canonical Specification

- **File:** `backend/Services/FinanceService/Finance.Infrastructure/Report/Reports/SnapAccountDocumentStyles.cs`
- **Line:** 13–14
- **Description:** The canonical watermark per checklist: `"Generated by SnapAccount | {orgName} | {date} | Package ID: {id} | Not a CA certification"`. Actual constant: `"Generated by SnapAccount | Not a CA Certification | For Lending Purposes Only"`. The watermark omits `orgName`, `date`, and `Package ID` — all required for document traceability. Without the Package ID in the watermark, a printed PDF cannot be linked back to its GCS object or the generating org for forensic purposes.
- **Recommended Fix:** Pass `OrgName`, `LoanApplicationId`, and generation timestamp to `LoanPackageReportGenerator.BuildDocument()` and render the full canonical watermark dynamically. `WatermarkText` should be a format string, not a constant.
- **Reference:** P6-HANDOFF canonical watermark specification

---

#### [MEDIUM] SEC-050: Consent Text Version Hardcoded in Mobile Client

- **File:** `mobile/src/screens/loans/LoanConsentScreen.tsx`
- **Line:** 46
- **Description:** `const CONSENT_VERSION = '1.4'` is hardcoded. The comment acknowledges this must eventually fetch from the backend consent catalog. When legal updates consent text and the backend bumps the version, users on older app builds will record consents against the stale version string `'1.4'`, breaking the DPDP audit trail requirement that consent must reference the exact text presented to the user.
- **Recommended Fix:** Add `GET /loans/consent-catalog` endpoint returning current version per type. Mobile client must fetch before rendering the consent screen. Cache with 15-minute TTL; do not persist across app restarts.
- **Reference:** DPDP Act 2023 Section 6 (informed consent); P6-HANDOFF-26

---

#### [INFO] INFO-006: AccountDeletionSubscriber Idempotency Check Body Is Empty

- **File:** `backend/Services/FinanceService/Finance.Infrastructure/Loan/Messaging/AccountDeletionSubscriber.cs`
- **Line:** 78–83
- **Description:** The idempotency check block creates a scope and gets the DbContext, but executes no query. The comment says "Simple deduplication via checking anonymizedAt already set" but this is never checked. The `AnonymiseUserDataAsync` method is de-facto idempotent (filters `AnonymizedAt == null`) but the explicit dedup block is dead code that misleads future maintainers.
- **Recommended Fix:** Remove the empty scope creation or implement a real idempotency key check. Add a comment explaining the method-level idempotency.
- **Reference:** SEC-031; CWE-561 (Dead Code)

---

#### [INFO] INFO-007: Webhook Rate Limiting Absent — Consider IP Allowlisting

- **File:** `backend/Services/FinanceService/Finance.WebApi/Endpoints/Loan/Loans.cs`
- **Line:** 153–156
- **Description:** The disbursement webhook endpoint (`POST /loans/webhooks/{bankId}/disbursement`) has no rate limiting. The comment states "No rate limit (bank calls only)". This is an accepted risk for B2B webhook endpoints that are IP-allowlisted at the network layer. If Cloud Armor or VPC firewall rules are not configured to allowlist partner bank IPs, this endpoint is exposed to unrestricted request volume from the internet. The HMAC check provides integrity protection but not availability protection.
- **Recommended Fix:** Confirm Cloud Armor IP allowlist is configured for each partner bank's outbound IP range before production. As a defense-in-depth measure, add a dedicated "webhook" rate limit policy (e.g., 60 req/min per IP) that is separate from the standard policy.
- **Reference:** OWASP API Security — API4:2023 Unrestricted Resource Consumption

---

### Phase 6C Checklist Pass/Fail Summary

| Checklist Item | Status | Notes |
|---|---|---|
| PermissionBehavior in DI | PASS | DependencyInjection.cs line 20 |
| [RequiresPermission] on all write commands | PASS | All 11 commands verified |
| GetApplication: ICurrentUser + EF inline org filter | PASS | OrgId in Where predicate |
| SubmitApplication: post-fetch org check + status log in UoW | PASS | Lines 51, 75-84 |
| AssignToBank: post-fetch org check + status log in UoW | PASS | Lines 51, 91-100 |
| RecordDisbursement: post-fetch org check + status log in UoW | PASS | Lines 51, 62-72 |
| RecordConsent: HMAC server-side from Secret Manager | PASS | IConsentHmacKeyProvider injected |
| Webhook: CryptographicOperations.FixedTimeEquals | PASS | Lines 68-74 |
| Webhook: HMAC non-bypassable | FAIL | SEC-044 HIGH — null WebhookSecretRef skips all verification |
| Webhook: idempotency DB table with 30-day TTL | PASS | WebhookIdempotencyKey; ExpiresAt = UtcNow.AddDays(30) |
| AccountDeletionSubscriber exists + wired | PASS | AddHostedService line 104 |
| AccountDeletionSubscriber: anonymize-only, no hard-delete | PASS | No Delete calls; warning comment present |
| EligibilityEngine: org-scoped | PASS | CallerOrgId check at line 47-49 |
| ICredentialEncryptionService: AES-GCM | PASS | AesGcm class; nonce+ciphertext+tag |
| RestPartnerBankAdapter: tokens not logged | PASS | Secrets in form content only; exception message generic |
| Rate limiting on RecordConsent | PASS | .RequireRateLimiting("standard") |
| DB BEFORE DELETE trigger on consents | PASS | Migration 027 lines 164-167 |
| DB BEFORE DELETE trigger on status_log | PASS | Migration 028 lines 127-129 |
| HMAC signature_hash CHECK 32-byte | PASS | Migration 027 line 141 |
| LoanPackage PDF watermark canonical copy | FAIL | SEC-049 MEDIUM — omits orgName/date/packageId |
| ReportService: org-scoped | PASS | OrgId from currentUser at line 63 |
| ReportService: sha256_hash recorded | PASS | LoanPdfPackages.Sha256Hash + ReportJob.Sha256HashHex |
| Signed URL TTL <= 15 min | FAIL | SEC-046 MEDIUM — both services use 1-hour TTL |
| Admin: PartnerBankSchema excludes secrets | PASS | No api_config_encrypted/apiKey/clientSecret in GET schema |
| Admin: PayloadViewer iframe sandbox="" | PASS | PayloadViewer.tsx line 119 |
| Admin: JSON redaction of token/secret/password/apikey | PASS | redactJson auto-redacts matching keys |
| Admin: oauth-token masked | FAIL | SEC-045 MEDIUM — full payload in unmasked <pre> |
| Admin: No raw fetch in loan pages | PASS | All calls via loanApi.ts shared axios |
| Mobile: useSensitiveScreen on LoanConsentScreen | PASS | Line 80 |
| Mobile: useSensitiveScreen on LoanPackagePreviewScreen | PASS | Line 51 |
| Mobile: useSensitiveScreen on LoanStatusScreen | PASS | Line 31 |
| Mobile: scroll-to-bottom gate | PASS | canSign = scrolledToBottom && checked |
| Mobile: 2-stage biometric (real) | FAIL | SEC-048 MEDIUM — Alert.alert() bypass |
| Mobile: staleTime:0/gcTime:0 on signed URL | PASS | LoanPackagePreviewScreen.tsx lines 94-95 |
| Mobile: consent_text_version sent verbatim | PASS | CONSENT_VERSION sent in API call |
| Mobile: consent_text_version dynamically fetched | FAIL | SEC-050 MEDIUM — hardcoded '1.4' |
| Mobile: no PII in logs | PASS | No console.log/Sentry in loan screen files |
| Notification: 3 new loan events in catalog | PASS | NotificationEventCatalog.cs lines 37-39 |
| Notification: push body excludes disbursed_amount | FAIL | SEC-047 MEDIUM — disbursedAmount in variables dict for push channel |

---

### Phase 6C Summary

**CRITICAL: 0 | HIGH: 1 | MEDIUM: 5 | LOW: 0 | INFO: 2**

**Go / No-Go: NO-GO**

SEC-044 (HIGH) blocks staging. The disbursement webhook HMAC verification can be bypassed for any bank with a null WebhookSecretRef — an unauthenticated endpoint with direct financial consequences (disbursement recording). This must be fixed before staging deployment.

Patterns from SEC-026..029 and SEC-038..040/043 are confirmed applied from day 1. PermissionBehavior, ICurrentUser org-scoping, AccountDeletionSubscriber, AES-GCM credential encryption, HMAC consent signatures, and UoW status logging are all correctly in place. The HIGH finding is an isolated operational bypass, not a systemic pattern regression.

Blocking before staging: SEC-044.
Non-blocking deferred items: SEC-045, SEC-046, SEC-047, SEC-048, SEC-049, SEC-050.

*Review completed: 2026-04-25*

---

### Re-audit (after backend hotfix, 2026-04-25)

**Trigger:** Backend hotfix shipped SEC-044 (mandatory HIGH fix) plus bonus fixes SEC-046, SEC-047, SEC-049. 313/313 tests pass post-hotfix. This re-audit verifies each fix and issues Go/No-Go.

**Reviewer:** security-reviewer agent
**Re-audit Date:** 2026-04-25
**Files read:** DisbursementWebhookHandler.cs, CreatePartnerBankCommand.cs, DisbursementWebhookSecurityTests.cs, GetPackageDownloadUrlQuery.cs (LoanService), GetDownloadUrlQuery.cs (ReportService), LoanEventsSubscriber.cs, SnapAccountDocumentStyles.cs, LoanPackageReportGenerator.cs

---

#### SEC-044 — HIGH: Disbursement Webhook HMAC Bypass — CONFIRMED-FIXED

**Evidence read from source:**

`DisbursementWebhookHandler.cs` lines 61–69 (Step 2 comment block):

```
if (string.IsNullOrWhiteSpace(bank.WebhookSecretRef))
{
    logger.LogError("... Bank {BankId} has no WebhookSecretRef configured — " +
        "rejecting webhook to prevent unauthenticated disbursement injection. ...", bankId);
    return WebhookProcessingResult.Rejected("Bank webhook secret is not configured.");
}
```

The prior bypass condition (`if (!string.IsNullOrEmpty(...))` with a fallthrough) has been replaced with a hard-reject guard using `IsNullOrWhiteSpace`. The guard fires at line 61 — before `GetWebhookSecretAsync` (line 71) and before `PublishAsync` (line 182). No fallthrough path exists. The SEC-044 comment block at lines 58–60 explicitly documents the rationale.

`CreatePartnerBankCommand.cs` lines 42–46: `When(x => x.AdapterType == BankAdapterType.Rest || x.AdapterType == BankAdapterType.OAuth, ...)` requires `WebhookSecretRef` to be `NotEmpty()` with an informative error message. The SEC-044 comment at lines 38–41 documents the coupling between the validator and the handler guard.

**Test coverage:** `DisbursementWebhookSecurityTests.cs` contains 7 tests tagged `[Trait("Security", "SEC-044")]`:
1. `Webhook_BankWithNullWebhookSecretRef_ShouldBeRejected` — null ref → Rejected + `GetWebhookSecretAsync` verified Never called + `PublishAsync` verified Never called.
2. `Webhook_BankWithEmptyWebhookSecretRef_ShouldBeRejected` — empty string ref → Rejected.
3. `Webhook_BankWithWhitespaceWebhookSecretRef_ShouldBeRejected` — whitespace-only ref → Rejected (IsNullOrWhiteSpace guard confirmed).
4. `Webhook_UnknownBankId_ShouldBeRejected` — unknown bankId → Rejected.
5. `Webhook_BankWithValidSecretAndCorrectSignature_ShouldBeAccepted` — happy path: correct HMAC → Accepted.
6. `Webhook_BankWithValidSecretAndWrongSignature_ShouldBeRejected` — tampered signature → Rejected.
7. `SignedUrlTtl_ShouldBeFifteenMinutesOrLess` (SEC-046 co-located) — TTL constant assertion.

**Verdict: CONFIRMED-FIXED.** Null/empty/whitespace WebhookSecretRef all produce immediate Rejected result. No bypass path remains.

---

#### SEC-046 — MEDIUM: Signed URL TTL Reduced to 15 Minutes — CONFIRMED-FIXED

**Evidence read from source:**

`GetPackageDownloadUrlQuery.cs` (LoanService), line 48: `var expiry = TimeSpan.FromMinutes(15);`
SEC-046 comment at lines 45–47 documents the rationale: "LoanPackage PDFs contain PAN, Aadhaar references, bank account numbers, and income data. A 1-hour window materially increases exposure via browser history / referrer leakage."

`GetDownloadUrlQuery.cs` (ReportService), line 48: `var expiry = TimeSpan.FromMinutes(15);`
SEC-046 comment at lines 46–47: "Report PDFs may contain financial PII; long-lived URLs expose data via browser history."

Both handlers return `ExpiresAt = DateTime.UtcNow.Add(expiry)` in the DTO, so consumers can reflect the correct expiry.

**Test coverage:** `DisbursementWebhookSecurityTests.cs` line 278–288: `SignedUrlTtl_ShouldBeFifteenMinutesOrLess` asserts both `loanPackageTtl` and `reportServiceTtl` are `<= TimeSpan.FromMinutes(15)`. The test comment documents SEC-046 and catches any accidental revert to `FromHours(1)`.

**Observation — minor:** The TTL sanity test hardcodes the expected value as a literal `TimeSpan.FromMinutes(15)` rather than reading the constant from the production code. It therefore tests a mirrored value, not the actual production value. This is a LOW informational note — not a bypass — but a future refactor that exposes the TTL as a named constant and imports it into the test would provide stronger regression coverage.

**Verdict: CONFIRMED-FIXED.** Both services capped at 15 minutes with explanatory comments.

---

#### SEC-047 — MEDIUM: LoanDisbursed Push Notification Excludes DisbursedAmount — CONFIRMED-FIXED

**Evidence read from source:**

`LoanEventsSubscriber.cs` lines 123–133: The `variables` dictionary constructed for `SendNotificationCommand` contains only `applicationId`, `orgId`, and `occurredAt`. `disbursedAmount` is explicitly absent.

The comment block at lines 123–127 provides the DPDP data-minimisation rationale:

```
// SEC-047: disbursedAmount is intentionally excluded from the Push (FCM) channel variables.
// FCM push notification body appears on device lock screens (DPDP Act 2023 data minimisation).
// The push template must use a generic message ("Your loan has been disbursed — open app
// for details"). Amount is only safe for SMS/email channels where it is not lock-screen visible;
// multi-channel variable override is a Phase 7 enhancement (tracked as P6-HANDOFF-35).
```

`LoanEventPayload` record (lines 156–163) still carries `decimal? DisbursedAmount` as a deserialized field — it is received from Pub/Sub but intentionally not forwarded to notification variables. This is correct design: the data is available for audit/logging but not surfaced to the push channel.

**Verdict: CONFIRMED-FIXED.** `disbursedAmount` excluded from push variables; DPDP comment present.

---

#### SEC-049 — MEDIUM: PDF Watermark Canonical Format — CONFIRMED-FIXED

**Evidence read from source:**

`SnapAccountDocumentStyles.cs` lines 28–29: `LoanPackageWatermark` method exists and returns:
```
$"Generated by SnapAccount | {orgName} | {generatedAt:dd MMM yyyy} | Package ID: {packageId} | Not a CA certification"
```

This matches the canonical specification exactly: 5 fields — brand, orgName, date, packageId, disclaimer.

`LoanPackageReportGenerator.cs` lines 42–45: The watermark is computed once per document:
```
var watermark = SnapAccountDocumentStyles.LoanPackageWatermark(orgName, generatedAt, packageId);
```

The watermark variable is threaded through all 5 render sites:
- **Cover page** (line 68): `col.Item().PaddingTop(60).AlignCenter().Text(watermark)`
- **Section 2: GSTR-3B** (line 95): `col.Item().PaddingTop(15).Text(watermark)`
- **Section 3: P&L** (line 122): `col.Item().PaddingTop(15).Text(watermark)`
- **Section 4: Balance Sheet** (line 156): `col.Item().PaddingTop(15).Text(watermark)`
- **Section 5: Bank Statement** (line 178): `col.Item().PaddingTop(15).Text(watermark)`
- **Section 6: KYC Checklist** (line 204): `col.Item().PaddingTop(15).Text(watermark)`

That is 6 render sites across 6 pages (cover + 5 content pages). The audit task specified "5 render sites (cover + 4 content pages)" — the implementation covers 6 pages (cover + 5 content sections). This is more comprehensive than required, not a deficiency.

**Verdict: CONFIRMED-FIXED.** Canonical 5-field watermark method implemented; threaded through all 6 document pages.

---

#### Carry-Forward Checks — SEC-026..029, SEC-038..043

No regression found. The Phase 6A+6E hotfix controls (PermissionBehavior registration, DPDP AccountDeletionSubscriber for Callback+Notification, IDOR org-scoping in 8 handlers, DLQ permission gate) and Phase 6B+6D hotfix controls (IDOR for GST notices, ITR filings, DPDP cascade in GstService+ItrService, gst-write-strict rate limit) are not touched by the 6C backend hotfix. The hotfix is confined to:

- `LoanService.Infrastructure/Webhooks/DisbursementWebhookHandler.cs`
- `LoanService.Application/PartnerBanks/Commands/CreatePartnerBank/CreatePartnerBankCommand.cs`
- `LoanService.Application/LoanApplications/Queries/GetPackageDownloadUrl/GetPackageDownloadUrlQuery.cs`
- `ReportService.Application/Reports/Queries/GetDownloadUrl/GetDownloadUrlQuery.cs`
- `NotificationService.Infrastructure/Messaging/LoanEventsSubscriber.cs`
- `ReportService.Infrastructure/Reports/SnapAccountDocumentStyles.cs`
- `ReportService.Infrastructure/Reports/LoanPackageReportGenerator.cs`
- `tests/unit/LoanService/Application/DisbursementWebhookSecurityTests.cs`

No shared pipeline behaviors, auth middleware, or DPDP erasure handlers were modified.

---

#### Deferred Open Items — Confirmed Still Open, Targeted for Phase 6F

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| SEC-045 | Medium | Admin PayloadViewer.tsx renders full bearer token payload for `oauth-token` kind | OPEN — flagged to frontend-dev; deferred to 6F |
| SEC-048 | Medium | Mobile LoanConsentScreen + LoanPackagePreviewScreen biometric gates are Alert dialogs, not real biometric (`expo-local-authentication` not installed) | OPEN — P6-HANDOFF-24; deferred to 6F |
| SEC-050 | Medium | Mobile LoanConsentScreen `consent_text_version` hardcoded as `'1.4'`; must be dynamically fetched from backend consent catalog for DPDP audit trail | OPEN — flagged to mobile-dev; deferred to 6F |

These three Medium findings were explicitly accepted as non-blocking for staging in the original Phase 6C gate. No new evidence of exploitation risk was observed in this re-audit. They remain deferred to Phase 6F.

---

### Re-audit Summary (Phase 6C after backend hotfix)

| Finding | Pre-hotfix Status | Post-hotfix Status |
|---------|------------------|--------------------|
| SEC-044 (HIGH) | OPEN — bypass path existed | CONFIRMED-FIXED |
| SEC-046 (MED) | OPEN — 1-hour TTL | CONFIRMED-FIXED |
| SEC-047 (MED) | OPEN — amount in push variables | CONFIRMED-FIXED |
| SEC-049 (MED) | OPEN — non-canonical watermark | CONFIRMED-FIXED |
| SEC-045 (MED) | OPEN | STILL OPEN — deferred 6F |
| SEC-048 (MED) | OPEN | STILL OPEN — deferred 6F |
| SEC-050 (MED) | OPEN | STILL OPEN — deferred 6F |

**New findings: 0**

**CRITICAL: 0 | HIGH: 0 | MEDIUM: 0 (new) | LOW: 0 | INFO: 0**

**Go / No-Go: GO**

SEC-044 (HIGH) is CONFIRMED-FIXED. No bypass path remains. Three Medium findings (SEC-045/048/050) remain open but were explicitly accepted as non-blocking for staging. No new HIGH or CRITICAL findings were identified in the hotfix diff. The 313/313 test count and 7 new SEC-044-targeted unit tests provide adequate regression coverage.

**Phase 6C is cleared for staging deployment.**

*Re-audit completed: 2026-04-25*

---

## Phase 6F Re-audit — After Hotfixes (2026-04-25)

**Scope:** Verification of 9 hotfixes shipped after the Phase 6F NO-GO gate: SEC-051 (HIGH Razorpay HMAC restored), SEC-052 (SubscriptionService AccountDeletionSubscriber), SEC-053 (chat-send-strict + Redis INCR on SignalR hub), SEC-045 (PayloadViewer OAuth masking), SEC-048 (real biometric on 3 screens), SEC-050 (consent catalog API + fallback), SEC-054 (SignalR JWT factory), SEC-055/SEC-034 (UUID validation all 6 deep-link cases). Carry-forward regression check for SEC-026..029, SEC-038..040, SEC-043, SEC-044, SEC-046..047, SEC-049.
**Review Date:** 2026-04-25
**Reviewer:** security-reviewer agent
**Test counts at review time:** Backend 391/391 pass | Frontend 677/677 pass | Mobile 324/325 pass (1 pre-existing unrelated failure)

---

### Verification Table

| Finding | Severity | File(s) Verified | Result |
|---------|----------|-----------------|--------|
| SEC-051 — Razorpay webhook HMAC | HIGH | `Platform.WebApi/Endpoints/Subscription/RazorpayWebhook.cs` | CONFIRMED-FIXED |
| SEC-052 — SubscriptionService AccountDeletionSubscriber | MEDIUM | `SubscriptionService.Infrastructure/Messaging/AccountDeletionSubscriber.cs`, `DependencyInjection.cs` | CONFIRMED-FIXED |
| SEC-053 — Chat rate-limit | MEDIUM | `Assist.WebApi/Program.cs`, `Assist.WebApi/Endpoints/Chat/Chat.cs`, `ChatService.Infrastructure/SignalR/ChatHub.cs` | CONFIRMED-FIXED — with one observation (see INFO-006) |
| SEC-045 — PayloadViewer OAuth masking | MEDIUM | `src/admin/src/components/ui/PayloadViewer.tsx` | CONFIRMED-FIXED |
| SEC-048 — Real biometric on 3 screens | MEDIUM | `mobile/package.json`, `LoanConsentScreen.tsx`, `LoanPackagePreviewScreen.tsx`, `UserApprovalScreen.tsx` | CONFIRMED-FIXED |
| SEC-050 — consent_text_version dynamic | MEDIUM | `mobile/src/api/loans.ts`, `LoanConsentScreen.tsx` | CONFIRMED-FIXED |
| SEC-054 — SignalR JWT factory | MEDIUM | `mobile/src/screens/chat/ChatDetailScreen.tsx` line 233, `mobile/src/lib/firebase.ts` | CONFIRMED-FIXED — with one observation (see INFO-007) |
| SEC-055/SEC-034 — UUID validation all 6 deep-link cases | MEDIUM | `mobile/src/notifications/notificationRouter.ts` | CONFIRMED-FIXED |

---

### Detailed Verification Findings

#### SEC-051 — CONFIRMED-FIXED

`RazorpayWebhook.cs` is a dedicated unauthenticated endpoint (`POST /subscriptions/webhooks/razorpay`) correctly registered with `.AllowAnonymous()`. HMAC-SHA256 verification flow is correct:

1. `EnableBuffering()` called on request; raw body read before any model-binding.
2. `X-Razorpay-Signature` header presence checked; 401 returned if absent.
3. `RAZORPAY_WEBHOOK_SECRET` read from `IConfiguration`; 503 returned (not 401) if absent — fails closed without leaking reason.
4. `VerifyHmac()` called before any dispatch to Application layer.
5. `VerifyHmac()` implementation: `HMACSHA256.ComputeHash(payload)` → `Convert.ToHexString(computedBytes).ToLowerInvariant()` → both hex strings encoded as UTF-8 bytes → `CryptographicOperations.FixedTimeEquals(computedHexBytes, signatureBytes)` with length pre-check — returns `false` immediately on mismatched lengths.
6. Redis idempotency via `X-Razorpay-Event-Id` (24-hour TTL) deduplicated before handler dispatch.

Note on hex-vs-decoded-bytes pattern: the NEW-001 (MEDIUM) pattern from Phase 5 is still present here — both sides convert to UTF-8 bytes of the lowercase hex string rather than decoding to raw 32-byte hash buffers before comparing. The `FixedTimeEquals` is still constant-time; the length check prevents trivial bypass. The prior Phase 5 note stands: this is not an exploitable bypass but is suboptimal. Accepted as known finding (NEW-001, MEDIUM, no regression since it matches the Phase 5 state).

SEC-001 regression is **fully reversed**. The unauthenticated webhook endpoint with HMAC-SHA256 is restored.

**Status: CONFIRMED-FIXED**

---

#### SEC-052 — CONFIRMED-FIXED

`AccountDeletionSubscriber.cs` in `SubscriptionService.Infrastructure/Messaging/` implements `BackgroundService`. Key verification points:

- Subscribes to `account-deletion-events` Pub/Sub topic; subscription name configurable via `PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION` (defaults to `subscription-service-account-deletion-sub`).
- Gracefully skips startup if `GCP_PROJECT_ID` not configured (dev-friendly).
- Malformed payloads with `UserId == Guid.Empty` are ACKed (not NACKed) to avoid delivery loops — correct pattern.
- Anonymizes `subscription.subscriptions` (all rows where `OrganizationId == userId`) via `sub.Anonymize("DPDP_USER_ERASURE")` — does NOT hard-delete (correct per RBI 7-year financial retention requirement).
- Anonymizes `subscription.invoices` for same org via `inv.Anonymize("DPDP_USER_ERASURE")`.
- DI registration confirmed: `services.AddHostedService<AccountDeletionSubscriber>()` at `DependencyInjection.cs` line 52.
- Exception handling: NACK on exception to enable retry; logs error with `message_id` for observability.

One design note: the subscriber matches on `OrganizationId == userId` because in single-owner SME accounts the deletion event carries the user's own org ID. This is documented in-code (comment lines 91–93). Acceptable for the current SME use case.

**Status: CONFIRMED-FIXED**

---

#### SEC-053 — CONFIRMED-FIXED

Two independent rate-limit controls verified:

**REST endpoint (`Chat.cs` + `Program.cs`):**
- `chat-send-strict` policy registered in `Program.cs` lines 56–62: `AddFixedWindowLimiter("chat-send-strict")` with `PermitLimit = 60`, `Window = TimeSpan.FromMinutes(1)`, `QueueLimit = 0` (no queuing — reject immediately).
- `POST /chat/threads/{id}/messages` at `Chat.cs` line 61 uses `.RequireRateLimiting("chat-send-strict")` — confirmed.
- All other endpoints retain the "standard" 100/min policy.

**SignalR hub (`ChatHub.cs`):**
- `SendMessage` hub method implements Redis INCR pattern at lines 142–157: key `rate:{userId}:{minuteBucket}` (minute bucket = `UnixTimeSeconds / 60`), TTL 2 minutes, cap 60 per minute.
- On exceed: sends `"Error"` event to caller with descriptive message; connection NOT aborted (correct — prevents reconnect storms).
- Returns early before dispatching to Application layer on exceed.

**CONFIRMED-FIXED**

Minor observation logged as INFO-006 below.

---

#### SEC-045 — CONFIRMED-FIXED

`PayloadViewer.tsx` — `oauth-token` kind (lines 133–183):

- `REDACTED_OAUTH_FIELDS` Set contains `access_token`, `refresh_token`, `id_token`, `client_secret` — all four sensitive fields.
- Token `last6` extracted from `parsed.access_token.slice(-6)` for display hint only.
- `safeFields` built by iterating `Object.entries(parsed)` and excluding `REDACTED_OAUTH_FIELDS` — no raw sensitive value is passed to any renderer.
- Rendered output: `Bearer ***{tokenLast6}` in a styled `<div>` with `data-testid="oauth-masked-token"` (testable); only `safeFields` rendered via `JsonTree`.
- No `<pre>{rawString}</pre>` for the `oauth-token` kind — the raw payload string is parsed and stripped before rendering; unparseable payloads show an empty token hint (`??????`) with no payload echo.
- The raw `payload` prop is never passed to any DOM element for `oauth-token` kind.

**Status: CONFIRMED-FIXED**

---

#### SEC-048 — CONFIRMED-FIXED

`expo-local-authentication ~15.0.2` confirmed in `mobile/package.json` line 69. All three screens verified:

**LoanConsentScreen.tsx** (`handleSign`, lines 160–199):
- `LocalAuthentication.hasHardwareAsync()` called first.
- No-hardware path: `Alert.alert` with Cancel/Confirm — graceful fallback preserved.
- Hardware path: `LocalAuthentication.authenticateAsync({ promptMessage, fallbackLabel, disableDeviceFallback: false })`.
- On `!result.success`: early return (does NOT proceed to `signMutation.mutate()`).
- `setBiometricPassed(true)` called only after confirmed success.
- DPDP note: `FALLBACK_CONSENT_VERSION = '1.4'` remains in file (line 52) but is explicitly labeled as fallback-only, used only when `getConsentCatalog()` returns 404 — correct per SEC-050 fix below.

**LoanPackagePreviewScreen.tsx:**
- View-gate in `useEffect` (lines 61–98): `hasHardwareAsync()` → `authenticateAsync()` → on failure navigates `goBack()` — correct; screen content not rendered until `viewBioPassed = true` (`enabled: viewBioPassed` on queries at lines 103/111).
- Submit-gate in `handleSubmitConfirm` (lines 129–155): second independent `authenticateAsync()` call; `submitMutation.mutate()` only reached after `result.success`.
- Both view-gate AND submit-gate use real `LocalAuthentication` — two-factor biometric pattern confirmed.

**UserApprovalScreen.tsx** (`handleBiometric`, lines 76–103):
- `hasHardwareAsync()` → `authenticateAsync()` pattern identical to other screens.
- `setBiometricPassed(true)` only on `result.success`; `handleApprove` guards on `biometricPassed && hasScrolledToBottom`.

**Status: CONFIRMED-FIXED**

---

#### SEC-050 — CONFIRMED-FIXED

`mobile/src/api/loans.ts` (lines 444–471):
- `ConsentCatalogEntry` type defined with `consentType`, `textVersion`, `effectiveDate` fields.
- `ConsentCatalogResponse` wraps `items: ConsentCatalogEntry[]`.
- `getConsentCatalog()` calls `GET /loans/consents/catalog` via `apiClient`.
- P6-HANDOFF-25 comment present: backend endpoint pending — mobile falls back gracefully on 404.

`LoanConsentScreen.tsx` (lines 99–111):
- `useQuery({ queryKey: ['loan-consent-catalog'], queryFn: getConsentCatalog, staleTime: 5 * 60 * 1000, retry: false })` — 5-minute stale time prevents version changing mid-session; `retry: false` ensures 404 falls through immediately to fallback.
- `getConsentVersion(consentType)` at line 106 returns `entry?.textVersion ?? FALLBACK_CONSENT_VERSION`.
- Hardcoded `CONSENT_VERSION = '1.4'` is REMOVED; only `FALLBACK_CONSENT_VERSION = '1.4'` remains (line 52), used exclusively when the catalog API returns 404 (P6-HANDOFF-25 window).
- `consentVersion: getConsentVersion(step.type)` passed to `recordLoanConsent()` at line 123 — version is dynamically resolved at sign time.

P6-HANDOFF-25 remains open (backend `GET /loans/consents/catalog` not yet implemented). Mobile fallback confirmed graceful.

**Status: CONFIRMED-FIXED (mobile-side)**

---

#### SEC-054 — CONFIRMED-FIXED

`ChatDetailScreen.tsx` line 233:
```
buildChatHubConnection(HUB_BASE_URL, () => FirebaseAuth.getIdToken())
```
`FirebaseAuth.getIdToken()` is confirmed in `mobile/src/lib/firebase.ts` lines 73–75: reads `_currentUser.getIdToken(forceRefresh)` — returns `null` only when no user is logged in (correct behavior; hub will reject unauthenticated connection).

`buildChatHubConnection` in `mobile/src/api/chat.ts` lines 213–223 passes the callback as `accessTokenFactory: async () => (await getToken()) ?? ''`. Token factory is async and correctly awaited by the SignalR library on each HTTP negotiation request. The `?? ''` fallback for null (logged-out) is acceptable — the hub's `[Authorize]` will reject a connection with an empty token, which is the correct failure mode.

**Observation (INFO-007):** The `FirebaseAuth` in `mobile/src/lib/firebase.ts` is a dev-mode mock that returns `'mock-id-token'` as the token string. This file is used for Expo Go testing. In a production build, this must be replaced by `@react-native-firebase/auth` with a real Firebase JWT. This is a known architectural pattern (confirmed by the file header comment "Expo Go compatible mock for simulator testing"). Not a new finding — accepted as an existing development-mode decision. Pre-production, the production Firebase module must be wired. This is tracked as the cert-pinning placeholder analog.

**Status: CONFIRMED-FIXED**

---

#### SEC-055/SEC-034 — CONFIRMED-FIXED

`mobile/src/notifications/notificationRouter.ts`:
- `isValidUuid()` exported at line 28: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` — correct UUID v1–v5 regex.
- All 6 id-param navigation cases verified:
  - `callback` (line 63): `id && isValidUuid(id)` guard before `nav('CallbackStatus', ...)`
  - `document` (line 69): `id && isValidUuid(id)` guard before `nav('DocumentDetail', ...)`
  - `chat_message_received` (line 77): `threadId && isValidUuid(threadId)` guard before `nav('ChatDetail', ...)`
  - `loan_disbursed` (line 84): `loanId && isValidUuid(loanId)` guard before `nav('LoanStatus', ...)`
  - `loan_approved` (line 84): same `loanId && isValidUuid(loanId)` guard (shared case)
  - `gst` and `itr` (lines 54/57): navigate to dashboard screens with no id param — no validation needed.
- Invalid UUIDs route to `default` case (no navigation) — silent drop with no crash.
- `isValidUuid` is exported, enabling direct unit testing.

**Status: CONFIRMED-FIXED (closes both SEC-034 and SEC-055)**

---

### Carry-Forward Regression Check

| Prior Finding | Last Verified | Status |
|--------------|--------------|--------|
| SEC-026 (PermissionBehavior) | Phase 6 re-audit | NO REGRESSION — files unchanged |
| SEC-027 (DPDP callback/notification) | Phase 6 re-audit | NO REGRESSION |
| SEC-028 (DLQ gate) | Phase 6 re-audit | NO REGRESSION |
| SEC-029 (IDOR callbacks) | Phase 6 re-audit | NO REGRESSION |
| SEC-038 (IDOR GstService notices) | Phase 6B+6D re-audit | NO REGRESSION |
| SEC-039 (IDOR ItrService filings) | Phase 6B+6D re-audit | NO REGRESSION |
| SEC-040 (DPDP GstService/ItrService) | Phase 6B+6D re-audit | NO REGRESSION |
| SEC-043 (gst-write-strict rate limit) | Phase 6B+6D re-audit | NO REGRESSION |
| SEC-044 (webhook null-bypass LoanService) | Phase 6C re-audit | NO REGRESSION |
| SEC-046 (15-min share-link TTL) | Phase 6C re-audit | NO REGRESSION |
| SEC-047 (disbursedAmount in push) | Phase 6C re-audit | NO REGRESSION |
| SEC-049 (loan package watermark) | Phase 6C re-audit | NO REGRESSION |
| SEC-001 (original Razorpay HMAC) | This re-audit (SEC-051) | NO REGRESSION — restored |

---

### Open Items Verified Acceptable

| Item | Severity | Disposition |
|------|----------|-------------|
| SEC-056 — 11 ghost Settings PATCH endpoints | LOW | Deferred to Phase 7 as P6-HANDOFF-36. No backend endpoint exists to exploit. When implemented, `[RequiresPermission("admin.settings.*")]` gate required. ACCEPTABLE. |
| P6-HANDOFF-25 — `GET /loans/consents/catalog` backend not implemented | INFO | Mobile falls back gracefully to `FALLBACK_CONSENT_VERSION = '1.4'`. Fallback is labeled and scoped. ACCEPTABLE until backend-agent implements in Phase 7. |
| SEC-041 — ItrService client PAN cipher (TODO comment) | MEDIUM | Still open. Deferred by orchestrator to Phase 7. Not in this hotfix scope. ACCEPTED AS OPEN. |
| SEC-042 — Admin localStorage draft (GST notice) | MEDIUM | Still open. Deferred by orchestrator to Phase 7. ACCEPTED AS OPEN. |
| NEW-001 — HMAC hex-string comparison (Phase 5) | MEDIUM | Still present in SEC-051 hotfix (same pattern). Timing-safe in practice; known accepted. ACCEPTED. |
| NEW-003 — AES-256-CBC vs GCM for PAN (Phase 5) | LOW | Still open. No regression. ACCEPTED AS OPEN. |
| INFO-001 — Certificate pinning placeholder hashes | INFO | Unchanged. Must be replaced before any production build. Pre-prod blocker (infrastructure, not code). |

---

### P6-QA-MOBILE-10 — CelebrationOverlay Server-Guard Assessment

**QA finding:** `CelebrationOverlay` component does not call `POST /notifications/celebrations/{kind}/fire` on mount. The backend `FireCelebrationCommandHandler` provides server-side replay prevention (deduplication by `userId × eventKind`), but the mobile never calls the endpoint.

**Security assessment:** The `FireCelebrationCommand` endpoint is authenticated, org-scoped, and rate-limited with the "standard" policy. The server-side idempotency guard (lines 61–69 of `FireCelebrationCommandHandler`) is correct and works independently of whether the mobile calls it. The mobile NOT calling the endpoint means: (a) no server-side analytics/tracking of celebration impressions; (b) the per-user deduplication guard is never exercised (the celebration could re-fire on each app launch). This is a product/UX concern, not a security vulnerability — the backend endpoint is protected and correctly implemented. The mobile calling or not calling it does not create an attack surface.

**Security verdict:** NOT a security finding. This is a functional gap between the Phase 6F Track F2 implementation spec and the delivered mobile code. Owned by mobile-dev as a product bug (P6-QA-MOBILE-10). No security blocker.

---

### New Observations from This Re-audit

#### [INFO] INFO-006 — ChatHub Redis Rate Key Missing `chat:` Namespace Prefix

- **File:** `backend/Services/AssistService/Assist.Infrastructure/Chat/SignalR/ChatHub.cs` line 143
- **Description:** The Redis rate-limit key is `rate:{userId}:{minuteBucket}`. The inline comment at line 119 documents the key as `chat:rate:{userId}:{minute}` (with the `chat:` prefix). The actual implementation omits the `chat:` prefix. On a shared Redis instance (which the Aspire config provisions as a single Redis for all services), this generic `rate:` key could collide with rate-limit keys from other services that happen to use the same key pattern. The security impact is low — the only consequence would be that a rate-limit counter set in one service partially inhibits message sending in ChatService for the same userId+minute bucket, which would only over-throttle (not under-throttle). This is a namespacing hygiene issue, not a bypass.
- **Severity:** INFO — No security bypass; over-throttling is the failure mode; key collision is unlikely in practice because no other service currently uses `rate:{userId}:{minute}` pattern.
- **Recommended Fix:** Change the key to `chat:rate:{userId}:{minuteBucket}` to match the comment and align with Redis key namespacing convention. Update the comment to match.
- **Agent:** backend-agent

#### [INFO] INFO-007 — Firebase Client Library Is Dev-Mode Mock in `mobile/src/lib/firebase.ts`

- **File:** `mobile/src/lib/firebase.ts`
- **Description:** The file header states "Expo Go compatible mock for simulator testing — AUTO-AUTHENTICATED: navigates directly to app screens for screenshot testing." The `mockUser` at line 21 returns `'mock-id-token'` from `getIdToken()`. The SEC-054 fix correctly calls `FirebaseAuth.getIdToken()`, which will return the mock token in Expo Go builds. In a production build, this file must be replaced by the `@react-native-firebase/auth` integration. This is an architectural decision documented in the file header — not a regression introduced by the hotfix.
- **Severity:** INFO — Pre-production blocker (same category as placeholder cert hashes). Token returned in dev is non-functional against real Firebase; SignalR hub in dev will reject it, which is acceptable for simulator testing.
- **Recommended Fix:** Before any production or TestFlight/Play Store build: replace `mobile/src/lib/firebase.ts` with a real `@react-native-firebase/auth` implementation. The `FirebaseAuth.getIdToken()` call path is already correctly wired — only the underlying module needs swapping.
- **Agent:** mobile-dev

---

### Phase 6F Re-audit Summary (after hotfixes)

| Finding | Pre-hotfix | Post-hotfix |
|---------|------------|------------|
| SEC-051 (HIGH) — Razorpay HMAC regression | OPEN | CONFIRMED-FIXED |
| SEC-052 (MED) — SubscriptionService DPDP erasure | OPEN | CONFIRMED-FIXED |
| SEC-053 (MED) — Chat rate-limit | OPEN | CONFIRMED-FIXED |
| SEC-045 (MED) — PayloadViewer OAuth masking | OPEN | CONFIRMED-FIXED |
| SEC-048 (MED) — Real biometric on 3 screens | OPEN | CONFIRMED-FIXED |
| SEC-050 (MED) — consent_text_version dynamic | OPEN | CONFIRMED-FIXED |
| SEC-054 (MED) — SignalR JWT token factory null | OPEN | CONFIRMED-FIXED |
| SEC-055/SEC-034 (MED) — UUID validation all 6 deep-link cases | OPEN | CONFIRMED-FIXED |

**CONFIRMED-FIXED this audit: 8 (1 HIGH + 7 MEDIUM)**
**New findings: 0 HIGH, 0 MEDIUM, 0 LOW, 2 INFO (INFO-006, INFO-007)**
**Regressions found: 0**

**CRITICAL: 0 | HIGH: 0 | MEDIUM: 0 (new) | LOW: 0 | INFO: 2**

---

### Final Phase 6 Security Finding Status Table

All 56 SEC findings across Phases 4–6F:

| ID | Severity | Component | Status | Notes |
|----|----------|-----------|--------|-------|
| SEC-001 | Critical | SubscriptionService | FIXED | Phase 5 fix; regression in 6F (SEC-051); re-fixed in 6F hotfix |
| SEC-002 | Critical | All services | FIXED | Phase 5 |
| SEC-003 | Critical | AuthService | FIXED | Phase 5 |
| SEC-004 | High | All non-Auth services | FIXED | Phase 5 |
| SEC-005 | High | OtpService | FIXED | Phase 5 |
| SEC-006 | High | Repository | FIXED | Phase 5 |
| SEC-007 | High | DPDP | FIXED | Phase 5 |
| SEC-008 | High | AuthService | FIXED | Phase 5 |
| SEC-009 | High | StorageService | FIXED | Phase 5 |
| SEC-010 | High | Database | FIXED | Phase 5 |
| SEC-011 | High | All services | FIXED | Phase 5 |
| SEC-012 | High | RBAC | FIXED | Phase 5 |
| SEC-013 | Medium | AuthService | FIXED | Phase 5 |
| SEC-014 | Medium | Mobile | FIXED (partial) | Phase 5; placeholder cert hashes remain (INFO-001) |
| SEC-015 | Medium | Mobile | FIXED | Phase 5 |
| SEC-016 | Medium | AuthService | FIXED | Phase 5 |
| SEC-017 | Medium | Admin panel | PARTIAL | Phase 5; LB wiring is manual infrastructure step |
| SEC-018 | Medium | AuthService | FIXED | Phase 5 |
| SEC-019 | Medium | Database | FIXED | Phase 5 |
| SEC-020 | Medium | ItrService | FIXED | Phase 5 |
| SEC-021 | Low | Database | FIXED | Phase 5 |
| SEC-022 | Low | AuthService | FIXED | Phase 5 |
| SEC-023 | Low | Mobile | FIXED | Phase 5 |
| SEC-024 | Low | Infra | FIXED | Phase 5 |
| SEC-025 | Low | Cloud Run | FIXED | Phase 5 |
| SEC-026 | High | 3 services (RBAC) | FIXED | Phase 6A+6E hotfix |
| SEC-027 | High | DPDP callback/notification | FIXED | Phase 6A+6E hotfix |
| SEC-028 | High | NotificationService DLQ | FIXED | Phase 6A+6E hotfix |
| SEC-029 | High | CallbackService IDOR | FIXED | Phase 6A+6E hotfix |
| SEC-030 | Medium | Callback audit trail | OPEN-DEFERRED | Phase 7 |
| SEC-031 | Medium | RecurringJobsSubscriber dedupe | OPEN-DEFERRED | Phase 7 |
| SEC-032 | Medium | AccountingService BootstrapCoa | OPEN-DEFERRED | Phase 7 |
| SEC-033 | Medium | Mobile callback screens | FIXED | Phase 6F (hotfix confirmed in re-audit) |
| SEC-034 | Medium | Mobile deep-link UUID | FIXED | Phase 6F hotfix (isValidUuid on all 6 cases) |
| SEC-035 | Low | Database BYPASSRLS role | OPEN-DEFERRED | Phase 7 |
| SEC-036 | Low | FCM data payload | OPEN-DEFERRED | Phase 7 |
| SEC-037 | Low | OcrResultSubscriber hardcoded UUIDs | OPEN-DEFERRED | Phase 7 |
| SEC-038 | High | GstService notices IDOR | FIXED | Phase 6B+6D hotfix |
| SEC-039 | High | ItrService filings IDOR | FIXED | Phase 6B+6D hotfix |
| SEC-040 | High | DPDP GstService/ItrService | FIXED | Phase 6B+6D hotfix |
| SEC-041 | Medium | ItrService client PAN cipher | OPEN-DEFERRED | Phase 7 |
| SEC-042 | Medium | Admin localStorage draft | OPEN-DEFERRED | Phase 7 |
| SEC-043 | Low | GstService rate-limit | FIXED | Phase 6B+6D hotfix |
| SEC-044 | High | LoanService webhook bypass | FIXED | Phase 6C hotfix |
| SEC-045 | Medium | PayloadViewer OAuth masking | FIXED | Phase 6F hotfix |
| SEC-046 | Medium | Share-link TTL | FIXED | Phase 6C hotfix |
| SEC-047 | Medium | Loan disbursed push amount | FIXED | Phase 6C hotfix |
| SEC-048 | Medium | Mobile biometric (real LocalAuthentication) | FIXED | Phase 6F hotfix |
| SEC-049 | Medium | Loan package watermark | FIXED | Phase 6C hotfix |
| SEC-050 | Medium | Mobile consent version dynamic | FIXED | Phase 6F hotfix (mobile-side; P6-HANDOFF-25 open) |
| SEC-051 | High | Razorpay HMAC regression | FIXED | Phase 6F hotfix |
| SEC-052 | Medium | SubscriptionService DPDP erasure | FIXED | Phase 6F hotfix |
| SEC-053 | Medium | Chat rate-limit | FIXED | Phase 6F hotfix |
| SEC-054 | Medium | SignalR JWT factory null | FIXED | Phase 6F hotfix |
| SEC-055 | Medium | Deep-link UUID validation (new cases) | FIXED | Phase 6F hotfix (combined with SEC-034) |
| SEC-056 | Low | Settings ghost endpoints | OPEN-DEFERRED | P6-HANDOFF-36; Phase 7 |
| NEW-001 | Medium | HMAC hex-string comparison | OPEN-DEFERRED | Phase 7 (known, accepted pattern) |
| NEW-002 | High | Firebase revocation fatal to deletion | OPEN-DEFERRED | Phase 7 — DPDP risk |
| NEW-003 | Low | AES-256-CBC vs GCM for PAN | OPEN-DEFERRED | Phase 7 |

---

### Go / No-Go — FINAL Phase 6 Gate

**GO**

All blocking findings verified fixed:

- **SEC-051 (HIGH)** — Razorpay webhook HMAC fully restored with `CryptographicOperations.FixedTimeEquals`, Redis idempotency, correct unauthenticated endpoint. CONFIRMED-FIXED.
- **SEC-054 (MEDIUM)** — SignalR JWT token factory wired to real `FirebaseAuth.getIdToken()`. CONFIRMED-FIXED.
- **SEC-048 (MEDIUM)** — Real `LocalAuthentication.authenticateAsync()` on all 3 screens with correct no-hardware fallback. CONFIRMED-FIXED.
- **SEC-045 (MEDIUM)** — OAuth tokens stripped before render; only `Bearer ***{last6}` + safe fields shown. CONFIRMED-FIXED.

No new HIGH or CRITICAL findings identified.

**Deferred to Phase 7 (pre-production blockers — not blocking Phase 6 gate):**
- NEW-002 (HIGH) — Firebase revocation failure makes account deletion non-atomic. Must be resolved before production.
- SEC-041 (MEDIUM) — Client-supplied PAN cipher in ItrService. Must be resolved before Form 16 feature ships to production.
- INFO-001 — Placeholder certificate hashes. Must be replaced before production build.
- INFO-007 — Firebase mock module. Must be replaced with `@react-native-firebase/auth` before production build.

**Phase 6 FINAL gate: GO for production-prep.**

Operations team pre-production checklist:
1. Implement `GET /loans/consents/catalog` (P6-HANDOFF-25) — mobile falls back gracefully until done.
2. Replace placeholder cert hashes in `mobile/src/lib/pinnedHttpClient.ts` (INFO-001).
3. Replace Firebase mock in `mobile/src/lib/firebase.ts` with real `@react-native-firebase/auth` (INFO-007).
4. Fix NEW-002 — remove `return revokeResult` in `RequestAccountDeletionCommandHandler`.
5. Fix SEC-041 — move PAN encryption server-side in ItrService before Form 16 launch.
6. Add `chat:` prefix to Redis rate key in `ChatHub.cs` (INFO-006).
7. Implement Phase 7 deferred findings: SEC-030, SEC-031, SEC-032, SEC-035, SEC-036, SEC-037, SEC-042, SEC-056, NEW-003.

*Phase 6F Re-audit completed: 2026-04-25*

---

## Module 1 Auth/RBAC Security Review

**Scope:** Auth/RBAC Module 1 — Multi-tenant org roles, constrained delegation, invitation tokens, org isolation (IDOR), DEV_AUTH_BYPASS safety. New files: `database/migrations/035_auth_org_roles_invitations.sql`, `database/migrations/036_auth_rbac_permission_catalog_seed.sql`, `AuthService.Domain/Entities/Invitation.cs`, `AuthService.Domain/Permissions.cs`, `AuthService.Application/Roles/` (directory tree), `AuthService.Application/Invitations/` (directory tree), `AuthService.Application/Members/` (directory tree), `AuthService.Application/Permissions/` (directory tree), `AuthService.Application/PlatformAdmin/` (directory tree). Existing files reviewed for regressions: `FirebaseAuthMiddleware.cs`, `LocalAuthService.cs`, `LocalJwt.cs`, `PasswordHasher.cs`, `CurrentUser.cs`, `OtpService.cs`, `AesPanEncryptionService.cs`, `Auth.cs` (endpoints), `PermissionBehavior.cs`, `useAuth.ts`, `usePermission.ts`, `authToken.ts`, `teamApi.ts`, mobile `authStore.ts`.
**Review Date:** 2026-05-29
**Reviewer:** security-reviewer agent

---

### Findings

#### [CRITICAL] M1-001: Production Firebase API Key Committed to Repository

- **File:** `mobile/ios/SnapAccount/GoogleService-Info.plist`
- **Line:** 6 (`API_KEY`), 10 (`GCM_SENDER_ID`), 14 (`PROJECT_ID`), 16 (`STORAGE_BUCKET`), 28 (`GOOGLE_APP_ID`)
- **Description:** A production Firebase configuration file is committed to the repository at `mobile/ios/SnapAccount/GoogleService-Info.plist`. It contains a live Firebase API key (`AIzaSyBHXztHzLI38FZnV11PMQC89VvUlF3UKgE`), GCM sender ID (`552502623224`), project ID (`snapaccount-44625`), storage bucket, and app ID. Although `GoogleService-Info.plist` is listed in both `.gitignore` (root and `mobile/`) as an exclusion, the file exists in the repository at its current state — either because it was committed before the `.gitignore` rule was added, or because a `git add -f` was used. An attacker with repository access (or via a public leak) can extract these values and use the Firebase API key to enumerate Firebase Auth users, attempt unauthorized phone OTP flows, or probe Firebase storage. The API key in a `.plist` file is not a private secret by itself — Firebase API keys are restricted by SHA-1 app certificate fingerprints and iOS bundle ID — but the project ID and storage bucket in combination enable targeted abuse. More critically: if this repo is or becomes public, or if CI secrets are leaked, the combination enables malicious Firebase project access.
- **Recommended Fix:** (1) Immediately rotate the Firebase API key via the GCP Console (Firebase project settings). (2) Remove the file from git history using `git filter-repo` or BFG. (3) Use a placeholder/template `.plist` in the repository and inject the real values at CI build time from a secret store. (4) Verify Firebase Security Rules are restrictive (not `allow read, write: if true`).
- **Reference:** OWASP Mobile Top 10 — M9: Insecure Data Storage; CWE-312 (Cleartext Storage of Sensitive Information)

---

#### [HIGH] M1-002: RBAC Module 1 Delegation Guard Completely Unimplemented — Backend Command Handlers Are Empty Stub Directories

- **File:** `backend/Services/PlatformService/Platform.Application/Auth/Roles/Commands/SetRolePermissions/` (empty directory), `backend/Services/PlatformService/Platform.Application/Auth/Roles/Commands/CreateOrgRole/` (empty), `backend/Services/PlatformService/Platform.Application/Auth/Invitations/Commands/CreateInvitation/` (empty), `backend/Services/PlatformService/Platform.Application/Auth/Invitations/Commands/AcceptInvitation/` (empty), `backend/Services/PlatformService/Platform.Application/Auth/Permissions/Queries/GetGrantablePermissions/` (empty)
- **Description:** The scope document (§4 backend-agent) requires server-side enforcement that a delegate cannot grant permissions they do not themselves hold, and cannot assign a role whose permission set exceeds their own. This is the primary security requirement of Module 1. All the command handler directories that would implement this logic (`SetRolePermissions`, `CreateOrgRole`, `UpdateOrgRole`, `DeleteOrgRole`) contain only empty subdirectories — no `.cs` files exist within them. Similarly, `CreateInvitation`, `AcceptInvitation`, `ResendInvitation`, `RevokeInvitation`, and `GetGrantablePermissions` are all empty. The only implemented handler is `GetOrgRoles` (a read query). No new API endpoints for `POST /auth/org/roles`, `PUT /auth/org/roles/{id}/permissions`, `POST /auth/org/members/invite`, `GET /auth/me/grantable-permissions`, etc. are registered in `Auth.cs`. This means the entire delegation enforcement surface described in the scope is absent from the codebase. The `auth.invitation` table and DB schema are correct, but no backend code creates, validates, or accepts invitations.
- **Recommended Fix:** Implement all command handlers before marking this module ready for security review gate. The specific delegation guard logic required: in `SetRolePermissionsCommandHandler`, after loading the caller's effective permission set via `ICurrentUser`, verify that every permission in the request is contained in the caller's own set — reject with 403 Forbidden if any requested permission is not in the caller's set. Similarly in `CreateOrgRole` and `UpdateOrgRole`, verify the role's intended permissions are all held by the caller. This logic must be in the application layer, not only in the validator or middleware.
- **Reference:** CWE-269 (Improper Privilege Management); OWASP ASVS V4.1 (Access Control)

---

#### [HIGH] M1-003: PostgreSQL RLS Session Variable (app.current_user_id) Is Never Set by Application Code — All Auth Schema RLS Policies Are Silently Inactive

- **File:** `database/migrations/001_auth_schema.sql` (lines 384–415), `database/migrations/035_auth_org_roles_invitations.sql` (lines 149–179), `backend/Shared/SnapAccount.Shared.Infrastructure/Persistence/BaseDbContext.cs`
- **Description:** The RLS policies for `auth.user`, `auth.user_profile`, `auth.organization`, `auth.organization_member`, `auth.user_role`, `auth.user_device`, `auth.refresh_token`, `auth.user_preference`, `auth.role`, and `auth.invitation` all use `current_setting('app.current_user_id', TRUE)::UUID` and `current_setting('app.is_platform_admin', TRUE) = 'true'` to isolate rows to the current user or organization. However, no application code — not in `BaseDbContext`, not in any interceptor, not in any middleware — ever issues `SET LOCAL app.current_user_id = '...'` or `SELECT set_config('app.current_user_id', ..., true)` on the database connection. Without the session variable being set, `current_setting('app.current_user_id', TRUE)` returns `NULL` (the second argument `TRUE` means "return null on missing setting rather than throw"). A UUID cast of `NULL` yields `NULL`, so the USING clause condition becomes `NULL = NULL` (which is false in SQL) for the user-equality predicates, and the `IN (SELECT ...)` subqueries return empty sets for `NULL` UUID. The net effect is that every `SELECT` on an RLS-enabled table returns zero rows for authenticated application users, and write operations may be blocked or silently filtered depending on the policy. This means the RLS policies provide zero actual isolation — they simply block all application queries. Conversely, if any connection bypasses EF Core or uses BYPASSRLS, data is fully exposed across tenants. The new `auth.role` and `auth.invitation` RLS policies introduced in migration 035 have the same defect.
- **Recommended Fix:** Add an EF Core `ISaveChangesInterceptor` or `DbCommandInterceptor` that, before any query on RLS-protected schemas, executes `SET LOCAL app.current_user_id = '<currentUser.UserId>'` and (conditionally) `SET LOCAL app.is_platform_admin = 'true'`. This must run within the same database transaction as the query so `SET LOCAL` takes effect. An alternative is to use Postgres connection-level settings in the EF connection string, but per-request scoping via `SET LOCAL` is the correct approach. Until this is implemented, RLS provides no tenant isolation for authenticated application users.
- **Reference:** CWE-284 (Improper Access Control); PostgreSQL RLS documentation; OWASP ASVS V4.2 (Operation Level Access Control)

---

#### [HIGH] M1-004: GetUserPermissionsQuery Returns Role Names as Permission Codes — Frontend Permission Gates Are Meaningless

- **File:** `backend/Services/PlatformService/Platform.Application/Auth/Users/Queries/GetUserPermissions/GetUserPermissionsQuery.cs`, lines 22–26
- **Description:** The `GET /auth/me/permissions` endpoint is used by the frontend permission system (Phase 6F) to determine which UI actions a user may perform. The handler `GetUserPermissionsQueryHandler` returns `currentUser.Roles.ToList()` — that is, it returns role names (`["SYSTEM_ADMIN", "CA"]`) as if they were permission codes. Role names are not permission codes. The frontend `usePermission.ts` hook and `RoleGuard` consume this endpoint expecting strings like `"org.members.invite"` or `"gst.returns.file"`. When the frontend calls `GET /auth/me/permissions` and receives role names, the `hasPermission("org.members.invite")` check fails for everyone because no token will ever carry the string `"org.members.invite"` — the user profile object only carries role names. The module scope (§4 backend-agent) explicitly calls this out: `GET /auth/me/grantable-permissions` must return the subset of permissions the caller may delegate. The current implementation means every permission check relying on this endpoint returns false, and the role matrix UI cannot accurately grey out non-grantable permissions. Additionally a comment in the file says "Phase 2 will expand roles → permission codes via IAuthDbContext" — this was never implemented.
- **Recommended Fix:** Implement the handler to join `auth.user_role` → `auth.role_permission` → `auth.permission` for the current user's org context and return the resolved permission name strings. Separately implement `GET /auth/me/grantable-permissions` which further intersects with the caller's own permission set. The wildcard `"*"` case (SYSTEM_ADMIN) must still be preserved.
- **Reference:** CWE-732 (Incorrect Permission Assignment for Critical Resource); OWASP ASVS V4.3 (Other Access Control Considerations)

---

#### [MEDIUM] M1-005: Invitation Token Entropy and Single-Use/Replay Protection Cannot Be Verified — CreateInvitation Handler Is Absent

- **File:** `backend/Services/PlatformService/Platform.Application/Auth/Invitations/Commands/CreateInvitation/` (empty directory), `backend/Services/PlatformService/Platform.Domain/Auth/Entities/Invitation.cs`
- **Description:** The `Invitation` entity correctly stores a `token_hash` (SHA-256 of the raw token) and has a `UNIQUE` constraint on `token_hash`. However, since `CreateInvitationCommandHandler` does not exist, we cannot verify: (1) the raw token is generated with sufficient entropy (minimum 256 bits from `RandomNumberGenerator`), (2) the token is single-use (the `Accept()` method sets status but there is no guard preventing re-use if the status check is skipped), (3) the expiry is enforced at the point of acceptance. The `IsValid(DateTime utcNow)` method on the entity exists but will only be called if `AcceptInvitationCommandHandler` is implemented and uses it. The scope requires replay protection — once an invite is accepted, the same token must not be usable again. This cannot be confirmed without the handler.
- **Recommended Fix:** When implementing `CreateInvitationCommandHandler`: generate the raw token with `RandomNumberGenerator.GetBytes(32)` (256 bits minimum), store only `Convert.ToHexString(SHA256.HashData(tokenBytes))` as `token_hash`. When implementing `AcceptInvitationCommandHandler`: look up by token hash, call `IsValid(DateTime.UtcNow)` and reject if false (expired or already accepted), call `invitation.Accept()` to set status, then persist before any other action to make the transition atomic. Do not call `Accept()` after the member is already added.
- **Reference:** OWASP Testing Guide — Testing for Insecure Object References; CWE-330 (Use of Insufficiently Random Values)

---

#### [MEDIUM] M1-006: LOCAL_AUTH JWT Stored in localStorage — Accessible to XSS

- **File:** `src/admin/src/lib/authToken.ts` (lines 4–7), `src/admin/src/hooks/useAuth.ts` (lines 155–163)
- **Description:** When `VITE_LOCAL_AUTH=true` (the dev-mode username/password login), the JWT issued by `POST /auth/local/login` is stored in `localStorage` under the key `sa_admin_token`. The user profile object (including role and email) is stored in `localStorage` under `sa_admin_user`. `localStorage` is not httpOnly — any cross-site scripting vulnerability in the application can read the token and impersonate the user. While this is explicitly a dev-mode path (`NEVER enabled in staging or production` is documented), the admin panel's CSP and security posture in staging must prevent this from accidentally shipping. Further, the `LOCAL_AUTH` guard in `FirebaseAuthMiddleware` checks `configuration["LOCAL_AUTH"]` — if a misconfigured staging deployment sets `LOCAL_AUTH=true`, a localStorage-stored token becomes the credential for a backend that accepts it as valid.
- **Recommended Fix:** (1) For the local dev mode, store the token in `sessionStorage` instead of `localStorage` (scoped to tab, cleared on close, slightly better than persistent `localStorage` for dev use). Ideally use in-memory state only. (2) Add a CI/CD check that fails any staging or production deployment if `LOCAL_AUTH=true` or `VITE_LOCAL_AUTH=true` is present in environment variables. (3) Add a server-side check in `LocalAuthService` that refuses to operate if `ASPNETCORE_ENVIRONMENT` is `Staging` or `Production`.
- **Reference:** OWASP Top 10 — A07:2021 Identification and Authentication Failures; CWE-312 (Cleartext Storage of Sensitive Information)

---

#### [MEDIUM] M1-007: Admin Endpoints /auth/admin/* Lack Permission Gate — Any Authenticated User Can Access Them

- **File:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/Auth.cs`, lines 72–106
- **Description:** The endpoints `GET /auth/admin/team-members`, `GET /auth/admin/audit-events`, `GET /auth/admin/users`, and `GET /auth/admin/users/{id}` each call `.RequireAuthorization()` (checking only that the user is authenticated) and then dispatch to queries that carry `[RequiresPermission("admin.dashboard.read")]` or `[RequiresPermission("admin.users.read")]`. The permission check runs correctly through `PermissionBehavior` for `GetTeamMembersQuery`, `GetAuditEventsQuery`, `ListUsersQuery`, and `GetUserDetailQuery`. However: `PermissionBehavior` reads permissions from `currentUser.HasPermission(...)` which in turn reads from the `"permissions"` claim in the JWT. For Firebase-authenticated users (production path), Firebase ID tokens do not carry a `"permissions"` claim — they carry only Firebase-standard claims. The `"permissions"` claim is only present in LOCAL_AUTH JWTs (set explicitly in `LocalAuthService.LoginAsync`). For Firebase users the `HasPermission` check falls back to role-name matching (`Roles.Any(r => r.Equals(permission, ...))`), which will never match a dotted permission string like `"admin.users.read"`. The net result for production Firebase users is: `HasPermission("admin.users.read")` returns false, and `PermissionBehavior` returns a Forbidden result — meaning these admin endpoints are broken (always 403) for Firebase-authenticated users, not merely permissive. However, for LOCAL_AUTH dev users with `SYSTEM_ADMIN` role, the wildcard `"*"` permission is set, so they pass. This is a correctness and privilege issue: the permission enforcement works in dev mode but silently fails in production.
- **Recommended Fix:** Implement `GetUserPermissionsQueryHandler` to resolve actual permissions from the database (see M1-004). For Firebase-authenticated users, their permissions must be loaded from `auth.role_permission` on every request (or cached in a short-lived distributed cache). Until M1-004 is fixed, the admin endpoints are inaccessible to production users regardless of their role.
- **Reference:** CWE-285 (Improper Authorization); OWASP ASVS V4.1

---

#### [LOW] M1-008: OTP Service Logs Plaintext OTP in Non-Production Environments Including Staging

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Auth/Services/OtpService.cs`, lines 60–62
- **Description:** The OTP service logs the plaintext OTP to the application log in all non-production environments: `logger.LogWarning("OTP for {Phone}: {Otp} (DEVELOPMENT ONLY — never log in production)", phoneNumber, otp)`. The condition is `!string.Equals(env, "Production", ...)`. If the service is deployed to a staging environment with `ASPNETCORE_ENVIRONMENT=Staging`, this log statement executes and the plaintext OTP is written to Cloud Logging (GCP). Any team member or service account with Cloud Logging read access to the staging project can read all staging OTPs, enabling account takeover on staging. If staging uses any real user phone numbers or if staging credentials are ever used to access production data, this is a direct exposure risk.
- **Recommended Fix:** Change the condition to only log the OTP when `ASPNETCORE_ENVIRONMENT=Development` (local dev only), not for any deployed environment. Use `app.Environment.IsDevelopment()` via `IHostEnvironment` injection rather than reading the raw string. Alternatively, remove the log entirely and rely on the dev seed admin account for local testing.
- **Reference:** CWE-532 (Insertion of Sensitive Information into Log File); OWASP Logging Cheat Sheet

---

#### [LOW] M1-009: Weak Placeholder PAN Encryption Key Committed in appsettings.json

- **File:** `backend/Services/PlatformService/Platform.WebApi/appsettings.json`, line 29
- **Description:** `appsettings.json` contains `"Key": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="` as the placeholder `PanEncryption:Key`. This is a base64-encoded string of 32 zero-bytes — a trivially predictable key. Although `AesPanEncryptionService` correctly requires a 32-byte key and uses GCP Secret Manager in production, the committed placeholder key means: (1) if a developer forgets to set the real key before running tests, PANs are encrypted with a known-weak key, (2) if any integration test database contains data encrypted with this key, those PANs can be trivially decrypted. The `.gitignore` excludes `appsettings.Development.json` and `appsettings.Local.json` but not `appsettings.json` itself — so this file is correctly tracked, but the placeholder being cryptographically weak is a risk.
- **Recommended Fix:** Replace the all-zeros placeholder with an explanatory string: `"Key": "SET_VIA_ENV_OR_SECRET_MANAGER"`. Modify `AesPanEncryptionService` to explicitly reject this sentinel value at startup with a clear error message. This prevents accidental use of a weak key in any environment.
- **Reference:** CWE-321 (Use of Hard-coded Cryptographic Key); OWASP Cryptographic Storage Cheat Sheet

---

#### [INFO] M1-INFO-001: auth.role RLS Policy References app.is_platform_admin Session Variable — Not Set for SUPER_ADMIN — Cross-Org Visibility Broken

- **File:** `database/migrations/035_auth_org_roles_invitations.sql`, lines 149–165
- **Description:** The `role_org_isolation` policy allows a platform admin to see all roles when `current_setting('app.is_platform_admin', TRUE) = 'true'`. The `invitation_org_isolation` policy has the same bypass. No application code sets `app.is_platform_admin`. This is additional evidence for M1-003. Specifically: a SUPER_ADMIN who is an authenticated user will see only system roles (organization_id IS NULL) and roles for their own org — they will not see org-custom roles across all organizations as required by the scope. SUPER_ADMIN cross-org admin actions will fail or return incomplete data.
- **Recommended Fix:** When implementing the RLS session variable injection (M1-003 fix), also set `SET LOCAL app.is_platform_admin = 'true'` for users whose effective permission set includes `"platform.orgs.read"` or who have the `SUPER_ADMIN` role. This should be determined from `ICurrentUser` before the EF query executes.

---

#### [INFO] M1-INFO-002: teamApi.ts Calls Stub Endpoints /auth/team/* — Not Wired to Backend

- **File:** `src/admin/src/lib/teamApi.ts`, lines 72, 77, 82, 86, 91, 95, 99, 103, 107, 112
- **Description:** `teamApi.ts` (Phase 6F Track F3) calls `GET /auth/team`, `GET /auth/team/{userId}`, `POST /auth/team/invite`, `PATCH /auth/team/{userId}`, `POST /auth/team/{userId}/suspend`, `POST /auth/team/{userId}/reactivate`, `DELETE /auth/team/{userId}`, `GET /auth/team/invites`, etc. None of these routes exist in `Auth.cs` — the backend endpoints registered are `GET /auth/org/members`, `POST /auth/org/members/invite`, etc. (as specified in the scope). The URL mismatch means all team management calls will return 404. This is a functional defect but has a security implication: because these endpoints don't exist server-side, any team management UI actions silently fail without the user receiving an error, potentially creating the false impression that invite/suspend actions succeeded when they did not.
- **Recommended Fix:** Align `teamApi.ts` route paths with the actual backend routes once the backend endpoints are implemented (`/auth/org/members`, `/auth/org/invites`, etc.). Wire the frontend to the actual endpoint contract.

---

### Module 1 Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 1 | M1-001 |
| HIGH | 3 | M1-002, M1-003, M1-004 |
| MEDIUM | 3 | M1-005, M1-006, M1-007 |
| LOW | 2 | M1-008, M1-009 |
| INFO | 2 | M1-INFO-001, M1-INFO-002 |

**GATE VERDICT: NO-GO**

Module 1 cannot be approved for any deployed environment in its current state. The three HIGH findings represent fundamental gaps:

- M1-002: The entire delegation enforcement surface (the #1 security requirement of this module) is absent — all new command handlers are empty stub directories.
- M1-003: PostgreSQL RLS is enabled but the session variable that powers it is never set — all RLS policies are silently inactive, providing no tenant isolation.
- M1-004: The permissions endpoint returns role names instead of permission codes — the frontend matrix and all permission gates are non-functional for production Firebase users.

**Blockers that must be fixed before re-review:**
1. M1-001 (CRITICAL): Rotate the Firebase API key and remove `GoogleService-Info.plist` from git history.
2. M1-002 (HIGH): Implement all Role, Invitation, Member, and Permission command handlers with delegation guard.
3. M1-003 (HIGH): Implement RLS session variable injection (`SET LOCAL app.current_user_id`) in EF Core before queries.
4. M1-004 (HIGH): Implement permission resolution from `auth.role_permission` in `GetUserPermissionsQueryHandler`.

**Fix before production (not gate blockers but must be resolved before go-live):**
5. M1-005 (MEDIUM): Verify invitation token entropy and single-use enforcement when handlers are implemented.
6. M1-006 (MEDIUM): Move LOCAL_AUTH token from `localStorage` to `sessionStorage` or in-memory state; add staging guard.
7. M1-007 (MEDIUM): Admin endpoints will be inaccessible to Firebase users until M1-004 is fixed.

**Recommended improvements:**
8. M1-008 (LOW): Restrict OTP plaintext logging to `IsDevelopment()` only, not all non-production environments.
9. M1-009 (LOW): Replace all-zeros placeholder PAN encryption key with a sentinel string rejected at startup.

*Module 1 Auth/RBAC initial review completed: 2026-05-29 (pre-implementation; findings M1-002/M1-003/M1-004/M1-005/M1-007 were timing artifacts — implementation was absent at review time)*

---

## Module 1 Auth/RBAC Re-Review (Implementation Verified)

**Scope:** Full re-review against actual implemented code. Supersedes the initial Module 1 review for all timing-artifact findings. Backlogged per user acknowledgement: M1-001 (Firebase plist), M1-006 (localStorage JWT), M1-008 (OTP staging log), M1-009 (PAN placeholder key) — these remain tracked but are not re-litigated here.
**Review Date:** 2026-05-29
**Reviewer:** security-reviewer agent

### Timing-Artifact Findings Resolved (Code Confirmed Present)

| Finding | Original Severity | Disposition |
|---------|-------------------|-------------|
| M1-002 | HIGH | RESOLVED. All command handlers implemented: SetRolePermissions, CreateOrgRole, UpdateOrgRole, DeleteOrgRole, CreateInvitation, AcceptInvitation, ResendInvitation, RevokeInvitation. All API endpoints registered in OrgRoles.cs, Invitations.cs, OrgMembers.cs, Permissions.cs, PlatformAdmin.cs. |
| M1-003 | HIGH | RESOLVED. `RlsSessionInterceptor` implemented at `AuthService.Infrastructure/Persistence/Interceptors/RlsSessionInterceptor.cs`. Registered as `DbConnectionInterceptor` in `DependencyInjection.cs` line 63. Sets `app.current_user_id` and `app.is_platform_admin` on connection open. |
| M1-004 | HIGH | RESOLVED. `GetUserPermissionsQueryHandler` now resolves actual DB permission codes via `UserRole → RolePermission → Permission` join. Returns `UserPermissionsDto` with `Roles` and `Permissions` (dot-notation codes). Wildcard `"*"` path expands to full catalog. |
| M1-005 | MEDIUM | RESOLVED. Token entropy: `RandomNumberGenerator.GetBytes(32)` = 256 bits, URL-safe base64. Single-use: `Invitation.IsValid()` checks `Status == Pending && ExpiresAt > utcNow`. `AcceptInvitationCommandHandler` calls `invitation.Accept(userId)` before `SaveChangesAsync` — status transitions atomically with membership creation. Replay blocked by status check. |
| M1-007 | MEDIUM | RESOLVED. Permission codes now correctly resolved from DB (M1-004 fix). `GetUserPermissionsQuery` returns real permission strings. Admin endpoints work for Firebase users. `OrgMembers.cs` routes match `/auth/team/*` pattern expected by `teamApi.ts`. |
| M1-INFO-001 | INFO | RESOLVED. `RlsSessionInterceptor` sets `app.is_platform_admin = 'true'` when `currentUser.HasPermission(Permissions.PlatformOrgsRead) || HasPermission("*")`. SUPER_ADMIN cross-org visibility now functional. |
| M1-INFO-002 | INFO | RESOLVED. `OrgMembers.cs` uses GroupName `/auth/team` — routes match `teamApi.ts` exactly: GET `/auth/team`, PATCH `/auth/team/{memberId}`, POST `/auth/team/{memberId}/suspend`, etc. |

---

### Findings (Actual Implementation)

#### [HIGH] M1-R-001: RlsSessionInterceptor Uses String Interpolation to Construct SQL — Potential SQL Injection in app.current_user_id

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Auth/Persistence/Interceptors/RlsSessionInterceptor.cs`, lines 61–63
- **Description:** The interceptor sets the RLS session variable using a C# interpolated string directly in `cmd.CommandText`:
  ```csharp
  cmd.CommandText = $"""
      SET LOCAL app.current_user_id = '{userId.Replace("'", "''")}';
      SET LOCAL app.is_platform_admin = '{(isPlatformAdmin ? "true" : "false")}';
      """;
  ```
  The `userId` value comes from `currentUser.UserId.ToString()` — a GUID formatted as `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. A GUID cannot contain a single-quote character, so the `Replace("'", "''")` escape is technically sufficient for the GUID case. However: (1) the escape logic relies on the caller never passing a non-GUID value — if `currentUser.UserId` were somehow populated with attacker-controlled content (e.g. via a JWT claim parsing bug), the escaping could be bypassed; (2) using string concatenation for SQL is categorically unsafe as a pattern even when the current input is constrained — it creates a maintenance risk where future changes to `userId` sourcing could silently introduce injection. The correct approach is to use parameterized `SET` or `set_config()` with proper parameter binding.
- **Recommended Fix:** Replace the interpolated SET LOCAL with a parameterized call using `set_config()` which accepts parameters safely via `NpgsqlParameter`. Example:
  ```csharp
  cmd.CommandText = "SELECT set_config('app.current_user_id', @uid, true), set_config('app.is_platform_admin', @admin, true)";
  cmd.Parameters.Add(new NpgsqlParameter("uid", userId));
  cmd.Parameters.Add(new NpgsqlParameter("admin", isPlatformAdmin ? "true" : "false"));
  ```
  This removes any injection surface regardless of input origin.
- **Reference:** CWE-89 (SQL Injection); OWASP A03:2021

---

#### [MEDIUM] M1-R-002: AcceptInvitationCommand Is Unauthenticated — Invitation Acceptance Can Be Triggered by Any Signed-In User, Not Just the Invitee

- **File:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/Invitations.cs`, line 61; `backend/Services/PlatformService/Platform.Application/Auth/Invitations/Commands/AcceptInvitation/AcceptInvitationCommand.cs`, lines 39–103
- **Description:** The `POST /auth/invite/{token}/accept` endpoint requires `.RequireAuthorization()` (the user must be authenticated), and `AcceptInvitationCommandHandler` confirms `currentUser.IsAuthenticated`. However, the invitation was sent to a specific email address (`invitation.Email`). The handler does not verify that the authenticated caller's email matches the invited email before creating the org membership. Any authenticated user who obtains the invite token (e.g. by intercepting the email, or if the token is shared) can accept the invitation as themselves — joining the organization under a different identity than intended. The intended invitee cannot then accept the invite (it will already be accepted). In a B2B multi-tenant system where invitations represent explicit access grants to specific named individuals, accepting on behalf of a different identity is an access control gap.
- **Recommended Fix:** Add an email match check in `AcceptInvitationCommandHandler` before creating the membership:
  ```csharp
  var callerEmail = currentUser.Email?.ToLowerInvariant().Trim();
  if (callerEmail is null || !string.Equals(callerEmail, invitation.Email, StringComparison.OrdinalIgnoreCase))
      return Error.Forbidden("Invitation.EmailMismatch",
          "This invitation was sent to a different email address.");
  ```
  If the platform must support phone-based users without email, add an analogous phone check when `invitation.PhoneNumber` is set. Alternatively, embed the invitee's user ID in the invitation at creation time (requires a pre-registration step) and verify against `currentUser.UserId`.
- **Reference:** CWE-284 (Improper Access Control); OWASP ASVS V4.2

---

#### [LOW] M1-R-003: RlsSessionInterceptor Silently Swallows Failure — RLS Isolation Silently Degrades Without Alert

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Auth/Persistence/Interceptors/RlsSessionInterceptor.cs`, lines 72–79
- **Description:** The interceptor catches all exceptions during session variable setting and logs a warning, but allows the request to continue:
  ```csharp
  catch (Exception ex)
  {
      logger.LogWarning(ex, "RLS: Failed to set session variables ...");
  }
  ```
  This means if the `SET LOCAL` command fails (e.g. Postgres config does not have `app` in `custom_variable_classes`, or a connection pool state issue), RLS policies silently receive `NULL` for `app.current_user_id` and fall back to their null-UUID behavior, effectively disabling tenant isolation. The log warning may go unnoticed in a high-traffic environment. A failed RLS session initialization is a security event, not merely an operational warning — it should be observable via a metric/alert.
- **Recommended Fix:** (1) Add a Cloud Monitoring counter metric increment on the catch block so alerts can be configured on non-zero rate. (2) Consider adding `custom_variable_classes = 'app'` to the Postgres config explicitly and testing at startup that the variables can be set. (3) Optionally, add a circuit-breaker: if RLS setup fails for N consecutive requests from the same connection, return a 503 rather than silently serving potentially un-isolated data.
- **Reference:** CWE-778 (Insufficient Logging); defense-in-depth for tenant isolation

---

#### [INFO] M1-R-INFO-001: ValidateInviteToken Is a Public Unauthenticated Endpoint — Timing Oracle for Token Existence

- **File:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/Invitations.cs`, lines 57–59, 102–110; `backend/Services/PlatformService/Platform.Application/Auth/Invitations/Queries/ValidateInviteToken/ValidateInviteTokenQuery.cs`
- **Description:** `GET /auth/invite/{token}` is public — no `RequireAuthorization()`. It looks up an invitation by token hash and returns different responses for valid vs. invalid tokens (200 with details vs. 410 with `isValid: false`). For a non-existent token, the handler returns `Error.NotFound` which maps to 404. An attacker can distinguish: 404 (token not in DB) vs. 410 with `isValid: false` (token exists but expired/revoked) vs. 200 (token valid). This is an oracle for whether a given token string is in the database. Given that tokens are 256-bit random values, brute-force is not feasible, but the 404 vs. 410/200 distinction slightly leaks information about system state. The more significant risk is that this endpoint reveals org name, email (invitee's email), role name, and expiry time to anyone who has the token — confirming this is intentional (the accept page needs this data), but the endpoint has no rate limiting.
- **Recommended Fix:** Add the `"otp"` or a new `"invite"` rate limiting policy to this endpoint to limit oracle/enumeration attempts: `group.MapGet("/invite/{token}", ...).RequireRateLimiting("invite")`. A modest limit (20 req/min per IP) is sufficient since legitimate users open the link once.

---

#### [INFO] M1-R-INFO-002: GetOrgMembersQuery Role Name Filter Accepts Arbitrary String — No Whitelist

- **File:** `backend/Services/PlatformService/Platform.Application/Auth/Members/Queries/GetOrgMembers/GetOrgMembersQuery.cs`, lines 58–60
- **Description:** `GetOrgMembersQuery` accepts a `Role` string parameter and filters by `r.Name == request.Role`. Unlike `GetTeamMembersQuery` (the existing admin query) which validates `request.Role` against an explicit `OperationalRoles` whitelist, `GetOrgMembersQuery` passes the role name string directly to EF Core. Since this is a parameterized LINQ query (not raw SQL), SQL injection is not possible. However, the free-form role name filter allows a caller with `org.members.read` to probe whether any given role name exists in the system (including system roles not visible in their UI) by observing whether the filter returns 0 results vs. records. This is a low-severity information disclosure.
- **Recommended Fix:** For the user-supplied `role` filter in `GetOrgMembersQuery`, validate the value against roles actually visible within the caller's org (i.e. join to `auth.role` scoped to the org before applying the filter) rather than accepting arbitrary strings. This is naturally enforced by the LINQ join on `db.Roles.Where(r => r.DeletedAt == null)` which already limits to visible roles, but the observable 0-vs-N result oracle remains.

---

### Delegation / Privilege Escalation Verification

The three delegation enforcement points were verified in detail:

**SetRolePermissions (lines 86–107 of SetRolePermissionsCommand.cs):**
- Guard fires for all non-SUPER_ADMIN, non-wildcard callers
- Effective permissions resolved from DB via `ResolveCallerEffectivePermissionsAsync` — joins both platform roles (`auth.user_role`) and org membership roles (`auth.organization_member`) to `role_permission` and `permission` tables
- JWT claim permissions (`_currentUser.Permissions`) also included for LOCAL_AUTH compatibility
- Escalation check: `requestedPermNames.Except(callerEffectivePerms)` — any permission not in caller's set triggers `Error.Forbidden("Role.PrivilegeEscalation", ...)`
- System role guard: `role.IsSystemRole` checked before any mutation
- Org isolation: `role.OrganizationId != orgId` checked before any mutation
- PASS: Server-side, not bypassable via UI or JWT manipulation

**CreateInvitation — role permission check (lines 89–111 of CreateInvitationCommand.cs):**
- Same `ResolveCallerEffectivePermissionNamesAsync` logic
- Checks role's full permission set against caller's effective permissions
- Returns `Error.Forbidden("Invitation.PrivilegeEscalation", ...)` on excess
- Duplicate pending invite prevention before token generation
- PASS

**UpdateOrgMember role reassignment (lines 74–93 of UpdateOrgMemberCommand.cs):**
- Identical delegation check pattern
- Resolves new role's permissions and compares to caller's effective set
- Returns `Error.Forbidden("Member.PrivilegeEscalation", ...)` on excess
- PASS

All three delegation guards are: (a) on the server, (b) backed by DB queries (not JWT claims alone), (c) separate from the `[RequiresPermission]` attribute-based gate (defense-in-depth), (d) applied consistently across role create/update/assign/invite paths.

### Org Isolation / IDOR Verification

Verified across all new handlers:

| Handler | Org Isolation Method | Result |
|---------|---------------------|--------|
| SetRolePermissions | `role.OrganizationId != orgId` check before mutation | PASS |
| CreateOrgRole | Scopes to `currentUser.OrganizationId.Value` | PASS |
| UpdateOrgRole | `role.OrganizationId != orgId` check | PASS |
| DeleteOrgRole | `role.OrganizationId != orgId` check; also system role guard | PASS |
| GetOrgRoles | Filters by `orgId` or `NULL` (system roles); SUPER_ADMIN bypass correct | PASS |
| CreateInvitation | Scopes to `currentUser.OrganizationId.Value` | PASS |
| AcceptInvitation | Does not verify email match — see M1-R-002 | MEDIUM finding |
| RevokeInvitation | `invite.OrganizationId != orgId` check | PASS |
| ResendInvitation | `invite.OrganizationId != orgId` check | PASS |
| GetOrgMembers | `m.OrganizationId == orgId` in base query | PASS |
| SuspendOrgMember | `m.OrganizationId == orgId` in query | PASS |
| RemoveOrgMember | `m.OrganizationId == orgId` in query | PASS |
| SuspendOrganization | Guarded by `[RequiresPermission(PlatformOrgsSuspend)]` (SUPER_ADMIN only) | PASS |
| ListPlatformOrganizations | Guarded by `[RequiresPermission(PlatformOrgsRead)]` | PASS |

RLS (`RlsSessionInterceptor`) adds defense-in-depth at the DB layer — subject to M1-R-001 (SQL injection risk in variable construction) and M1-R-003 (silent failure on set error).

### Invitation Token Security Verification

| Property | Implementation | Result |
|----------|---------------|--------|
| Entropy | `RandomNumberGenerator.GetBytes(32)` = 256 bits | PASS |
| Storage | SHA-256 hash only; raw token returned once in response, never persisted | PASS |
| Expiry | 48 hours (`DateTime.UtcNow.AddHours(48)`) | PASS |
| Single-use | `invitation.Accept(userId)` sets `Status = Accepted`; `IsValid()` checks `Status == Pending` | PASS |
| Replay blocked | Status check in `AcceptInvitationCommandHandler` lines 52–65 returns Conflict on re-use | PASS |
| Raw token in logs | Checked: no `logger.Log*` call includes `rawToken` in CreateInvitation, AcceptInvitation, ResendInvitation, or ValidateInviteToken | PASS |
| DB UNIQUE constraint | `token_hash UNIQUE` in migration 035 prevents hash collision insert | PASS |

### /auth/me/permissions Verification

`GetUserPermissionsQueryHandler` verified to return DB-resolved permission codes:
- Wildcard path: expands full `auth.permission` catalog (all `p.Name` values)
- Standard path: three-way LINQ join resolving dotted permission names (`"org.members.invite"`, etc.)
- Response DTO: `UserPermissionsDto(UserId, Roles, Permissions)` — matches `teamApi.ts PermissionsSchema`
- No over-broad exposure: only permissions actually assigned to the user's active roles are included; no cross-org permissions leak

### Module 1 Re-Review Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 1 | M1-R-001 |
| MEDIUM | 1 | M1-R-002 |
| LOW | 1 | M1-R-003 |
| INFO | 2 | M1-R-INFO-001, M1-R-INFO-002 |

**GATE VERDICT: GO with conditions**

The core security requirements of Module 1 are correctly implemented:
- Constrained delegation is enforced server-side across all three mutation paths (SetRolePermissions, CreateInvitation, UpdateOrgMember)
- Org isolation is present on all resource-scoped handlers
- RLS session variable injection is wired (`RlsSessionInterceptor`) providing defense-in-depth
- Invitation tokens have correct entropy, are stored hashed, enforce single-use, and plaintext is never logged
- Permissions endpoint returns DB-resolved permission codes, not role names

**M1-R-001 (HIGH) should be fixed before production deployment.** It is a low-exploitation-probability finding (GUID format constrains injection), but the pattern is categorically unsafe. The parameterized `set_config()` fix is a minimal change.

**M1-R-002 (MEDIUM) should be fixed before go-live.** The invitation email match check is a straightforward server-side guard that should be added to `AcceptInvitationCommandHandler`.

**Deferred (acknowledged by user, tracked for future sprints):** M1-001 (Firebase plist rotation), M1-006 (localStorage JWT), M1-008 (OTP staging log), M1-009 (PAN placeholder key).

*Module 1 re-review completed: 2026-05-29*

---

## Increment 1.1 Security Review — Permission Catalog Management + OrgContextGuard Hardening

**Scope:** New files reviewed:
- `AuthService.Application/PermissionCatalog/Commands/CreatePermission/CreatePermissionCommand.cs`
- `AuthService.Application/PermissionCatalog/Commands/UpdatePermission/UpdatePermissionCommand.cs`
- `AuthService.Application/PermissionCatalog/Commands/DeletePermission/DeletePermissionCommand.cs`
- `AuthService.Application/Common/Guards/OrgContextGuard.cs`
- `Platform.WebApi/Endpoints/Auth/Permissions.cs` (updated with write routes)
- `AuthService.Domain/Entities/Permission.cs`
- Modified handlers adopting OrgContextGuard: `CreateOrgRoleCommand`, `SetRolePermissionsCommand`, `UpdateOrgMemberCommand`, `SuspendOrgMemberCommand`, `RemoveOrgMemberCommand`, `CreateInvitationCommand`

Previously-deferred backlog items (M1-001, M1-006, M1-008, M1-009) are not re-litigated per user instruction.

**Review Date:** 2026-05-29
**Reviewer:** security-reviewer agent

---

### Focus Area 1 — platform.permissions.manage Gating on Write Endpoints

**Verdict: PASS**

All three write operations carry `[RequiresPermission(Permissions.PlatformPermissionsManage)]` at the command-record level:

- `CreatePermissionCommand` (line 25): `[RequiresPermission(Permissions.PlatformPermissionsManage)]`
- `UpdatePermissionCommand` (line 17): `[RequiresPermission(Permissions.PlatformPermissionsManage)]`
- `DeletePermissionCommand` (line 18): `[RequiresPermission(Permissions.PlatformPermissionsManage)]`

`PermissionBehavior<TRequest,TResponse>` is registered as an open generic `IPipelineBehavior<,>` (AuthService.Application `DependencyInjection.cs` line 27) and fires on every MediatR dispatch, including these three commands. The pipeline order is: Validation → PermissionBehavior — meaning a malformed request is rejected by validation before permission is even checked, and a valid request from an unauthorised caller is rejected by the permission check before the handler body runs.

`Permissions.PlatformPermissionsManage` resolves to `"platform.permissions.manage"`, which in migration 036 is granted only to `SUPER_ADMIN` (the cross-join that seeds all permissions to SUPER_ADMIN). `ORG_ADMIN` is seeded with `resource IN ('org','accounting','document','gst','itr','loan','chat','callback','subscription','notification')` — `"platform"` resource is explicitly excluded. No other system role receives `platform.permissions.manage`.

A non-SUPER_ADMIN (Org Admin, Manager, CA, HR, Reviewer) reaching `POST /auth/permissions`, `PUT /auth/permissions/{id}`, or `DELETE /auth/permissions/{id}` will be rejected by `PermissionBehavior` with `Error.Forbidden("Auth.InsufficientPermission", ...)` before the handler body executes. There is no fallback path. The enforcement is entirely server-side.

---

### Focus Area 2 — Create-Then-Grant Privilege Escalation

**Verdict: PASS — escalation is structurally blocked**

The attack scenario: a user with `platform.permissions.manage` (and therefore SUPER_ADMIN) creates a new permission `new.perm.x` via `POST /auth/permissions`, then tries to grant it to a role via `PUT /auth/org/roles/{id}/permissions`. The question is whether a non-SUPER_ADMIN with limited `org.permissions.grant` but not `new.perm.x` in their effective set could grant it.

The delegation guard in `SetRolePermissionsCommandHandler` (lines 86–119) operates as follows:

1. It loads the requested permission IDs from the database: `db.Permissions.Where(p => distinctIds.Contains(p.Id) && p.DeletedAt == null)`. A freshly-created permission exists in this table immediately — it is treated identically to any seed permission.
2. It resolves the caller's effective permission names via `ResolveCallerEffectivePermissionsAsync` — joining `auth.user_role → role_permission → permission` and `auth.organization_member → role_permission → permission`. A newly-created permission name (`"new.perm.x"`) will only appear in this set if the caller's roles have been explicitly granted it through an existing `role_permission` row.
3. The check `requestedPermNames.Except(callerEffectivePerms)` produces a non-empty set for `"new.perm.x"` unless the caller already holds it — and since the permission was just created, no existing role_permission row can grant it to the caller yet.
4. Result: `Error.Forbidden("Role.PrivilegeEscalation", "You cannot grant permissions you do not hold: new.perm.x")` — the escalation attempt is blocked.

The identical logic holds for `CreateInvitationCommandHandler` (role permission check) and `UpdateOrgMemberCommandHandler` (role reassignment check) — a freshly-created permission not yet in the caller's effective set cannot be assigned through any of these three mutation paths.

The only exception is a caller who already holds `"*"` (SUPER_ADMIN wildcard) or `PlatformPermissionsManage`. But a caller with `PlatformPermissionsManage` is SUPER_ADMIN by construction and the guard's `isSuperAdmin` branch (line 54–55) correctly skips the delegation check for them. There is no way for a non-SUPER_ADMIN to acquire `PlatformPermissionsManage` without going through `SetRolePermissions` — which would itself reject the grant because no non-SUPER_ADMIN already holds it.

---

### Focus Area 3 — Permission Name Validation (Regex + Input Risk)

**Verdict: PASS with one observation (INFO)**

The `CreatePermissionCommandValidator` enforces:
- `NotEmpty()` — cannot be blank
- `MaximumLength(200)` — bounded length, prevents oversized payloads
- `Matches(@"^[a-z0-9_]+(\.[a-z0-9_]+)+$")` — lowercase dot-notation; at least two segments; each segment composed only of `[a-z0-9_]`

The regex is correct and tight. It enforces:
- No uppercase (prevents ambiguity with case-insensitive `HasPermission` comparisons)
- No hyphens, slashes, quotes, wildcards, or other metacharacters that could interfere with downstream string matching
- At least two dot-separated segments (prevents bare single-token names like `"admin"` that could shadow role names)
- No leading/trailing dots or consecutive dots (the `+` quantifier requires at least one character per segment)

The regex is evaluated by FluentValidation's `Matches()` which uses `Regex.IsMatch` with the full string anchored by `^` and `$` — no partial-match bypass is possible.

`UpdatePermissionCommand` does not accept a new `name` — only `description` (nullable string, max 500 chars). The name, resource, and action fields on `Permission` are `private set` and only writable via `Permission.Create()`. `UpdateDescription()` is the only mutator. Name immutability is enforced at the domain entity level, not just the handler.

**Observation:** `Description` on both `CreatePermissionCommand` and `UpdatePermissionCommand` is stored as-is with no sanitisation beyond `MaximumLength(500)`. Descriptions are returned in `GetPermissionCatalogQuery` responses and will be rendered in the admin UI permission matrix. If the frontend renders descriptions with `dangerouslySetInnerHTML` or similar, stored XSS is possible. Based on prior reviews the frontend uses standard React text rendering — flagged as INFO only.

---

### Focus Area 4 — OrgContextGuard Bypass and SUPER_ADMIN Path

**Verdict: PASS — guard is correct and not bypassable**

`OrgContextGuard.ValidateAsync` performs three checks in sequence:

**Check 1 — OrganizationId must be non-null and non-empty (line 44):**
`currentUser.OrganizationId` is read from `HttpContext.Items["FirebaseClaims"]` by `CurrentUser.cs`. For Firebase-authenticated users, `organizationId` must be in the JWT custom claims (set by the backend at login). A stale or zero-GUID value fails this check with a 409 before any DB query runs.

**Check 2 — Org row must exist and not be soft-deleted (lines 53–62):**
`db.Organizations.AnyAsync(o => o.Id == orgId && o.DeletedAt == null)`. This DB round-trip prevents a token from acting on behalf of a deleted or never-existing org. RLS on `auth.organization` provides a second layer for non-SUPER_ADMIN callers.

**Check 3 — Membership verification for non-SUPER_ADMIN (lines 64–82):**
`isSuperAdmin` is determined by `currentUser.HasPermission(Permissions.PlatformOrgsRead) || HasPermission("*")`. For non-SUPER_ADMIN callers, an active `organization_member` row is required (`m.IsActive && m.DeletedAt == null`). A user whose membership has been suspended or soft-deleted cannot pass this check.

**SUPER_ADMIN org-context path:** When `isSuperAdmin` is true, Check 3 is skipped (`if (requireMembership && !isSuperAdmin)`). This is correct — a SUPER_ADMIN does not need an explicit membership row to act within any org. The guard still runs Check 1 and Check 2, so even SUPER_ADMIN cannot operate against a non-existent or deleted org ID. A SUPER_ADMIN with an all-zeros org ID in their token will fail Check 1.

**Bypass analysis:** There are three token origins:
- Firebase tokens: `organizationId` is a custom claim set by backend — not user-controllable
- LOCAL_AUTH tokens: signed with `LocalJwt.Issue()` using HMAC-SHA256 — not forgeable without the server secret
- DEV_AUTH_BYPASS tokens: canned token map with fixed values — not injectable from outside

No path allows a non-SUPER_ADMIN to pass Check 3 without a live, active membership row in the database. A user who has just been suspended via `SuspendOrgMemberCommand` will fail the guard on their next write attempt.

**OrgContextGuard adoption:** The guard is called in all six org-scoped write handlers: `CreateOrgRoleCommand` (requireMembership: true), `SetRolePermissionsCommand` (requireMembership: true, gated on non-SUPER_ADMIN), `UpdateOrgMemberCommand` (requireMembership: true), `SuspendOrgMemberCommand` (requireMembership: true), `RemoveOrgMemberCommand` (requireMembership: true), `CreateInvitationCommand` (requireMembership: true). The permission catalog write commands (`CreatePermissionCommand`, `UpdatePermissionCommand`, `DeletePermissionCommand`) do not call `OrgContextGuard` — this is correct, as they are platform-global operations (no org context), not org-scoped writes.

---

### Findings

#### [MEDIUM] I1.1-001: DeletePermissionCommand Does Not Verify the Permission Is Not Referenced by Soft-Deleted role_permission Rows — Resurrection Risk

- **File:** `AuthService.Application/PermissionCatalog/Commands/DeletePermission/DeletePermissionCommand.cs`, lines 35–42
- **Description:** The active-grant check before deletion is `db.RolePermissions.CountAsync(rp => rp.PermissionId == request.PermissionId && rp.DeletedAt == null)`. This correctly blocks deletion when active grants exist. However, soft-deleted `role_permission` rows (`rp.DeletedAt != null`) are not counted. If a SUPER_ADMIN: (1) grants permission P to role R, (2) removes the grant (soft-deletes the `role_permission` row), (3) soft-deletes the permission from the catalog, and later (4) restores the permission (by re-creating it with the same name — the uniqueness check allows recreation of soft-deleted names), the previously soft-deleted `role_permission` row still exists in the DB with the old permission ID. Since permissions get a new UUID on recreation (via `gen_random_uuid()`), the orphaned soft-deleted `role_permission` row points to the old ID and is inert. This is not an active exploitation path. The actual risk is subtler: if soft-deleted `role_permission` rows are ever un-soft-deleted as part of a bulk restore/audit operation, a permission that was supposed to be deleted could silently re-activate. This is a data integrity concern that could become a security issue depending on future restore operations.
- **Recommended Fix:** When soft-deleting a permission, also permanently hard-delete or explicitly confirm-delete all associated `role_permission` rows (including soft-deleted ones) whose `permission_id` matches. Alternatively, add a comment in the handler noting that soft-deleted `role_permission` rows referencing this permission remain in the database and any future restore tooling must not reactivate them.
- **Reference:** CWE-672 (Operation on a Resource After Expiration or Release)

---

#### [LOW] I1.1-002: CreatePermissionCommand Uniqueness Check Is Case-Sensitive — Allows Near-Duplicate Names That Differ Only in Casing

- **File:** `AuthService.Application/PermissionCatalog/Commands/CreatePermission/CreatePermissionCommand.cs`, line 69
- **Description:** The duplicate check is `db.Permissions.AnyAsync(p => p.Name == request.Name && p.DeletedAt == null)`. EF Core translates `==` on a `string` column to a case-sensitive `=` comparison in PostgreSQL (the `auth.permission.name` column has no `citext` type). The FluentValidation regex `^[a-z0-9_]+(\.[a-z0-9_]+)+$` enforces lowercase on the incoming request. However, if a permission was seeded or created historically with a mixed-case name (e.g., during early dev), the duplicate check would not detect `"gst.Returns.File"` as a duplicate of `"gst.returns.file"`. This is a low-probability scenario given the regex enforcement on all new creates, but represents a consistency gap. Additionally, `HasPermission()` in `CurrentUser.cs` uses `StringComparer.OrdinalIgnoreCase` for comparison — so two permissions differing only in case would both match the same `[RequiresPermission]` attribute, creating an ambiguous catalog state.
- **Recommended Fix:** Add `.ToLower()` to the uniqueness check: `p.Name == request.Name.ToLower()`, or use `.ToLowerInvariant()` before DB comparison. Since the regex already enforces lowercase input, this is mainly defensive against direct DB manipulation or future tooling bypassing the validator.
- **Reference:** CWE-178 (Improper Handling of Case Sensitivity)

---

#### [INFO] I1.1-INFO-001: Permission Description Field Has No Output-Encoding Guidance — Rendered in Admin UI Permission Matrix

- **File:** `AuthService.Application/PermissionCatalog/Commands/CreatePermission/CreatePermissionCommand.cs` (line 54–57); `AuthService.Application/PermissionCatalog/Queries/GetPermissionCatalog/GetPermissionCatalogQuery.cs`
- **Description:** The `description` field on a permission is stored as plain text and returned verbatim in `GetPermissionCatalogQuery`. It is rendered in the frontend permission matrix UI. The field is writable only by SUPER_ADMIN (via `platform.permissions.manage`), so the stored-XSS attack surface requires SUPER_ADMIN compromise first — which would itself be a more severe breach. This is informational: confirm the frontend matrix renders description strings via standard React text nodes (not `innerHTML`) before marking fully mitigated. Based on prior review of the frontend codebase, no `dangerouslySetInnerHTML` was found in permission-related components.
- **Recommended Fix:** Confirm in a frontend review that `PermissionDto.description` is rendered with standard React text interpolation (`{description}`) and not injected as HTML. Add a note to the API spec that this field must not be rendered as raw HTML.

---

### Verification Checklist

| Control | Expected | Observed | Result |
|---------|----------|----------|--------|
| `platform.permissions.manage` required for POST /auth/permissions | `[RequiresPermission]` on command class, PermissionBehavior fires | All three write commands decorated; pipeline confirmed | PASS |
| Non-SUPER_ADMIN cannot create catalog permissions | Rejection before handler body | PermissionBehavior returns Forbidden before handler runs | PASS |
| Freshly-created permission cannot be grant-escalated by non-SUPER_ADMIN | `ResolveCallerEffectivePermissionsAsync` queries DB, new perm not yet in any role_permission | Confirmed — new perm has no role_permission rows, cannot appear in effective set | PASS |
| Permission name regex `^[a-z0-9_]+(\.[a-z0-9_]+)+$` | Lowercase, dot-notation, no injection chars | Validator confirmed; `^`/`$` anchors prevent partial match | PASS |
| Permission name immutable after creation | `name`/`resource`/`action` private set, only `UpdateDescription()` exposed | Domain entity enforces; `UpdatePermissionCommand` accepts only `description` | PASS |
| Delete blocked when permission in active use | `role_permission` count check before soft-delete | Implemented; see I1.1-001 for soft-deleted rows gap | PASS (with note) |
| OrgContextGuard not bypassable | Three DB checks: orgId present, org exists, membership active | All six org-scoped write handlers call guard with `requireMembership: true` | PASS |
| SUPER_ADMIN skips membership check correctly | `isSuperAdmin` path skips Check 3 only, still runs Check 1+2 | Confirmed — `if (requireMembership && !isSuperAdmin)` | PASS |
| Permission catalog write commands do not call OrgContextGuard | Platform-global, no org scope | Correct — CreatePermission/Update/Delete operate on global catalog | PASS |

---

### Increment 1.1 Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 1 | I1.1-001 |
| LOW | 1 | I1.1-002 |
| INFO | 1 | I1.1-INFO-001 |

**GATE VERDICT: GO**

All four focus areas pass. The `platform.permissions.manage` gate is correctly enforced server-side through `PermissionBehavior` and cannot be bypassed by any non-SUPER_ADMIN. The create-then-grant escalation path is structurally blocked — a freshly-created permission has no `role_permission` rows, so it cannot appear in any non-SUPER_ADMIN caller's effective permission set, and the delegation check in `SetRolePermissionsCommand` will reject the grant attempt with `403 Role.PrivilegeEscalation`. The permission name regex is tight and correctly anchored. `OrgContextGuard` is consistently adopted across all org-scoped write handlers, is not bypassable, and the SUPER_ADMIN path is handled correctly.

I1.1-001 (MEDIUM) is a data-integrity gap around soft-deleted `role_permission` rows that could become a security issue if future restore tooling is added. Recommended to address before any bulk-restore capability is built. I1.1-002 (LOW) is a cosmetic consistency gap in the uniqueness check, fully mitigated in practice by the validator regex.

*Increment 1.1 review completed: 2026-05-29*

---

## Increment 1.3 Security Review — Add User + Per-User Permission Grants + Assignable Roles

**Scope:** New files reviewed:
- `AuthService.Application/Admin/Commands/CreateUserAdmin/CreateUserAdminCommand.cs`
- `AuthService.Application/Admin/Queries/GetAssignableRoles/GetAssignableRolesQuery.cs`
- `AuthService.Application/Common/Helpers/EffectivePermissionResolver.cs`
- `AuthService.Application/Interfaces/IPasswordHasher.cs`
- `AuthService.Infrastructure/Auth/PasswordHasherAdapter.cs`
- `AuthService.Domain/Entities/UserPermission.cs`
- `AuthService.Domain/Entities/Permission.cs` (updated — `IsActive`, `SetActive`)
- `AuthService.Infrastructure/Persistence/Configurations/UserPermissionConfiguration.cs`
- `Platform.WebApi/Endpoints/Auth/AdminUsers.cs`
- `database/migrations/038_user_permission.sql`

Updated files reviewed for regressions:
- `GetUserPermissionsQuery.cs` (now uses `EffectivePermissionResolver`)
- `GetGrantablePermissionsQuery.cs` (now uses `EffectivePermissionResolver`)
- `SetRolePermissionsCommand.cs` (referenced for resolver consistency)
- `AuthService.Infrastructure/DependencyInjection.cs` (`IPasswordHasher` registration)

Deferred backlog items (M1-001, M1-006, M1-008, M1-009) are not re-litigated per user instruction.

**Review Date:** 2026-05-29
**Reviewer:** security-reviewer agent

---

### Focus Area 1 — Privilege Escalation via Create-User Flow

#### 1a. Role Perms ⊆ Caller's Effective Set

**Verdict: PASS**

`CreateUserAdminCommandHandler` (lines 147–165) resolves the caller's effective permission names via `EffectivePermissionResolver.ResolveAsync` for all callers who do not hold `"*"`. The resolver includes all three legs: platform-role permissions, org-membership-role permissions, and direct `user_permission` grants. The check `rolePermNames.Except(callerEffective)` produces a non-empty list for any role whose permissions exceed the caller's set, returning `Error.Forbidden("Role.PrivilegeEscalation", ...)` before any write.

#### 1b. Override permissionIds ⊆ Caller's Effective Set

**Verdict: PASS**

The override permissions delegation check (lines 183–198) runs identically — the same `EffectivePermissionResolver.ResolveAsync` call, then `.Except(callerEffective)`. A non-wildcard caller cannot include an override permission they do not themselves hold. The `overridePerms` list is populated exclusively from DB rows matching `p.IsActive && p.DeletedAt == null` (line 173), so retired and soft-deleted permissions cannot be injected even if their IDs are submitted.

#### 1c. Non-SUPER_ADMIN Cannot Assign Platform/System Roles — FINDING

**Verdict: FAIL — see I1.3-001 (HIGH)**

The system-role block at line 142 is:
```csharp
if (!isSuperAdmin && role.IsSystemRole && role.OrganizationId is null)
    return Error.Forbidden("User.PrivilegeEscalation", "...");
```

`isSuperAdmin` is defined at lines 97–98:
```csharp
var isSuperAdmin = currentUser.HasPermission(Permissions.PlatformAdminsInvite)
                || currentUser.HasPermission("*");
```

`Permissions.PlatformAdminsInvite` = `"platform.admins.invite"`. In the current seed (migration 036), `platform.admins.invite` is granted exclusively to `SUPER_ADMIN` via the cross-join. The `[RequiresPermission(Permissions.PlatformAdminsInvite)]` gate on the command class means only holders of this permission can reach the handler at all.

**The vulnerability is a semantic error in the `isSuperAdmin` definition:** it treats the possession of `platform.admins.invite` as equivalent to SUPER_ADMIN status. This is correct in the seed-only state but creates a latent privilege-escalation path: if `platform.admins.invite` is ever granted to a non-SUPER_ADMIN user (directly via `auth.user_permission`, or via `SetRolePermissions` granting it to a custom role — though `SetRolePermissions` itself requires the caller to hold the permission, creating a chain), that user's `isSuperAdmin` becomes `true`, bypassing the system-role block at line 142.

A concrete attack chain: (1) SUPER_ADMIN grants `platform.admins.invite` directly to user U via a future grant-management endpoint or direct DB write. (2) User U calls `POST /auth/admin/users` with `scope=platform` and `roleId=<SUPER_ADMIN role UUID>`. (3) Line 142: `!isSuperAdmin` is `false` (U holds `platform.admins.invite`), so the block is skipped. (4) Line 148: `!HasPermission("*")` is `true` (U does not hold `"*"`), so the delegation check runs. (5) The delegation check computes `SUPER_ADMIN role perms.Except(U's effective perms)`. If U holds all SUPER_ADMIN permissions (e.g., via a broad grant), this passes. (6) U successfully creates a SUPER_ADMIN user — full privilege escalation.

Even without step 5 succeeding (the delegation check catches perms U doesn't hold), step 3 alone demonstrates the system-role block is not the correct guard to rely on: the delegation check becomes the only backstop, and a sufficiently-privileged-but-not-SUPER_ADMIN user could bypass both.

**Recommended Fix:** Replace the `isSuperAdmin` flag definition with the correct wildcard-only check:
```csharp
var isSuperAdmin = currentUser.HasPermission("*");
```
Then separately use `HasPermission(Permissions.PlatformAdminsInvite)` only where non-wildcard platform-invite callers need to be distinguished (e.g., the org-scope guard at line 108, which already correctly uses `!currentUser.HasPermission("*")`). The system-role block must use the wildcard check, not the permission-name check:
```csharp
if (!currentUser.HasPermission("*") && role.IsSystemRole && role.OrganizationId is null)
    return Error.Forbidden("User.PrivilegeEscalation", "...");
```
This ensures only a true SUPER_ADMIN (wildcard) can assign system/platform roles, regardless of what individual permissions a caller holds.

---

### Focus Area 2 — Effective-Permission Resolver Correctness

**Verdict: PASS**

`EffectivePermissionResolver.ResolveAsync` is the single canonical resolver, replacing the previously duplicated three-leg expansions in each handler. All three legs apply both guards: `p.IsActive && p.DeletedAt == null`. Specific checks:

**Retired permissions excluded:** Leg 1 (platform roles) and Leg 2 (org roles) join to `db.Permissions.Where(p => p.IsActive && p.DeletedAt == null)`. Leg 3 (direct `user_permission` grants) also joins the same filter. A grant to a retired permission cannot surface in the resolver output, and thus cannot appear in any delegation comparison.

**Soft-deleted grants excluded:** Leg 3 filters `up.DeletedAt == null` on the `user_permission` row. A soft-deleted direct grant is ignored.

**Org scope enforced in Leg 3:** The WHERE clause in Leg 3 is:
```csharp
up.OrganizationId == null ||
(activeOrgId.HasValue && up.OrganizationId == activeOrgId.Value)
```
A grant scoped to org B (`up.OrganizationId = orgB`) when the resolver is called with `activeOrgId = orgA` will not satisfy either predicate and is excluded. Platform-scoped grants (`up.OrganizationId == null`) are always included regardless of org context, which is the correct semantics for platform-level direct grants.

**No trickery via Leg 3 inflation:** A direct grant of a permission the caller doesn't normally hold only appears in the **resolver output for the target user** (the new user being created). The caller's effective set is resolved separately using `currentUser.UserId` and `currentUser.OrganizationId`. There is no path for a caller to inflate their own effective set by pre-creating a `user_permission` grant for themselves through this flow — the delegation check runs against the DB state at the time of the `SetRolePermissions` or `CreateUserAdmin` call.

**`GetUserPermissionsQuery` regression:** Confirmed now calls `EffectivePermissionResolver.ResolveAsync` (lines 52–53) instead of the previous inline expansion. Wildcard path still returns only `IsActive && DeletedAt == null` permissions.

**`GetGrantablePermissionsQuery` regression:** Confirmed now calls `EffectivePermissionResolver.ResolveAsync` (line 41). Retired permission guard `var livePermissions = db.Permissions.Where(p => p.IsActive && p.DeletedAt == null)` (line 32) applied before ID filtering. Retired permissions cannot appear in grantable set for any caller.

---

### Focus Area 3 — auth.user_permission RLS and Org Isolation

**Verdict: PASS (defense-in-depth layer is correctly implemented)**

Migration 038 enables RLS on `auth.user_permission` with policy `user_permission_org_isolation`:

```sql
USING (
    current_setting('app.is_platform_admin', TRUE) = 'true'
    OR organization_id IS NULL
    OR organization_id IN (
        SELECT id FROM auth.organization WHERE owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
        UNION
        SELECT organization_id FROM auth.organization_member
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID AND is_active = TRUE
    )
)
```

An org-scoped grant (`organization_id = orgA`) is visible only to:
- Platform admins (`app.is_platform_admin = 'true'`)
- Users whose `app.current_user_id` matches the org owner or an active member of orgA

A grant scoped to org A cannot satisfy the `organization_id IN (...)` subquery for a user in org B, and is not `NULL` (which is the platform-grant pass-through). This correctly prevents cross-org visibility of org-scoped direct grants.

The `RlsSessionInterceptor` wiring (reviewed and confirmed in Module 1 re-review) supplies `app.current_user_id` and `app.is_platform_admin` before queries.

**Unique index scoping (migration 038, line 39–45):**
```sql
CREATE UNIQUE INDEX uq_user_permission_scope
  ON auth.user_permission (user_id, permission_id, COALESCE(organization_id, '00000000-...'))
  WHERE deleted_at IS NULL;
```
The COALESCE normalises NULL org to the nil UUID so platform-scoped grants deduplicate correctly. An org-scoped grant for org A and a platform grant for the same (user, permission) pair are distinct entries (different COALESCE values), which is the correct semantic.

**Application-layer isolation in `CreateUserAdminCommand`:** The `targetOrgId` for org-scoped direct grants is taken from `request.OrganizationId.Value` (line 121), which is validated against the caller's own org via `OrgContextGuard` for non-wildcard callers (lines 110–118). A non-SUPER_ADMIN caller cannot set `targetOrgId` to a foreign org because `guardedOrgId != request.OrganizationId.Value` would return `Error.Forbidden("User.OrgMismatch", ...)`.

---

### Focus Area 4 — initialPassword Handling

**Verdict: PASS**

`InitialPassword` handling in `CreateUserAdminCommandHandler` (lines 213–221):

```csharp
if (request.InitialPassword is not null)
{
    var localAuthEnabled =
        Environment.GetEnvironmentVariable("LOCAL_AUTH")
            ?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;

    if (localAuthEnabled)
        newUser.SetPasswordHash(hasher.Hash(request.InitialPassword));
}
```

**LOCAL_AUTH gate:** `initialPassword` is silently ignored (no error, no hash stored) when `LOCAL_AUTH` is not set to `"true"`. In production (Firebase auth mode), `LOCAL_AUTH` is never set. The password is not stored, not returned, and not logged.

**PBKDF2 hashing:** `IPasswordHasher.Hash()` is implemented by `PasswordHasherAdapter.Hash()` → `PasswordHasher.Hash()`. The `PasswordHasher.Hash` implementation (reviewed in Module 1 re-review) uses `Rfc2898DeriveBytes.Pbkdf2` with SHA-256, 100,000 iterations, 16-byte random salt, 32-byte output. This matches the seeded dev-admin hashing and is correctly parameterised.

**Not returned in response:** `CreateUserAdminResponse` contains `UserId`, `Email`, `Scope`, `RoleId`, `GrantedPermissions`. No password field.

**Not logged:** Checked `LoggingBehavior` — it logs request type name, not request fields. The `InitialPassword` value is never written to any log statement in the handler or the shared pipeline. No `logger.Log*` call references `InitialPassword` or `request.InitialPassword` in any file in scope.

**Minimum length enforced:** Validator rule (line 80–82) requires `MinimumLength(8)` when not null — prevents trivial passwords even in dev mode.

---

### Focus Area 5 — Endpoint Gating

**Verdict: PASS**

Both endpoints in `AdminUsers.cs` call `.RequireAuthorization()` (mandatory JWT presence) and route to commands/queries that carry `[RequiresPermission(Permissions.PlatformAdminsInvite)]`:

- `POST /auth/admin/users` → `CreateUserAdminCommand` — `[RequiresPermission(PlatformAdminsInvite)]` ✓
- `GET /auth/admin/assignable-roles` → `GetAssignableRolesQuery` — `[RequiresPermission(PlatformAdminsInvite)]` ✓

`PermissionBehavior` is registered as an open-generic in the pipeline and fires on both. Neither endpoint is publicly accessible or skips authorization. An unauthenticated request fails at `RequireAuthorization()`. An authenticated but unpermitted request (any non-SUPER_ADMIN in the current seed) fails at `PermissionBehavior` before the handler body runs.

`GetAssignableRolesQuery` additionally applies a server-side delegation filter (lines 88–103) that limits returned roles to those whose permission sets are subsets of the caller's effective set. This is UI-assistance only (the `CreateUserAdminCommand` handler enforces the same constraint independently), but it is consistent with the delegation model.

---

### Findings

#### [HIGH] I1.3-001: isSuperAdmin Flag Conflates platform.admins.invite with Wildcard — System-Role Block Can Be Bypassed If platform.admins.invite Is Granted to a Non-SUPER_ADMIN — **FIXED 2026-05-29**

- **File:** `AuthService.Application/Admin/Commands/CreateUserAdmin/CreateUserAdminCommand.cs`, lines 97–98, 142
- **Description:** `isSuperAdmin` is `true` for any caller holding `platform.admins.invite` (line 97). The system-role assignment block at line 142 uses `!isSuperAdmin` as its bypass condition. This means any caller who has been granted `platform.admins.invite` (even directly via a `user_permission` row rather than through a role) bypasses the block and may assign system/platform roles like `SYSTEM_ADMIN` or `SUPER_ADMIN` to newly created users. In the seed state this is safe because `platform.admins.invite` is seeded only to SUPER_ADMIN. But SUPER_ADMIN can grant this permission to any user via `SetRolePermissions` or (once implemented) direct user_permission management — at which point the block fails silently and platform-role assignment opens to a non-wildcard user. The delegation check at line 148 (`!HasPermission("*")`) would still catch cases where the assigned role's permissions exceed the caller's effective set — but only if the caller does not also happen to hold all those permissions. A partial-SUPER_ADMIN who holds all platform permissions via direct grants would pass both checks.
- **Recommended Fix:** Replace `isSuperAdmin` at line 97 with the correct wildcard-only check, and use it consistently for the system-role block:
  ```csharp
  var isWildcardSuperAdmin = currentUser.HasPermission("*");
  // ...
  if (!isWildcardSuperAdmin && role.IsSystemRole && role.OrganizationId is null)
      return Error.Forbidden("User.PrivilegeEscalation",
          "You cannot assign a platform/system role. Only SUPER_ADMIN may do so.");
  ```
  Retain `HasPermission(PlatformAdminsInvite)` in the org-scope block at line 108 if that path is genuinely meant to allow non-wildcard platform-invite holders to create org-scoped users in any org. Otherwise make that check also use the wildcard.
- **Reference:** CWE-269 (Improper Privilege Management); OWASP ASVS V4.1

---

#### [MEDIUM] I1.3-002: CreateUserAdminCommandHandler Calls EffectivePermissionResolver Twice for the Same Caller — TOCTOU Window Between the Two Delegation Checks

- **File:** `AuthService.Application/Admin/Commands/CreateUserAdmin/CreateUserAdminCommand.cs`, lines 150–152 (role check) and 185–187 (override check)
- **Description:** The handler resolves the caller's effective permission set via `EffectivePermissionResolver.ResolveAsync` twice — once for the role delegation check and once for the override-permissions delegation check. These are two separate database round-trips executed sequentially. In theory, if a concurrent process modifies the caller's role grants or direct `user_permission` grants between the two calls (e.g., another admin suspends the caller's membership or revokes a grant), the two calls could return different sets. The first check could pass (caller held perm P at time T1), but the override check at time T2 could include perm P even if it was revoked at T1+δ — or vice versa. In practice this window is very short (two DB round-trips) and exploitation requires a precise concurrent modification. However, the fix is simple and removes the ambiguity entirely.
- **Recommended Fix:** Resolve the caller's effective permissions once before both checks and reuse the result:
  ```csharp
  HashSet<string> callerEffective = [];
  if (!currentUser.HasPermission("*"))
  {
      callerEffective = await EffectivePermissionResolver.ResolveAsync(
          db, currentUser.UserId, currentUser.OrganizationId, cancellationToken);
      callerEffective.UnionWith(currentUser.Permissions.Where(p => p != "*"));
  }
  ```
  Then use `callerEffective` directly in both delegation checks without re-querying.
- **Reference:** CWE-362 (Concurrent Execution Using Shared Resource with Improper Synchronization)

---

#### [LOW] I1.3-003: initialPassword Silently Ignored in Production — No Client-Facing Signal That Password Was Not Set

- **File:** `AuthService.Application/Admin/Commands/CreateUserAdmin/CreateUserAdminCommand.cs`, lines 213–221
- **Description:** When `initialPassword` is supplied but `LOCAL_AUTH` is not enabled (the production case), the password is silently ignored and the user is created without one. `CreateUserAdminResponse` does not include a field indicating whether a password was stored. An admin using the UI in a production-adjacent environment (e.g., a staging environment without `LOCAL_AUTH=true`) could believe they set a password for the new user when they did not, leaving the account in an unusable state from a local-login perspective and potentially creating an orphaned user whose only access path is Firebase OTP. While the correct design for production is Firebase-only auth, the silent failure provides no feedback.
- **Recommended Fix:** Add a boolean `PasswordSet` field to `CreateUserAdminResponse` that reflects whether a password hash was actually stored. Alternatively, return a validation error when `initialPassword` is provided in a non-LOCAL_AUTH environment, making the mismatch explicit rather than silent.
- **Reference:** CWE-392 (Missing Report of Error Condition)

---

#### [INFO] I1.3-INFO-001: auth.user_permission Has No Rate Limit or Maximum-Per-User Cap — Unbounded Direct Grant Accumulation

- **File:** `database/migrations/038_user_permission.sql`, `CreateUserAdminCommand.cs` line 76–78 (100-grant cap per request only)
- **Description:** The validator caps `permissionIds` at 100 per single `CreateUserAdminCommand` call. There is no cumulative cap on how many `user_permission` rows a single user may accumulate across multiple calls. A SUPER_ADMIN making N calls could create N×100 direct permission grants for the same user. While the effective-permission resolver's Leg 3 is an efficient DB join, an unbounded grant count creates operational complexity (auditing, revocation) and could slow the resolver for users with very large grant sets. More relevantly, audit trail reviews become harder when a single user has hundreds of individual grants.
- **Recommended Fix:** Add a pre-write check in `CreateUserAdminCommand` (or a separate grant-management flow) that enforces a per-user cumulative cap (e.g., 50 active direct grants per user). Alternatively, document that direct grants are intended for small override sets (1–5 permissions) and the UI should enforce this.

---

### Verification Checklist

| Control | Expected | Observed | Result |
|---------|----------|----------|--------|
| `platform.admins.invite` required for POST /auth/admin/users | `[RequiresPermission]` + PermissionBehavior | Confirmed on command class | PASS |
| `platform.admins.invite` required for GET /auth/admin/assignable-roles | `[RequiresPermission]` on query class | Confirmed | PASS |
| Non-SUPER_ADMIN cannot assign system/platform roles | Wildcard-only bypass of system-role block | **FIXED (I1.3-001)** — `isWildcardAdmin = HasPermission("*")` only; `platform.admins.invite` holders correctly blocked | PASS |
| Role perms ⊆ caller's effective set before write | DB-resolved check, 403 on excess | Confirmed, PASS — resolver called twice (I1.3-002 open MEDIUM) | PASS |
| Override permissionIds ⊆ caller's effective set | DB-resolved check, 403 on excess | Confirmed | PASS |
| Retired permissions excluded from override resolution | `p.IsActive && p.DeletedAt == null` on DB query | Confirmed at line 173 | PASS |
| Org-scoped direct grants isolated per org | Leg 3 WHERE clause filters by activeOrgId | Confirmed in `EffectivePermissionResolver` line 62 | PASS |
| RLS on auth.user_permission | Policy references `app.current_user_id` session var | Confirmed in migration 038; RlsSessionInterceptor sets it | PASS |
| initialPassword hashed via PBKDF2 | `IPasswordHasher.Hash()` → `PasswordHasher.Hash()` | Confirmed — 100K iterations, SHA-256, random salt | PASS |
| initialPassword only stored under LOCAL_AUTH | `Environment.GetEnvironmentVariable("LOCAL_AUTH")` check | Confirmed — silently ignored in production | PASS |
| initialPassword never returned in response | `CreateUserAdminResponse` fields | No password field in response | PASS |
| initialPassword never logged | No log statement references InitialPassword | Confirmed | PASS |

---

### Increment 1.3 Summary

| Severity | Count | Finding IDs | Status |
|----------|-------|-------------|--------|
| CRITICAL | 0 | — | — |
| HIGH | 1 | I1.3-001 | **FIXED 2026-05-29** |
| MEDIUM | 1 | I1.3-002 | Open |
| LOW | 1 | I1.3-003 | Open |
| INFO | 1 | I1.3-INFO-001 | Open |

**GATE VERDICT (initial): NO-GO** → **Updated verdict after fix: GO**

I1.3-001 (HIGH) was a blocker. The `isSuperAdmin` flag in `CreateUserAdminCommand` conflated holding `platform.admins.invite` with SUPER_ADMIN wildcard status. The system-role assignment block at line 142 relied on this flag, meaning any user who could be granted `platform.admins.invite` (even directly) could assign `SYSTEM_ADMIN` or `SUPER_ADMIN` to new users. **Fixed — see re-confirmation section below.**

I1.3-002 (MEDIUM) remains open — duplicate DB round-trip / theoretical TOCTOU window. Recommended to address but not a gate blocker.

*Increment 1.3 initial review completed: 2026-05-29*

---

### Increment 1.3 Re-Confirmation — I1.3-001 Fix Verified

**Fix verified in:** `AuthService.Application/Admin/Commands/CreateUserAdmin/CreateUserAdminCommand.cs`
**Date:** 2026-05-29
**Build status:** Green (0 warnings). AuthService unit tests: 241/241 pass (reported by orchestrator).
**Live test:** Orchestrator confirmed a user holding `platform.admins.invite` directly (via `user_permission`) but not `"*"` now receives `403 User.PrivilegeEscalation` with message "Only a wildcard SUPER_ADMIN may do so." on `POST /auth/admin/users scope=platform roleId=<SYSTEM_ADMIN>`. A true SUPER_ADMIN continues to succeed.

**Code changes verified (read-only):**

1. **Line 103 — Flag renamed and narrowed:**
   ```csharp
   var isWildcardAdmin = currentUser.HasPermission("*");
   ```
   The old `isSuperAdmin` which ORed in `PlatformAdminsInvite` is gone. The new variable is exclusively the wildcard check. No other condition is mixed in.

2. **Line 113 — Org-scope bypass updated:**
   ```csharp
   if (!isWildcardAdmin)
   ```
   Was `!currentUser.HasPermission("*")`. Now consistently uses `isWildcardAdmin`. Semantically identical to before; variable rename only.

3. **Line 148 — System-role block uses wildcard-only flag:**
   ```csharp
   if (!isWildcardAdmin && role.IsSystemRole && role.OrganizationId is null)
       return Error.Forbidden("User.PrivilegeEscalation",
           "You cannot assign a platform/system role. Only a wildcard SUPER_ADMIN may do so.");
   ```
   The original `!isSuperAdmin` (which was `true` for `platform.admins.invite` holders) is replaced by `!isWildcardAdmin` (which is `true` only for `"*"` holders). A holder of `platform.admins.invite` who does not have `"*"` now falls into this branch and receives 403. This is the correct and intended behaviour.

4. **Lines 154 and 189 — Both delegation checks updated:**
   Both use `if (!isWildcardAdmin)` consistently. The resolver is still called twice (I1.3-002, open MEDIUM), but both checks now use the same flag as the system-role block, eliminating any inconsistency between the three guard points.

5. **Doc comment (lines 21–27):** Updated to explicitly document the I1.3-001 fix rationale — that `platform.admins.invite` is the endpoint gate only and must not be treated as wildcard-equivalent inside the handler. This narrows the attack surface for future readers.

6. **`[RequiresPermission]` at line 31:** Correctly unchanged — `platform.admins.invite` remains the endpoint admission gate, which is the right design. Only SUPER_ADMIN holds it in seed, and it can now be granted to others (for org-scoped user creation) without opening the platform-role assignment path.

**No regressions introduced:** All other handler logic (email/phone uniqueness checks, role resolution, delegation checks for non-system roles, override-permission delegation, password hashing, user creation writes) is unchanged.

**Absence of dedicated xUnit regression test:** A unit test specifically asserting that a `platform.admins.invite` holder (without `"*"`) receives `403 User.PrivilegeEscalation` on `scope=platform + IsSystemRole=true` was not added (implementing agent transient error). This is noted as a **recommended follow-up, not a gate blocker** for the following reasons:
- The fix is a single, mechanically simple flag substitution with no conditional branches of its own — the test surface is small.
- The orchestrator has already run the live test and confirmed the expected 403.
- The existing 241/241 unit tests provide regression coverage for the broader delegation logic.
- The vulnerability was in a latent escalation path (requires SUPER_ADMIN to first grant `platform.admins.invite` to another user), not an immediately exploitable in-the-wild condition.

The test should be added in the next test-coverage pass targeting `CreateUserAdminCommandHandler`.

**Updated verdict:** I1.3-001 is RESOLVED. All originally-passing controls remain passing. Remaining open items are I1.3-002 (MEDIUM, TOCTOU) and I1.3-003 (LOW, silent password ignore) — neither is a gate blocker.

**GATE VERDICT: GO**
CRITICAL: 0 | HIGH: 0 | MEDIUM: 1 (I1.3-002) | LOW: 1 (I1.3-003) | INFO: 1 (I1.3-INFO-001)

*Increment 1.3 re-confirmation completed: 2026-05-29*

---

## Increment 1.4 Phase A Security Review — Reference-Data CRUD

**Scope:** New files reviewed:
- `AuthService.Application/ReferenceData/Commands/CreateReferenceData/CreateReferenceDataCommand.cs`
- `AuthService.Application/ReferenceData/Commands/UpdateReferenceData/UpdateReferenceDataCommand.cs`
- `AuthService.Application/ReferenceData/Commands/DeleteReferenceData/DeleteReferenceDataCommand.cs`
- `AuthService.Application/ReferenceData/Queries/GetReferenceData/GetReferenceDataQuery.cs`
- `AuthService.Domain/Entities/ReferenceData.cs` (+ `ReferenceDataCategory`)
- `AuthService.Infrastructure/Persistence/Configurations/ReferenceDataConfiguration.cs`
- `Platform.WebApi/Endpoints/Auth/ReferenceDataEndpoints.cs`
- `database/migrations/039_reference_data.sql`

Deferred backlog items remain deferred per standing instruction.

**Review Date:** 2026-05-29
**Reviewer:** security-reviewer agent

---

### Focus Area 1 — Endpoint Gating

**Verdict: PASS**

Write commands carry `[RequiresPermission(Permissions.PlatformRefDataManage)]` at the record level, which resolves to `"platform.refdata.manage"`:

- `CreateReferenceDataCommand` line 22: `[RequiresPermission(Permissions.PlatformRefDataManage)]`
- `UpdateReferenceDataCommand` line 18: `[RequiresPermission(Permissions.PlatformRefDataManage)]`
- `DeleteReferenceDataCommand` line 20: `[RequiresPermission(Permissions.PlatformRefDataManage)]`

`PermissionBehavior` (open-generic, registered in `AuthService.Application/DependencyInjection.cs`) fires on every MediatR dispatch. A caller without `"platform.refdata.manage"` is rejected with `Error.Forbidden("Auth.InsufficientPermission", ...)` before the handler body runs.

**Seed grant scope:** Migration 039 (lines 137–146) inserts `"platform.refdata.manage"` into `auth.permission` and grants it via `role_permission` exclusively to `SUPER_ADMIN`. The resource is `"platform"`, which is excluded from the `ORG_ADMIN` seed in migration 036 (`p.resource IN ('org','accounting',...)`). No non-SUPER_ADMIN role receives this permission in any seed migration. A non-SUPER_ADMIN reaching POST/PUT/DELETE receives 403 from `PermissionBehavior`.

**GET is open to any authenticated user — acceptability assessment:** `GetReferenceDataQuery` carries no `[RequiresPermission]` attribute. The endpoint registers `.RequireAuthorization()` (JWT presence required), so anonymous requests are rejected. The data returned is: category, code, name, parentCode, isActive, sortOrder — entirely non-sensitive lookup values (language codes, gender options, Indian state names, country names, user-type labels). No user PII, no tenant data, no financial data, no internal IDs beyond the UUID primary key of the lookup row itself. The UUID exposes no information useful to an attacker (it cannot be used to enumerate users or orgs; reference data is global). Exposure of `isActive=false` entries via `activeOnly=false` reveals only that an admin has deactivated a lookup option — this is acceptable for the management screen. **The open-authenticated GET is acceptable.**

All four endpoints call `.RequireAuthorization()` at the route level as an additional defense-in-depth layer.

---

### Focus Area 2 — Input Validation

**Verdict: PASS**

**`Code` field — `^[A-Za-z0-9_-]+$` regex:**
`CreateReferenceDataCommandValidator` line 53: `Matches(@"^[A-Za-z0-9_-]+$")`. The regex is anchored (`^`/`$`), permits only alphanumeric characters, underscores, and hyphens, and is applied by FluentValidation's `Matches()` using `Regex.IsMatch` on the full string. No SQL metacharacters, HTML characters, or dot-notation that could interfere with permission-name comparisons can pass this filter. `MaximumLength(100)` bounds the field. The validator fires in the MediatR pipeline before the handler body.

`Code` is also immutable after creation — `ReferenceData.Code` has `private set` and `UpdateReferenceDataCommand` accepts no `Code` field. The immutability is correctly noted in the docstring as protecting referencing profile rows.

**`Category` — closed enum:**
The validator checks `ReferenceDataCategory.All.Contains(c?.Trim().ToUpperInvariant() ?? "")` against the static set `{LANGUAGE, USER_TYPE, GENDER, STATE, COUNTRY}`. Any value outside this set returns a 400 before reaching the handler. The handler normalises category to uppercase (`request.Category.Trim().ToUpperInvariant()`) independently of the validator, providing belt-and-suspenders against case-sensitivity issues. Category is also immutable after creation.

**`Name` field:**
`MaximumLength(300)` on create; `MaximumLength(300)` on update. No structural constraint beyond length — names are free-text labels ("Tamil Nadu", "Prefer not to say"). Stored as plain text; the domain entity's `Create` and `UpdateDetails` methods call `.Trim()` before assignment but apply no further transformation. `Name` is returned in the `ReferenceDataDto` and rendered in dropdown UI components as text content (not as HTML). Prior frontend review found no `dangerouslySetInnerHTML` usage in dropdown/select components. Stored-XSS risk through `Name` is low: only SUPER_ADMIN can write it, and the frontend renders it as text. Flagged as INFO only.

**`SortOrder`:** `int`, no validator constraint — zero is the default; any integer is accepted. No injection surface; integers cannot carry malicious content.

**`ParentCode`:** Used only for STATE entries, validated against an existing active COUNTRY code in the DB before write. No regex constraint on `ParentCode` itself — the DB lookup acts as the implicit whitelist (only valid country codes that match an active COUNTRY entry are accepted). This is correct: country codes are machine-readable values matching an existing `Code` column that itself was created through the `^[A-Za-z0-9_-]+$`-validated create flow.

---

### Focus Area 3 — In-Use Delete Guard Correctness

**Verdict: PASS with one observation (LOW)**

`DeleteReferenceDataCommandHandler` calls `CountUsagesAsync` before soft-deleting:

```csharp
return entry.Category switch
{
    "COUNTRY"   => CountAsync(p => p.Country    == entry.Code, UserProfiles),
    "STATE"     => CountAsync(p => p.State      == entry.Code, UserProfiles),
    "GENDER"    => CountAsync(p => p.Gender     == entry.Code, UserProfiles),
    "USER_TYPE" => CountAsync(p => p.UserType   == entry.Code, UserProfiles),
    "LANGUAGE"  => CountAsync(u => u.PreferredLanguage == entry.Code, Users),
    _           => 0,
};
```

All five categories map to the correct referencing column:

| Category | Referencing table.column | Guard targets |
|----------|--------------------------|---------------|
| COUNTRY | `auth.user_profile.country` | Correct |
| STATE | `auth.user_profile.state` | Correct |
| GENDER | `auth.user_profile.gender` | Correct |
| USER_TYPE | `auth.user_profile.user_type` | Correct |
| LANGUAGE | `auth.user.preferred_language` | Correct |

All count queries filter `p.DeletedAt == null` (UserProfiles) and `u.DeletedAt == null` (Users), so soft-deleted user rows do not inflate the count and prevent deletion of reference data no longer referenced by live users.

The `_ => 0` default branch for an unrecognised category would allow deletion without an in-use check. In practice this branch is unreachable today because the category enum is closed (`ReferenceDataCategory.All` has five entries and `CreateReferenceDataCommand` enforces this). However if a future migration adds a new category constant without updating `CountUsagesAsync`, the default silently permits deletion of in-use entries. This is the LOW finding below.

---

### Focus Area 4 — Tenant Sensitivity of Open GET

**Verdict: PASS — no tenant-sensitive data**

`auth.reference_data` has no RLS (migration 039 line 46: "No RLS: global reference data, readable by all authenticated users"). This is the correct design. The table contains no columns that are tenant-scoped: there is no `organization_id`, `user_id`, or any FK to a user or org. Every row is a platform-global lookup value. All authenticated users reading the same category/code receive identical data regardless of their org context.

The `GetReferenceDataQuery` projects only `{Id, Category, Code, Name, ParentCode, IsActive, SortOrder}`. None of these fields contain user PII, financial data, org-specific configuration, or internal secrets.

The `activeOnly=false` path (management screen) reveals soft-deactivated entries — e.g., a deactivated gender option or a language the platform no longer supports. This is operationally sensitive (an admin may prefer not to expose deprecated options to end users) but is not a security concern: the data itself is not sensitive, and the `activeOnly` parameter requires an authenticated session to access at all.

---

### Findings

#### [LOW] I1.4A-001: DeleteReferenceDataCommand Default Branch Returns 0 — Future Category Additions Not Automatically Protected by In-Use Guard

- **File:** `AuthService.Application/ReferenceData/Commands/DeleteReferenceData/DeleteReferenceDataCommand.cs`, lines 58–76
- **Description:** `CountUsagesAsync` uses a `switch` expression with a `_ => 0` default. If a future migration adds a new `ReferenceDataCategory` constant (e.g., `BUSINESS_TYPE`) and the corresponding `user_profile` or other referencing column is not added to this switch, `CountUsagesAsync` returns 0 for that category, and `DeleteReferenceDataCommand` soft-deletes the entry without verifying it is not in use. The referencing rows would then carry a dangling code value with no active reference-data entry. Currently unreachable because the closed enum validator prevents creation of out-of-set categories. The risk is a future developer omission.
- **Recommended Fix:** Replace the `_ => 0` default with a guard that returns a non-zero sentinel or throws an `InvalidOperationException`:
  ```csharp
  _ => throw new InvalidOperationException(
      $"CountUsagesAsync: no usage check defined for category '{entry.Category}'. " +
      "Add a case before allowing deletion.")
  ```
  This ensures that adding a new category without updating the guard produces a loud failure at test time rather than a silent data-integrity gap in production.
- **Reference:** CWE-1068 (Inconsistency in Implementation)

---

#### [INFO] I1.4A-INFO-001: Name Field on Reference Data Has No Character Restriction — SUPER_ADMIN Could Store HTML Markup in a Dropdown Label

- **File:** `AuthService.Application/ReferenceData/Commands/CreateReferenceData/CreateReferenceDataCommand.cs`, lines 56–59; `UpdateReferenceData/UpdateReferenceDataCommand.cs`, lines 32–36
- **Description:** `Name` is validated only for `NotEmpty()` and `MaximumLength(300)`. A SUPER_ADMIN could store a name containing HTML markup (e.g., `<script>alert(1)</script>`). The data is returned verbatim in the GET response and consumed by dropdown components across the app. Risk is low because: (1) only SUPER_ADMIN can write this field; (2) based on prior frontend review, dropdown components render values as text nodes, not HTML; (3) React's JSX escaping prevents XSS via standard rendering. Risk would materialise only if a frontend component renders the name via `dangerouslySetInnerHTML`, which was not observed. Noted for completeness.
- **Recommended Fix:** Confirm in a frontend review that all reference-data name renderings use standard React text interpolation. If any `dangerouslySetInnerHTML` usage is found for reference-data names, add server-side sanitisation (strip HTML tags via a library such as HtmlSanitizer before storage).

---

### Verification Checklist

| Control | Expected | Observed | Result |
|---------|----------|----------|--------|
| `platform.refdata.manage` required for POST/PUT/DELETE | `[RequiresPermission]` on command class; PermissionBehavior fires | All three write commands decorated; pipeline confirmed | PASS |
| Non-SUPER_ADMIN receives 403 | PermissionBehavior rejects before handler body | Confirmed — only SUPER_ADMIN has `platform.refdata.manage` in seed | PASS |
| GET requires authentication only | No `[RequiresPermission]` on query; `.RequireAuthorization()` on route | Confirmed | PASS |
| GET data is not tenant-sensitive | No org/user FKs; no PII | All fields are global lookup values | PASS |
| `code` regex `^[A-Za-z0-9_-]+$` | Anchored, no injection chars | Confirmed via FluentValidation `Matches()` | PASS |
| `category` closed enum | Must be in `ReferenceDataCategory.All` | Validator + handler normalisation confirmed | PASS |
| `code` immutable after creation | `private set`; UpdateCommand has no Code field | Confirmed at domain entity level | PASS |
| `category` immutable after creation | Same | Confirmed | PASS |
| STATE requires valid active COUNTRY parent | DB existence check before write | Confirmed in Create (line 93) and Update (line 57) | PASS |
| In-use guard before delete | CountUsagesAsync covers all five categories | Correct column mapping confirmed; default branch is LOW finding | PASS (with note) |
| Soft-deleted users excluded from in-use count | `p.DeletedAt == null` / `u.DeletedAt == null` | Confirmed in all count queries | PASS |
| No RLS needed | Global lookup, no tenant scope | Correct — no org/user FKs; migration comment confirms intent | PASS |
| `name` rendered as text (not HTML) | Standard React text node | Frontend renders as text; no `dangerouslySetInnerHTML` observed (INFO only) | PASS |

---

### Increment 1.4 Phase A Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 0 | — |
| LOW | 1 | I1.4A-001 |
| INFO | 1 | I1.4A-INFO-001 |

**GATE VERDICT: GO**

All four focus areas pass. The write-endpoint gating is correctly implemented — `platform.refdata.manage` is carried on all three write commands and enforced by `PermissionBehavior` before any handler body runs. The permission is seeded exclusively to `SUPER_ADMIN` in migration 039 with no grants to any other role. The open-authenticated GET exposes only non-sensitive global lookup data with no tenant scope. Input validation is tight: `code` is regex-constrained and immutable, `category` is a closed enum, `name` is length-bounded and rendered as text. The in-use delete guard correctly covers all five current category-to-column mappings with soft-delete awareness.

I1.4A-001 (LOW) is the only substantive finding: the `_ => 0` default in `CountUsagesAsync` would silently allow deletion of a future category without an in-use check. The recommended fix is to replace the default with an `InvalidOperationException` so that category additions that omit the guard produce a loud failure at test time. This does not block the current increment.

*Increment 1.4 Phase A review completed: 2026-05-29*

---

## Wave 6 — GAP-106 PCI Scope + GAP-025 VAPT Plan Security Review

**Scope:** Razorpay integration (SubscriptionService backend + mobile BillingScreen + admin PaymentGatewaySettings); PCI-DSS SAQ A boundary verification; VAPT plan authoring (all 12 services, admin, mobile, AI surface). Code-verified against branch `2026-06-10-s5t4`.
**Review Date:** 2026-06-11
**Reviewer:** security-reviewer agent
**Deliverables:** `docs/security/pci-scope.md`, `docs/security/vapt-plan.md`

---

### Findings

#### [LOW] GAP-PCI-01: `IRazorpayClient.VerifyWebhookSignature` Uses Non-Constant-Time Comparison — Dead Code With Dangerous Implementation

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Subscription/Razorpay/RazorpayHttpClient.cs`
- **Line:** 154–160
- **Description:** The `VerifyWebhookSignature` method on the production `RazorpayHttpClient` compares HMAC-SHA256 signatures using `string.Equals(computed64, signature, StringComparison.OrdinalIgnoreCase)`. This is a non-constant-time comparison that is susceptible to timing attacks. However, this method is **not called from any production code path** — the webhook endpoint (`RazorpayWebhook.cs`) implements its own private static `VerifyHmac()` method that correctly uses `CryptographicOperations.FixedTimeEquals`. The `VerifyWebhookSignature` method exists on the `IRazorpayClient` interface (confirmed at `SubscriptionService.Application/Common/Interfaces/IRazorpayClient.cs:50`) and is implemented in both `RazorpayHttpClient` and `MockRazorpayClient`, but no code in the `Application` or `Api` layer calls it. The risk is that a future refactor that routes webhook verification through `IRazorpayClient` would silently introduce a timing vulnerability.
- **Recommended Fix:** Remove `VerifyWebhookSignature` from the `IRazorpayClient` interface and from both implementations. Webhook signature verification is a transport-layer concern that belongs exclusively in `RazorpayWebhook.cs`. This avoids having two divergent implementations of the same security-critical operation.
- **Reference:** CWE-208 (Observable Timing Discrepancy); OWASP Cryptographic Failures

---

#### [LOW] GAP-PCI-02: No Startup Guard Preventing MockRazorpayClient in Production

- **File:** `backend/Services/PlatformService/Platform.Infrastructure/Subscription/DependencyInjection.cs`
- **Line:** 64
- **Description:** `MockRazorpayClient` is registered unconditionally as the `IRazorpayClient` implementation: `services.AddScoped<IRazorpayClient, MockRazorpayClient>()`. The real `RazorpayHttpClient` is only registered when an admin calls `PATCH /subscriptions/config/razorpay` (via `UpdateRazorpayConfigCommand`). There is no startup-time validation that fails or warns if the service is deployed to a non-Development environment without a live `RazorpayConfig` row. The `AesCredentialEncryptionService` correctly throws `InvalidOperationException` on startup if `ENCRYPTION_KEY` is absent — the same defensive pattern should apply here. With the mock active, all subscription create/renew operations return `mock_order_*` / `mock_sub_*` IDs without charging users, silently appearing successful.
- **Recommended Fix:** On startup in non-Development environments, perform a database check (or at minimum a config-layer check) for a `RazorpayConfig` row with `IsEnabled = true` and `TestMode = false`. If absent, log a `LogWarning` with a clear message. For hard enforcement, add a `IHostedService` startup check that writes a health-check failure. Also consider throwing in `MockRazorpayClient.CreateOrderAsync` when `ASPNETCORE_ENVIRONMENT != Development` to provide a loud failure mode.
- **Reference:** CWE-654 (Reliance on a Single Factor in a Security Decision); OWASP Security Misconfiguration

---

#### [INFO] GAP-PCI-03: Admin PaymentGatewaySettings Save Button Not Wired to API

- **File:** `src/admin/src/pages/settings/sections/PaymentGatewaySettings.tsx`
- **Line:** 247
- **Description:** The "Save Payment Settings" button calls `toast.success('Payment settings saved (local only — API endpoint pending)')` and does not make an API call to `PATCH /subscriptions/config/razorpay`. The backend endpoint is fully implemented, secured (`subscription.config.write` permission via `[RequiresPermission]`), and validated. The frontend-only stub means an operator cannot configure live Razorpay credentials through the admin panel and must use a direct API call. The file header comment acknowledges this: "TODO: Wire to API when SubscriptionService exposes PATCH /subscriptions/config/razorpay". Note: the endpoint does exist (it was wired in Wave 2 as part of GAP-034).
- **Risk:** Operational rather than security — the backend endpoint is protected. However, an operator believing the UI is functional might assume credentials are saved when they are not.
- **Note:** Already tracked as a frontend-dev task in Wave 6 triage (Batch F). Recording here for PCI completeness as this is the credential management interface.

---

#### [INFO] GAP-PCI-04: Razorpay TPSP Annual Certification Review Not Documented

- **File:** No file — gap in compliance documentation.
- **Description:** PCI-DSS v4.0 Requirement 12.8.4 requires organizations to monitor the PCI-DSS compliance status of third-party service providers at least once every 12 months. Razorpay holds PCI-DSS Level 1 certification, but no formal TPSP register or annual review record exists in `docs/`. Before the first production billing transaction, a compliance record must be established.
- **Recommended Fix:** Create `docs/compliance/tpsp-register.md` listing Razorpay (and other relevant third-party processors) with their current AOC (Attestation of Compliance) reference, certification expiry date, and last-reviewed date. Schedule annual review. Devops/compliance owner required.

---

#### [INFO] GAP-PCI-05: `VerifyHmac` Compares UTF-8 Hex String Bytes Rather Than Decoded Binary Bytes

- **File:** `backend/Services/PlatformService/Platform.WebApi/Endpoints/Subscription/RazorpayWebhook.cs`
- **Line:** 116–140
- **Description:** This was previously documented as NEW-001 (MEDIUM) in Phase 5. Recording here for traceability. The production webhook `VerifyHmac` static method converts both the computed hash and the received signature to their UTF-8 byte representations as hex strings, then compares using `CryptographicOperations.FixedTimeEquals`. Both sides are lowercased before comparison. The comparison is functionally correct and timing-safe when both sides are valid lowercase hex strings of equal length. The method's `try/catch` at line 137 handles malformed (non-hex) signatures by returning `false`. The remaining theoretical risk (length-mismatch early exit before constant-time comparison) is present but the 503 path (missing secret) exits before the comparison in the likely misconfiguration scenario. Status: DEFERRED (recorded in Phase 5 as medium-priority fix before production).
- **Recommended Fix:** Decode both hex strings to `byte[]` before comparison: `CryptographicOperations.FixedTimeEquals(Convert.FromHexString(computedHex), Convert.FromHexString(signature.ToLowerInvariant()))`. Wrap in try/catch for `FormatException`.

---

### Verification Evidence — Razorpay PCI Scope (GAP-106)

The following evidence was gathered from the codebase to establish the SAQ A boundary:

| Claim | Evidence | File/Line |
|---|---|---|
| No card-entry form in mobile app | No `react-native-razorpay` in `mobile/package.json`; `BillingScreen.tsx` shows plan/invoices only | `mobile/src/screens/profile/BillingScreen.tsx` |
| No card-entry form in admin frontend | No Razorpay JS SDK in `src/admin/package.json`; `PaymentGatewaySettings.tsx` collects only API keys | `src/admin/src/pages/settings/sections/PaymentGatewaySettings.tsx` |
| Card PAN (payment) never stored | All "PAN" references in codebase are Indian tax PAN (format XXXXX9999X); grep for `card.*number|cvv|credit.*card` in backend source produces zero application-code results | Grep verified 2026-06-11 |
| Webhook uses HTTPS and HMAC-SHA256 | `RazorpayHttpClient` uses `https://api.razorpay.com/v1/`; `RazorpayWebhook.cs` implements HMAC-SHA256 with FixedTimeEquals | `RazorpayHttpClient.cs:61`, `RazorpayWebhook.cs:116-140` |
| API key secret encrypted at rest | `AesCredentialEncryptionService` uses AES-256-GCM; `RazorpayConfig.EncryptedKeySecret` stores only ciphertext | `AesCredentialEncryptionService.cs:37-53`, `RazorpayConfig.cs:21` |
| `subscription.config.write` gates credential write | `[RequiresPermission("subscription.config.write")]` on `UpdateRazorpayConfigCommand` | `UpdateRazorpayConfigCommand.cs:18` |
| Webhook endpoint is not behind Firebase Auth | `.AllowAnonymous()` explicitly set; `VerifyHmac` replaces JWT auth | `RazorpayWebhook.cs:34` |
| Idempotency deduplication in place | `IDistributedCache` keyed on `X-Razorpay-Event-Id`, TTL 24h | `RazorpayWebhook.cs:77-93` |

---

### Wave 6 Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 0 | — |
| LOW | 2 | GAP-PCI-01, GAP-PCI-02 |
| INFO | 3 | GAP-PCI-03, GAP-PCI-04, GAP-PCI-05 |

**GATE VERDICT: GO**

SnapAccount correctly implements the SAQ A boundary for PCI-DSS. Card data never enters, transits, or is stored within SnapAccount systems. The Razorpay integration is server-to-server (API keys + webhook only); no card-capture SDK is embedded. The two LOW findings (GAP-PCI-01 dead code with non-constant-time comparison; GAP-PCI-02 no startup guard for mock client) are pre-production hygiene items that do not affect the current SAQ A eligibility claim but must be resolved before go-live. The three INFO items are operational/compliance documentation gaps.

Deliverables written:
- `docs/security/pci-scope.md` — PCI-DSS SAQ A scope statement, boundary verification, guardrails, and conditions.
- `docs/security/vapt-plan.md` — VAPT methodology, 12-target prioritized test list, ASVS/MASVS mapping, prerequisites, escalation rules, and remediation SLAs.

*Wave 6 review completed: 2026-06-11*
