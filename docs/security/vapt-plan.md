# SnapAccount VAPT Plan

> **Classification:** INTERNAL — Restricted  
> **Author:** security-reviewer agent  
> **Date:** 2026-06-11  
> **Branch:** 2026-06-10-s5t4  
> **Regulatory basis:** RBI IT Framework for NBFCs (6-monthly penetration testing); CERT-In Information Security Practices; DPDP Act 2023 §8 (reasonable security safeguards); PCI-DSS v4.0 Requirement 11.3  
> **Review cadence:** Every 6 months, or after any major feature release (new service, new auth flow, new external API integration)

---

## 1. Scope

### 1.1 In-Scope Systems

| System | Description | Hosts / Endpoints |
|---|---|---|
| **12 Backend Microservices** | .NET 10 Minimal API, Cloud Run | Auth, Document, Accounting, GST, Loan, ITR, Chat, Notification, Report, Subscription, AI, Callback |
| **Admin Frontend** | React 19 SPA, Cloud Run + nginx | `https://admin.snapaccount.in` |
| **Mobile App — Android** | Expo SDK 52 / React Native | Production APK (Play Store build) |
| **Mobile App — iOS** | Expo SDK 52 / React Native | Production IPA (App Store build) |
| **AI Surface (AiService)** | Semantic Kernel + Gemini / Vertex AI, RAG pipeline, OCR | `https://ai.snapaccount.in` (internal) |
| **Database** | PostgreSQL 17 + pgvector, 12 schemas | `snapaccount` GCP Cloud SQL |
| **Authentication Infrastructure** | Firebase Auth (phone OTP, Google/Apple sign-in), custom session-JWT | `https://auth.snapaccount.in` |
| **Webhook Endpoints** | Razorpay webhook, Pub/Sub push receivers | `/subscriptions/webhooks/razorpay`, `/callback/webhooks/*` |
| **Hangfire Dashboard** | Background job monitoring | `/hangfire` on AuthService (admin-only) |
| **SignalR Hub** | Real-time chat and notifications | `/chat/hub`, `/notification/hub` |

### 1.2 Out-of-Scope Systems

- GCP infrastructure (Cloud Armor, Load Balancer, VPC) — Google's responsibility; covered by GCP compliance attestations.
- Razorpay payment processing environment — covered by Razorpay's PCI-DSS Level 1 certification.
- Firebase Auth authentication infrastructure — covered by Google's SOC2/ISO27001.
- Third-party SaaS tools (SendGrid, MSG91, Sarvam AI) — assessed separately via TPSP process.

### 1.3 Testing Environment

- **Primary:** Staging environment (`https://staging.snapaccount.in` and staging service URLs), provisioned with non-production data.
- **Prohibited:** Production environment must NOT be targeted. Any accidental production access must be immediately reported to the team lead.
- **Data:** Staging database seeded with synthetic Indian PII (fake PAN, Aadhaar, bank details). No real user data in staging.

---

## 2. Prerequisites

### 2.1 Environment Readiness

- [ ] Staging Cloud Run services deployed and healthy (all 12 services pass `/health` checks).
- [ ] Staging Firebase project configured with separate OTP sender and test phone numbers.
- [ ] Staging Razorpay test-mode credentials configured (PATCH `/subscriptions/config/razorpay` with `TestMode: true`).
- [ ] Staging database populated with representative synthetic data across all 12 schemas.
- [ ] WAF/Cloud Armor in staging set to allow-list pentest IPs (to prevent blocking during active testing).
- [ ] Rate limiting temporarily relaxed on staging for auth endpoints (to allow brute-force simulation without lockout hindrance), OR test accounts provisioned with bypass tokens.
- [ ] `DEV_AUTH_BYPASS=false` confirmed on all staging services.

### 2.2 Test Account Provisioning

The following account types must be provisioned before testing begins:

| Account Type | Purpose |
|---|---|
| Standard user (phone OTP) | Test auth flows, KYC, mobile app |
| Org owner | Test RBAC, subscription, org management |
| Org member (no permissions) | Test privilege escalation / IDOR |
| Org member (partial permissions) | Test RBAC boundary enforcement |
| Platform admin (SYSTEM_ADMIN role) | Test admin panel, Hangfire, platform-level endpoints |
| Second org (different org_id) | Test tenant isolation / cross-org IDOR |

### 2.3 Legal and Authorization

