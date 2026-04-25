---
name: Phase 6 Security Patterns and Architecture Decisions
description: Recurring vulnerabilities found in Phase 6A+6E; architecture decisions made; controls to verify in future phases
type: project
---

## Key Phase 6 Findings

**PermissionBehavior registration gap (recurring):** AccountingService, NotificationService, and CallbackService all failed to register `PermissionBehavior` in their DI. The shared `DependencyInjection.cs` comment (line 53) explicitly flags this as a per-service responsibility. Future new services must be checked for this immediately. GstService correctly uses `[RequiresPermission]` — it was a known pattern, just not carried forward.

**Why:** The shared `AddApplicationServices()` method intentionally excludes PermissionBehavior because it is per-service. Backend-agent missed wiring it in all three Phase 6 services.

**How to apply:** On every new service review, verify: (1) `cfg.AddOpenBehavior(typeof(PermissionBehavior<,>))` is in DI, and (2) privileged commands have `[RequiresPermission("x.y.z")]`.

---

## IDOR Pattern in CallbackService

GetCallbackById and all state-transition endpoints (Assign, Confirm, Complete, Escalate, Cancel, Reschedule, AddNote) fetch by UUID only. No `ICurrentUser` injected, no org_id/user_id check. This is the canonical IDOR pattern — watch for it in any new service that has resource-by-ID endpoints.

**Why:** Org-scoping was applied to the list endpoint (ListCallbacks passes `currentUser.OrganizationId`) but not to the detail/mutation endpoints.

---

## DPDP Erasure Cascade Status

As of Phase 6:
- AuthService: publishes `account-deletion-events` to Pub/Sub (SEC-007, FIXED)
- Downstream services with erasure handlers: NOT CONFIRMED for callback.* and notification.*
- DB columns for anonymization exist in migration 018 (`anonymized_at`, `anonymization_reason`)
- File SEC-027 against backend-agent to implement subscribers in CallbackService and NotificationService

---

## MV RLS Decision (P6-HANDOFF-04)

Accepted API-layer org_id filter for `callback.kpi_daily_snapshot`. SECURITY INVOKER wrapper rejected. Documented in `docs/security/phase-6-mv-rls-decision.md`. Conditions: KPI query must add WHERE org_id = @orgId; integration test required.

---

## snapaccount_admin BYPASSRLS Role

As of Phase 6, this role is NOT defined in any migration or init script. Referenced only in `database/shared/cloud-scheduler-partition-job.md`. Filed as SEC-035 (LOW) against db-engineer. When reviewing future phases, verify this role has been created before accepting DLQ operator tooling as compliant.

---

## Notification Catalog PII Review

All 26 events in `NotificationEventCatalog.cs` reviewed — no PII embedded in event names. The `Variables` dict is caller-controlled; callers must not pass financial amounts, PAN, GSTIN, Aadhaar into Variables. Enforce this in code review.

---

## RecurringJobsSubscriber Idempotency Gap

In-process HashSet dedupe for Pub/Sub messages resets on restart. Redis-based or DB-based dedupe required. Filed as SEC-031 (MEDIUM). Pattern to watch: any BackgroundService using in-memory state for idempotency is fragile on Cloud Run.

---

## Go/No-Go: Phase 6 = CONDITIONAL NO-GO → UPDATED TO GO (re-audit 2026-04-25)

**Original:** 4 HIGH findings (SEC-026, SEC-027, SEC-028, SEC-029) blocked staging.

**After hotfix re-audit:** All 4 HIGH findings CONFIRMED-FIXED by source-code inspection.
- SEC-026: PermissionBehavior registered in all 3 services; behavior fails closed.
- SEC-027: AccountDeletionSubscriber BackgroundService added to CallbackService + NotificationService; Callback.UserId is Guid?; Anonymize() domain method correct.
- SEC-028: [RequiresPermission("notification.dlq.manage")] on GetDlqQuery + RetryDlqItemCommand; enforced by SEC-026 pipeline.
- SEC-029: GetCallbackByIdQueryHandler uses inline EF predicate with org_id filter (not fetch-then-check). Mutation handlers use post-fetch check returning NotFound to avoid existence leak.

**Current status: GO for staging.** 5 MEDIUM + 3 LOW remain open (deferred).

**Production blockers remaining:** SEC-034 (UUID validation on deep-link id, mobile-dev), SEC-033 (useSensitiveScreen on callback screens, mobile-dev), SEC-030 (callback audit trail, backend-agent), INFO-001 (placeholder cert hashes, DevOps).

---

## orgId == null Bypass in Callback IDOR Fix