- [ ] Written authorization from team lead (or designated authority) confirming scope, dates, and test environment.
- [ ] Statement of Work (SoW) or engagement letter signed with external VAPT vendor (if external).
- [ ] Incident response team notified of test dates (to distinguish pentest traffic from real attacks in monitoring).
- [ ] CERT-In notification requirement reviewed — confirm whether the simulated-attack phase triggers mandatory reporting obligations.

### 2.4 Tooling

| Tool | Purpose |
|---|---|
| Burp Suite Professional | API interception, active scanning, manual testing |
| OWASP ZAP | Complementary automated scanning |
| MobSF (Mobile Security Framework) | Static analysis of Android APK / iOS IPA |
| Frida + objection | Mobile runtime instrumentation (SSL pinning bypass, memory inspection) |
| sqlmap (controlled) | SQL injection validation (verify EF Core parameterization holds) |
| jwt-cracker / jwt_tool | JWT weaknesses, algorithm confusion |
| trivy | Container image vulnerability scanning |
| npm audit / dotnet list package --vulnerable | Dependency CVE scanning |
| Custom scripts | Indian PAN/Aadhaar format fuzzing, GSTIN validation bypass |

---

## 3. Methodology

The assessment follows **OWASP Testing Guide v4.2** for web/API, **OWASP MASVS v2.0** for mobile, and **OWASP ASVS v4.0 Level 2** as the baseline verification standard.

### 3.1 Phases

**Phase 1 — Reconnaissance (1–2 days)**  
- API surface enumeration: all 12 service endpoint groups, OpenAPI schemas.  
- Mobile app static analysis: MobSF on APK/IPA; check for hardcoded secrets, insecure storage patterns, exported activities/URL schemes.  
- Dependency audit: `npm audit` (admin + mobile), `dotnet list package --vulnerable` (12 services).  
- Cloud configuration review (staging): Cloud Run service account permissions, public ingress settings, Cloud Armor rules, GCS bucket ACLs.

**Phase 2 — Vulnerability Identification (3–5 days)**  
Active testing across all target categories (see §4).

**Phase 3 — Exploitation and Validation (2–3 days)**  
Prove exploitability of identified findings; assess actual impact, data exposure, and blast radius.

**Phase 4 — Reporting (1–2 days)**  
CVSS v3.1 scored findings, evidence (screenshots, requests/responses), root cause, recommended remediation.

**Phase 5 — Remediation Verification (1 day, after fixes)**  
Re-test all CRITICAL and HIGH findings to confirm remediation. Issue a signed re-test attestation.

---

## 4. Prioritized Target List

The prioritized list below is informed by cumulative findings from the SnapAccount internal security reviews (Phases 4 through SEC-AI-02, documented in `docs/security/security-report.md`). Items with prior findings or architectural risk indicators are ranked highest.

---

### Priority 1 — CRITICAL (test first, escalate immediately)

#### T-01: Authentication Bypass and Token Security

**ASVS:** 2.1, 2.6, 2.7 | **OWASP:** WSTG-AUTHN-01 through 06

- **JWT algorithm confusion:** Test whether services accept `alg: none` or RS256-signed tokens in place of Firebase-issued tokens. Verify `FirebaseAuthMiddleware` rejects tampered tokens.
- **Firebase OTP brute force:** Confirm 5 req / 10 min sliding window rate limit on `/auth/otp` and `/auth/verify-otp` endpoints. Test by-IP and by-phone-number separately.
- **Session-JWT forgery:** SnapAccount issues custom session JWTs after Firebase verification. Test JWT signature, expiry enforcement, audience/issuer claims, and key rotation.
- **DEV_AUTH_BYPASS in staging:** Confirm `DEV_AUTH_BYPASS=false` on all staging services (must never be true in any non-local environment).
- **Device binding bypass:** `AddDevice` endpoint uses a serializable-isolation transaction to enforce max-2 devices. Test concurrent requests to exceed the limit.

**Prior history:** SEC-005 (CSPRNG for OTP — fixed), NEW-002 (Firebase revocation fatality — deferred HIGH).

---

#### T-02: Tenant Isolation and IDOR

**ASVS:** 4.2.1, 4.2.2 | **OWASP:** WSTG-ATHZ-04 | **CWE:** 639

- **Cross-org resource access:** Use org-member credentials from Org A to request resources (documents, invoices, GST returns, loan applications, ITR filings) belonging to Org B by guessing or enumerating UUIDs.
- **RLS verification:** Database RLS policies are configured on user-owned tables. Test whether bypassing the API layer (e.g., via a compromised service account or SQL injection) leaks cross-org rows.
- **AI Service org_id injection:** AiService previously allowed `org_id` to be supplied in the request body and used it for scoping without server-side override (SEC-AI-02 HIGH finding — claimed fixed). Re-test to confirm `org_id` is always sourced from the authenticated session, not the request body.
- **Subscription/invoice IDOR:** Verify `GET /subscriptions/{id}/invoices` and `GET /subscriptions/me` are scoped to the authenticated org — not accessible with another org's subscription UUID.

**Prior history:** IDOR pattern documented as recurring in Phase 6 review (`project_phase6_patterns.md`). AiService IDOR confirmed fixed in SEC-AI-02 remediation pass 2.

---

### Priority 2 — HIGH

#### T-03: Authorization and RBAC Enforcement

**ASVS:** 4.1, 4.2 | **OWASP:** WSTG-ATHZ-01 through 03

- **PermissionBehavior coverage:** Test each MediatR command/query endpoint with a user who lacks the required `[RequiresPermission]`. Confirm 403 response — not 200 or 500. Pay particular attention to new endpoints added in Phase 7 (Waves 1–3).
- **Module 1 RLS session variable:** The database RLS policies depend on the PostgreSQL session variable `app.current_user_id` being set before query execution. Verify this is set on every request and that it cannot be set to another user's ID by any API input.
- **Callback role-gating:** Several Callback pages/endpoints have `TODO Phase 6F: role-gate` comments (verified in `Sidebar.tsx:136`, `CallbackDetailPage.tsx:5`, `CallbackListPage.tsx:5`, `CallbackKpiPage.tsx:5`) — these are flagged for frontend-dev but the underlying API authorization must be tested.
- **Ghost endpoint enumeration:** Prior review (SEC-056) found settings routes that were registered without handlers (all subsequently fixed). Re-enumerate all routes and verify each returns 401/403 for unauthorized callers, not 404 (which would disclose route existence).

**Prior history:** PermissionBehavior gap (Phase 6, HIGH). Module 1 Auth/RBAC gate NO-GO (2026-05-29). `M1-R-001` (HIGH) remains open.

---

#### T-04: AI Service Prompt Injection and Data Exfiltration

**ASVS:** 5.2, 5.3 | **OWASP:** LLM01, LLM06 (OWASP Top 10 for LLMs)

- **Prompt injection via document upload:** Upload a document containing crafted text designed to manipulate AI extraction or chat responses. Test whether injected instructions alter system behavior or exfiltrate context.
- **RAG retrieval cross-org leakage:** The pgvector RAG pipeline stores embeddings per-org. Test whether a crafted query in Org A can retrieve embedded context from Org B's documents.
- **Budget bypass:** The token budget (`TokenBudgetService`) was previously vulnerable to a race condition (SEC-AI-02 HIGH — claimed fixed). Test concurrent AI requests to validate the advisory lock prevents budget overrun.
- **Internal API endpoint exposure:** AiService exposes an internal endpoint protected by `InternalApi:SharedToken`. Test whether this token is guessable, replayable, or discoverable via error messages.

**Prior history:** 4 HIGH + 5 MEDIUM in SEC-AI-02 initial audit; all confirmed fixed in remediation pass 2. Re-test is mandatory given the severity and complexity of the fixes.

---

#### T-05: Webhook Integrity and Replay

**ASVS:** 10.3 | **OWASP:** WSTG-INPV-11

- **Razorpay webhook spoofing:** Send a forged webhook request to `POST /subscriptions/webhooks/razorpay` without a valid `X-Razorpay-Signature` header. Confirm 401 response.
- **Replay attack:** Re-send a captured valid webhook with the same `X-Razorpay-Event-Id`. Confirm idempotency cache returns `duplicate` without re-processing.
- **HMAC timing attack:** While the `VerifyHmac` implementation uses `CryptographicOperations.FixedTimeEquals`, the comparison operates on UTF-8 hex strings rather than decoded bytes (known as NEW-001 from Phase 5). Assess practical timing discernibility in the staging environment.
- **Pub/Sub webhook receiver:** CallbackService receives Pub/Sub push messages. Test whether the Pub/Sub origin check is enforced (prior finding in SEC-AI-02 Pub/Sub origin gap — verify similar pattern not replicated in CallbackService).

---

#### T-06: Injection — SQL and Prompt

**ASVS:** 5.3.4, 5.3.5 | **OWASP:** WSTG-INPV-05