The SEC-029 fix uses `orgId == null || c.OrganizationId == orgId` as the EF predicate. A caller with null OrganizationId (e.g., SYSTEM_ADMIN) can read any org's callbacks. This is intentional for operator roles and is acceptable because these roles must hold the `callback.assign` / `callback.complete` permissions (SEC-026). Do not re-flag this as an IDOR unless the permission system is later weakened.

---

## SEC-034 Deep-Link UUID Validation: STILL OPEN

notificationRouter.ts line 44–56: `id` from FCM payload passed directly to navigation with `as any` cast, no UUID regex validation. qa-mobile P6-QA-MOBILE-01 independently confirmed and wrote a unit test documenting the unfixed behavior. Mobile-dev must add `UUID_RE.test(id)` guard and remove the `as any` cast. The existing test asserts current (broken) behavior — it must be inverted when fixed.

---

## Phase 6B + 6D Findings (2026-04-25) — GO/NO-GO: NO-GO

**3 HIGH blockers found. Phase 6B+6D must not proceed to staging until fixed.**

### IDOR pattern re-appeared in Phase 6B/6D new handlers (SEC-038, SEC-039)

The SEC-029 fix applied org-scoping to CallbackService. The exact same IDOR pattern was NOT applied to Phase 6B GstService notice handlers or Phase 6D ItrService filing handlers. Every future phase review must verify that all new resource-by-ID handlers inject ICurrentUser and add an org/user ownership filter.

**GstService notices:** GetNotice, RespondToNotice, AssignNoticeToCa — all query by NoticeId only. No OrganizationId filter.

**ItrService filings:** All 10 filing handlers (GetFiling, ComputeTax, SubmitForCaReview, CaApprove, CaReject, MarkFiled, MarkEVerified, UploadForm16, RespondToNotice, ListFilings) have no ICurrentUser injection. ListFilings scopes by caller-supplied AssesseeId query param — any user can list any other assessee's filings.

**Pattern to enforce:** Checklist item "resource handlers inject ICurrentUser and filter by org/user ownership" must be the first thing verified on every new service review.

### DPDP Erasure Cascade: GstService + ItrService still missing (SEC-040)

SEC-027 fixed CallbackService + NotificationService. GstService and ItrService were added in Phase 6B/6D without AccountDeletionSubscribers. Both hold significant PII: PAN ciphertext, salary data, notice bodies. P6-HANDOFF-16 and P6-HANDOFF-21 explicitly required this; backend-agent did not implement it.

**Pattern to enforce:** Every new service that stores user PII must have an AccountDeletionSubscriber wired in DependencyInjection.cs before the service can go to staging. This is now a gate condition, not a deferred item.

### Client-side PAN cipher trust (SEC-041)

ItrService UploadForm16Command accepts EmployeePanCipher from the request body and stores it verbatim without calling IPanEncryptionService. PAN encryption must always be server-side. Accepted cipher from client = no integrity guarantee. Watch for this pattern in any command that takes a *Cipher field.

### Admin localStorage draft storage (SEC-042)

NoticeDetailPage stores GST notice response draft in localStorage. For any page handling legally sensitive documents (notices, filings), draft state should use sessionStorage or server-side persistence only.

### Rate-limit policy for external API-triggering endpoints (SEC-043)

POST /gst/e-invoices and POST /gst/notices should have a tighter rate-limit policy than the general "standard" window because they trigger external IRP/GSTN API calls. Use a dedicated named policy (e.g., "gst-write") for write endpoints that hit government APIs.

### Go/No-Go: Phase 6B+6D = NO-GO → UPDATED TO GO (re-audit 2026-04-25)

**Original:** 3 HIGH + 1 LOW blockers (SEC-038, SEC-039, SEC-040, SEC-043).

**After backend hotfix re-audit (2026-04-25):** All 4 confirmed FIXED by source-code inspection. 240/240 tests pass.

- SEC-038: ICurrentUser injected in all 3 notice handlers; GetNotice uses inline EF org-scope filter; RespondToNotice + AssignNoticeToCa use post-fetch org check; Error.NotFound on mismatch; 7 unit tests verified.
- SEC-039: ICurrentUser injected in all filing handlers; assessee ownership check pattern consistent; ListFilings returns empty list for cross-org (not error); 9 unit tests verified.
- SEC-040: AccountDeletionSubscriber BackgroundService added to GstService.Infrastructure + ItrService.Infrastructure; full cascade per P6-HANDOFF-16 + P6-HANDOFF-21; AddHostedService<> registration confirmed in both DI files; 10 erasure tests verified.
- SEC-043: "gst-write-strict" policy (30 req/min) registered in GstService Program.cs; applied to POST /gst/notices and POST /gst/e-invoices only.