- **EF Core raw SQL:** Grep confirms no `FromSqlRaw` with user input in the reviewed services. Verify this holds across all 12 services, especially newly added handlers in Phase 7.
- **pgvector injection:** Vector search inputs (OCR text, user queries) are embedded before storage. Verify that embedding inputs are sanitized and cannot alter the vector query structure.
- **GSTIN/PAN format validation:** Test inputs that are syntactically valid but semantically incorrect (e.g., all-zero GSTIN, PAN with invalid check digit) to verify domain validation is enforced before persistence.

---

### Priority 3 — MEDIUM

#### T-07: Mobile Application Security

**MASVS:** MSTG-STORAGE, MSTG-NETWORK, MSTG-PLATFORM, MSTG-AUTH | **OWASP:** WSTG-MOBx

- **Secure storage:** Verify all sensitive tokens (Firebase ID token, session-JWT) are stored in Expo SecureStore, not AsyncStorage. Use Frida/objection to inspect runtime storage.
- **Certificate pinning:** `mobile/src/lib/pinnedHttpClient.ts` contains placeholder cert hashes (`sha256/PLACEHOLDER_HASH_1==`). If still present in the production build, pinning is ineffective. Test MITM attack with Burp Suite certificate — if the connection proceeds, pinning is not enforced.
- **Deep link validation:** Test `invite/:token` and other deep links for open-redirect or parameter injection. Verify `RootNavigator.tsx` handles malformed deep link parameters safely.
- **PII in logs / Crashlytics:** Run app through sensitive screens (PAN input, Aadhaar OTP, bank details) while capturing logcat/Console output. Confirm no PII in logs.
- **Screen capture prevention:** Verify `useSensitiveScreen` / `expo-screen-capture` is active on all PII-bearing screens. Test on physical device — some emulators bypass this control.

**Prior history:** Certificate pinning placeholders flagged as INFO-001 (Phase 5). AadhaarField masking and SecureStore usage confirmed in prior reviews.

---

#### T-08: Admin Frontend Security

**ASVS:** 3.4, 5.3 | **OWASP:** WSTG-CLNT-01 through 13

- **Auth token in localStorage:** `src/admin/src/lib/authToken.ts:3-9` stores `sa_admin_token` in `localStorage`. This is a known open finding (GAP-051 — deferred to Wave 7). Verify XSS exploitability: if any XSS is found, the admin token is directly exfiltrable.
- **XSS via document content:** DocumentQueuePage and DocumentReviewPage render document metadata. Test whether malicious filenames or OCR-extracted text can inject scripts.
- **CSP headers:** Verify `Content-Security-Policy` header is present and restrictive on the admin panel (nginx.conf). Test with a browser CSP evaluator.
- **PAN/Aadhaar masking:** Confirm PAN and Aadhaar last-4 are masked by default in the admin UI. Test whether unmasked values are present in page source or API responses when not explicitly requested.
- **CSRF protection:** All admin mutations are authenticated with Firebase JWT in `Authorization: Bearer` header (custom header pattern, inherently CSRF-resistant). Verify no cookie-based auth that would be CSRF-vulnerable.

**Prior history:** GAP-051 (admin localStorage token) is a known open MEDIUM; will appear as HIGH if XSS is found.

---

#### T-09: Sensitive Data Handling and PII Protection

**ASVS:** 8.1, 8.2, 8.3 | **DPDP Act 2023:** §8, §12

- **PAN encryption at rest:** Verify the `AesPanEncryptionService` (AES-256-CBC) correctly encrypts PAN before database insertion. Attempt to recover plaintext PAN from the staging database directly. (Note: migration to AES-256-GCM is a LOW finding, NEW-003 — not yet fixed.)
- **Razorpay key secret encryption:** Verify `EncryptedKeySecret` in `subscription.razorpay_config` is AES-256-GCM encrypted at rest (`AesCredentialEncryptionService` — confirmed using GCM). Attempt to decrypt using a known or guessable `ENCRYPTION_KEY`.
- **DPDP Right to Erasure:** Test the account deletion flow end-to-end. Confirm `auth.user` is soft-deleted, Pub/Sub erasure event is published, and SubscriptionService responds by anonymizing subscription records. Verify NEW-002 (Firebase revocation fatality) is resolved or that the flow degrades gracefully.
- **Data localization:** Confirm GCS buckets and Cloud SQL instance are in `asia-south1` (Mumbai) region. Verify Cloud Logging export is not routed to non-India regions for PII-containing log entries.

---

#### T-10: Rate Limiting and Abuse Prevention

**ASVS:** 11.1 | **OWASP:** WSTG-ATHN-03