**Deferred to Phase 6F:** SEC-041 (client-supplied PAN cipher, TODO comment confirmed), SEC-042 (admin localStorage draft, unfixed), SEC-034 (UUID deep-link validation, not regressed).

**Current status: GO for staging.**

**Production blockers remaining (cumulative):** SEC-041 (Med, ItrService), SEC-042 (Med, admin), SEC-034 (Med, mobile), SEC-033 (Med, mobile), SEC-030 (Med, backend), INFO-001 (placeholder cert hashes, DevOps).

---

## Phase 6C Findings (2026-04-25) — GO/NO-GO: NO-GO

**1 HIGH blocker (SEC-044). Phase 6C blocked until fixed.**

### Webhook HMAC null-bypass pattern (SEC-044)

DisbursementWebhookHandler wraps HMAC verification in `if (!string.IsNullOrEmpty(bank.WebhookSecretRef))`. A bank with null WebhookSecretRef bypasses signature verification entirely on an unauthenticated endpoint. Pattern to enforce on every webhook endpoint: fail-closed when secret is missing, never skip silently.

### Confirmed controls in LoanService — carried from day 1

- PermissionBehavior registered; [RequiresPermission] on all 11 write commands.
- All sampled handlers apply OrgId inline predicate or post-fetch org check returning Error.NotFound.
- AccountDeletionSubscriber wired with AddHostedService; anonymize-only (no hard-delete attempt).
- AES-GCM (not CBC) in CredentialEncryptionService; nonce 12 bytes / tag 16 bytes.
- DB BEFORE DELETE triggers on consents (migration 027) and status_log (migration 028) confirmed.
- 32-byte signature_hash CHECK constraint confirmed (migration 027 line 141).

### Mobile biometric pattern (SEC-048)

LoanConsentScreen and LoanPackagePreviewScreen use Alert.alert() as biometric gate. expo-local-authentication still not installed (P6-HANDOFF-24). This is now the THIRD phase where this deferred item appears. Must be hard-gated in Phase 6F.

### Notification PII in push bodies (SEC-047)

LoanEventsSubscriber passes `disbursedAmount` in variables dict for LOAN_DISBURSED (Push+SMS+Email channel). If FCM template uses the variable, amount appears on device lock screen. Pattern: never pass financial amounts in variables dict for events that include Push channel.

### Signed URL TTL carry-forward (SEC-046)

Both LoanService GetPackageDownloadUrl and ReportService GetDownloadUrl use 1-hour TTL (P6-HANDOFF-20 requires ≤ 15 min). Second phase with this deficiency. Must be fixed in all signed URL handlers for PII documents.

### Go/No-Go: Phase 6C = NO-GO → UPDATED TO GO (re-audit 2026-04-25)

**Original:** 1 HIGH blocker (SEC-044) + 5 MEDIUM non-blocking.

**After backend hotfix re-audit (2026-04-25):** SEC-044, SEC-046, SEC-047, SEC-049 all CONFIRMED-FIXED by source-code inspection. 313/313 tests pass.

- SEC-044: `IsNullOrWhiteSpace` hard-reject guard at line 61 of DisbursementWebhookHandler; no fallthrough path; CreatePartnerBankCommand validator requires WebhookSecretRef for REST/OAuth; 7 targeted unit tests verified (null/empty/whitespace/unknown-bank/valid-HMAC/invalid-HMAC/TTL-constant).
- SEC-046: Both GetPackageDownloadUrlQuery.cs and GetDownloadUrlQuery.cs use `TimeSpan.FromMinutes(15)`. DPDP rationale comments present.
- SEC-047: LoanEventsSubscriber variables dict excludes disbursedAmount. DPDP data-minimisation comment at lines 123-127. P6-HANDOFF-35 tracks multi-channel amount for Phase 7.
- SEC-049: `LoanPackageWatermark(orgName, generatedAt, packageId)` method returns canonical 5-field format. Threaded through all 6 document pages (cover + 5 content sections).

**Deferred to Phase 6F (accepted non-blocking):** SEC-045 (admin token masking), SEC-048 (mobile biometric), SEC-050 (consent_text_version dynamic).

**Current status: GO for staging.**

**Production blockers remaining (cumulative — Phase 6F must address):** SEC-041 (Med, ItrService client PAN cipher), SEC-042 (Med, admin localStorage draft), SEC-034 (Med, mobile UUID deep-link), SEC-033 (Med, mobile useSensitiveScreen), SEC-030 (Med, callback audit trail), SEC-045 (Med, admin OAuth token display), SEC-048 (Med, mobile biometric), SEC-050 (Med, consent_text_version dynamic), INFO-001 (placeholder cert hashes).