- **OTP endpoint:** Confirm 5 req / 10 min sliding window per IP on `/auth/otp`. Test bypass via IPv6, X-Forwarded-For header injection (if Cloud Armor passes through client IP), or parallel phone numbers.
- **AI endpoint cost abuse:** AiService rate limiter (previously reviewed as present but with a budget race condition — fixed). Test concurrent AI requests from the same authenticated user and confirm the daily token budget is respected.
- **Document upload:** Test bulk document upload to verify rate limiting prevents abuse of OCR processing pipeline.
- **Subscription endpoint:** `POST /subscriptions` is rate-limited at standard (100 req/min). Test whether rapid subscribe/cancel cycling can cause inconsistent subscription state.

---

### Priority 4 — LOW / INFORMATIONAL

#### T-11: Infrastructure and Configuration

- **Cloud Run ingress:** Confirm admin frontend Cloud Run service has restricted ingress (not `--ingress=all` without Cloud Armor). SEC-017 was PARTIAL — LB wiring is a manual step. Verify current staging state.
- **Container image CVEs:** Run `trivy` on all 12 service Docker images. Flag any HIGH/CRITICAL CVEs in base images or dependencies.
- **Hangfire dashboard auth:** Confirm `HangfireRoleAuthorizationFilter("SYSTEM_ADMIN")` is enforced in staging. Test with a non-admin Firebase JWT.
- **Secret Manager rotation:** Verify `RAZORPAY_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `PanEncryption:Key`, and Firebase service account credentials are stored in GCP Secret Manager (not environment variables or `appsettings.json`). Check for any version > 1 that has not been rotated.
- **Firebase service account key:** A leaked service-account key was previously noted (memory: `auth-session-jwt-and-firebase.md`). Verify this key has been rotated (TL action). The `.gitignore` correctly excludes `service-account*.json`, but confirm no historical commit contains it (`git log --all -S "private_key"`).

---

#### T-12: Compliance-Specific (Indian Regulatory)

- **GST rate configurability:** Verify GST rates (0%, 5%, 12%, 18%, 28%) are loaded from configuration, not hardcoded. Test by checking database `gst.tax_rates` table entries and verifying the service respects configuration changes without code deployment.
- **E-invoicing threshold:** Confirm the 5 Crore turnover threshold for e-invoicing is configurable (not hardcoded). With GAP-022 tax-rate config endpoints partially unbuilt, this may be partially hardcoded.
- **Document retention:** Confirm deletion does not hard-delete documents; verify `deleted_at` soft-delete is enforced and documents cannot be permanently deleted before 7-year retention period expires.
- **Aadhaar OTP flow:** Test the Aadhaar OKYC flow for replay attack resistance. Confirm OTP hashing uses composite input (phone + OTP) with SHA-256 per database migration `database/auth/V2__fix_otp_hash_comment.sql`.

---

## 5. OWASP ASVS Mapping

| ASVS Category | Level 2 Requirement | Primary Test |
|---|---|---|
| V2 Authentication | 2.1.1, 2.2.1, 2.5.4, 2.6.1, 2.7.1 | T-01 |
| V3 Session Management | 3.2.1, 3.3.1, 3.4.1, 3.4.2 | T-01, T-08 |
| V4 Access Control | 4.1.1–4.1.5, 4.2.1–4.2.2 | T-02, T-03 |
| V5 Validation and Encoding | 5.2.1, 5.3.4, 5.3.5 | T-06 |
| V7 Error and Logging | 7.1.1, 7.2.1 | T-09 |
| V8 Data Protection | 8.1.1, 8.2.1, 8.3.1–8.3.5 | T-09 |
| V9 Communications | 9.1.1, 9.2.1 | T-01, T-05 |
| V10 Malicious Code | 10.3.1–10.3.3 | T-05 |
| V11 Business Logic | 11.1.1–11.1.7 | T-10 |
| V13 API and Web Service | 13.1.1–13.1.5, 13.2.1–13.2.7 | T-02, T-03, T-05 |
| V14 Configuration | 14.1.1–14.1.5, 14.2.1 | T-11 |

| MASVS Category | Requirement | Primary Test |
|---|---|---|
| MSTG-STORAGE | 1, 2, 3, 5 | T-07 |
| MSTG-NETWORK | 1, 2, 3, 4 | T-07 |
| MSTG-PLATFORM | 1, 2, 5, 6 | T-07 |
| MSTG-AUTH | 1, 2, 3 | T-01, T-07 |
| MSTG-RESILIENCE | 1, 2, 3 | T-07 |

---

## 6. Deliverables

| Deliverable | Timeline | Recipient |
|---|---|---|
| Kick-off call with scope confirmation | Day 0 | Team lead, DevOps, Security reviewer |
| Preliminary findings (verbally) | Day 5 (mid-test) | Team lead |
| Draft VAPT report (all findings, CVSS scored) | Day 10 | Team lead, Security reviewer |
| Remediation review meeting | Day 11 | Engineering team |
| Re-test of CRITICAL/HIGH findings | Day 15–20 (after fixes) | Security reviewer |
| Final VAPT report (with re-test attestation) | Day 21 | Team lead, Compliance |
| Executive summary (1 page) | Day 21 | Team lead |

---

## 7. Escalation and Rules of Engagement

**Immediate halt and escalation triggers:**
- Discovery of production data in staging environment.
- Unintended access to a production service or database.
- Discovery of a zero-day or active exploit with real-world exploitation risk.
- Any finding involving actual user PII (even if staging was misconfigured with real data).

**Escalation path:**
1. Tester halts all activity on the affected system immediately.
2. Notify the team lead directly (not via the orchestrator agent).
3. Document the finding with timestamp, evidence, and immediate containment recommendation.
4. Team lead decides on disclosure timeline per CERT-In 6-hour mandatory notification for critical incidents.

**Prohibited actions:**
- No testing against production environment.
- No denial-of-service testing against staging that would affect CI/CD pipelines.
- No social engineering of team members.
- No exfiltration of data beyond what is necessary to prove the finding.
- No modification of staging database records (read-only exploitation only).

---

## 8. Remediation SLAs

| Severity | Target Remediation | Re-test Timing |
|---|---|---|
| CRITICAL | 48 hours (emergency patch) | Immediately after fix |
| HIGH | 7 calendar days | Within 14 days of finding |
| MEDIUM | 30 calendar days | Next scheduled VAPT or interim re-test |
| LOW | 90 calendar days | Next scheduled VAPT |
| INFO | Next sprint planning | Next scheduled VAPT |

**Regulatory note:** CERT-In mandates reporting of cyber incidents to CERT-In within 6 hours of detection. If the VAPT uncovers evidence of a prior breach or active exploit, the CERT-In reporting obligation applies irrespective of the VAPT context.

---

## 9. Prior Findings Summary (Internal Reviews — Phases 4 through SEC-AI-02)

The following open findings from internal security reviews should be verified as part of the VAPT:

| Finding ID | Severity | Description | Mapped VAPT Test |
|---|---|---|---|
| NEW-002 | HIGH | Firebase revocation makes account deletion fatal (DPDP Right to Erasure blocker) | T-09 |
| M1-R-001 | HIGH | Module 1 Auth/RBAC — specific finding details in internal report | T-03 |
| I1.1-001 | MEDIUM | Permission Catalog RBAC edge case | T-03 |
| I1.3-002 | MEDIUM | Add User RBAC enforcement gap | T-03 |
| GAP-051 | MEDIUM | Admin panel `sa_admin_token` in localStorage (XSS-exfiltrable) | T-08 |
| SEC-017 | MEDIUM | Cloud Armor effective only when LB is wired (PARTIAL) | T-11 |
| NEW-001 | MEDIUM | HMAC comparison uses hex string bytes vs decoded bytes (timing side-channel) | T-05 |
| NEW-003 | LOW | PAN encryption uses AES-256-CBC (not GCM) — no integrity protection | T-09 |
| INFO-001 | LOW | Certificate pinning placeholder hashes not replaced with production values | T-07 |
| GAP-PCI-01 | LOW | `IRazorpayClient.VerifyWebhookSignature` uses non-constant-time comparison (dead code but dangerous) | T-05 |
| GAP-PCI-02 | LOW | No startup guard preventing MockRazorpayClient in production | T-11 |
| FG-01 | LOW | AiService: reservation row leaks 1000 tokens on HTTP request cancellation | T-04 |

---

## 10. Schedule

| VAPT Round | Trigger | Target Date |
|---|---|---|
| VAPT Round 1 | Before first production user onboarding | Q3 2026 (TL to confirm) |
| VAPT Round 2 | 6 months after Round 1 (RBI cadence) | Q1 2027 |
| Targeted re-test | After any new service launch or major auth change | As needed |
| Post-incident review | Following any security incident | Within 30 days of incident closure |

---

*Last reviewed: 2026-06-11*  
*Scheduled review: Before production launch (VAPT Round 1)*
