# SnapAccount API Endpoint Contracts

Base URL: `http://localhost:5000` (individual service ports assigned by Aspire)
Auth: Firebase JWT in `Authorization: Bearer <token>` header (session-JWT issued by AuthService).
All endpoints require `.RequireAuthorization()` unless noted as PUBLIC.

## Session-JWT Claim Structure (NEW-D15)

The session JWT issued by `POST /auth/otp/verify`, `POST /auth/password/login`, `POST /auth/social/firebase`, and `POST /auth/token/refresh-context` contains:

| Claim | Type | Notes |
|-------|------|-------|
| `sub` | string | Firebase UID |
| `userId` | string (UUID) | Internal user ID |
| `organizationId` | string (UUID) or absent | Current active org; absent until onboarding complete |
| `roles` | string[] | List of role names (e.g. `["OWNER","ACCOUNTANT"]`) |
| `is_platform_admin` | bool | Platform-level admin flag |

**No `permissions` claim.** Clients must call `GET /auth/me/permissions` to get the effective permission list. This keeps token size minimal and permission checks server-authoritative.

---

## KFS Locale Resolution (NEW-D10)

For `POST /loans/applications/{id}/kfs` and `GET /loans/applications/{id}/kfs`, the locale of the KFS document is resolved as:

1. `?locale` query param from the caller (validated: `en | hi | bn`)
2. → `"en"` (hard fallback — RBI KFS is statutory, never fail on locale)

Steps 2 (user preference) and 3 (org default) will be added in a future phase when LoanService→AuthService cross-service locale lookup is implemented. Current implementation skips to "en" if caller omits locale.

The resolved locale is stored in `loan.key_facts_statement.locale` (migration 079, default `'en'`) and echoed in the POST response and GET response.

**GET locale behaviour:** When `?locale=hi` is requested, the handler first looks for a KFS row with `locale='hi'`. If none exists, it falls back to the most-recent KFS row regardless of locale. This means GET never returns 404 solely because of a locale mismatch.

---

## Module 1 — Auth & RBAC (Multi-Tenant, Custom Roles, Constrained Delegation)

> AuthService base URL: Aspire-assigned (typically port 5001 locally).
> DEV_AUTH_BYPASS tokens: `dev-superadmin-token`, `dev-admin-token`, `dev-user-token`.
> Permission codes (not role names) are used everywhere; see GET /auth/me/permissions.

### Core Auth — `/auth`

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /auth/otp/send | PUBLIC | Send phone OTP (Firebase) | `{ phoneNumber: "+91XXXXXXXXXX" }` | `{ verificationId }` 200 |
| POST | /auth/otp/verify | PUBLIC | Verify OTP, issue session-JWT | `{ verificationId, otp }` | `{ token, userId, refreshToken, refreshExpiresAt, isNewUser }` 200 OR `{ requires2fa, challengeToken }` |
| POST | /auth/password/register | PUBLIC | Register with email+password | `{ email, password, displayName }` | `{ token, userId, refreshToken }` 201 |
| POST | /auth/password/login | PUBLIC | Login with email+password | `{ email, password }` | `{ token, userId, refreshToken }` 200 OR `{ requires2fa, challengeToken }` |
| POST | /auth/social/firebase | PUBLIC | Google/Apple sign-in | `{ firebaseIdToken, provider: "google"\|"apple", email?, displayName? }` | `{ token, userId, refreshToken, isNewUser }` 200 |
| GET | /auth/methods | PUBLIC | List available auth methods | — | `{ otp, password, google, apple }` 200 |
| POST | /auth/token/refresh | PUBLIC | Rotate access token using refresh token | `{ refreshToken }` | `{ token, refreshToken, expiresAt }` 200 |
| POST | /auth/token/refresh-context | Required | Re-issue session JWT with current org/RBAC claims (does NOT rotate refresh token). Accepts optional body `{ organizationId? }` for org-switcher. | `{ organizationId?: uuid }` | `{ accessToken, expiresAt, organizationId? }` 200; 403 if membership invalid |
| POST | /auth/local/login | PUBLIC (dev only) | DEV_AUTH_BYPASS login | `{ email }` | `{ token, userId, refreshToken }` 200 |
| GET | /auth/me | Required | Get current user profile | — | `{ userId, email, displayName, phoneNumber, organizationId, roles, photoUrl }` 200 |
| GET | /auth/me/permissions | Required | Get effective permission list | — | `{ userId, roles:[string], permissions:[string] }` 200 |
| GET | /auth/me/preferences | Required | Get user preferences | — | `{ preferredLocale, preferredTheme }` 200 |
| GET | /auth/me/menu | Required | Get navigation menu items | — | `{ items:[...] }` 200 |
| PUT | /auth/profile | Required | Update user profile | `{ displayName?, photoUrl?, preferredLocale? }` | 204 |
| GET | /auth/devices | Required | List registered devices | — | `[{ deviceId, deviceName, platform, lastActiveAt }]` 200 |
| DELETE | /auth/devices/{deviceId} | Required | Remove a device | — | 204 |
| GET | /auth/organizations | Required | List user's organizations | — | `[{ id, businessName, role }]` 200 |
| POST | /auth/organizations | Required | Create a new organization | `{ businessName, gstin?, panNumber?, businessType? }` | `{ organizationId }` 201 |
| DELETE | /auth/account | Required | Request account deletion (DPDP right to erasure) | — | 204 |
| GET | /search | Required | Global command-palette search | `?q&types` | `{ query, results:[{type,id,title,subtitle,url}], totalCount }` 200 |

**`POST /auth/token/refresh-context`:** Re-issues the access token JWT whose `organizationId` and `roles` claims reflect the user's current org membership — used by mobile/web after onboarding completes to pick up the new org context. Does NOT rotate the opaque refresh token (refresh token lifetime unchanged). Rate limit: standard 100 req/min.

**ORG-SWITCHER (mobile Wave 6):** Accepts an optional body `{ "organizationId": "<uuid>" }`. When present, the handler verifies the caller has an active (non-deleted, `IsActive=true`) membership in that org before minting the token. Returns `403` with `{ error, code: "Auth.OrgSwitchForbidden" }` if membership check fails. The response echoes the effective `organizationId` regardless of whether one was requested. Never silently falls back to another org — a 403 is the only outcome for a bad membership hint.

### Privacy — DPDP Act 2023 (`/auth/me`)

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /auth/me/consents | Required | Current consent status per processing purpose | — | See aligned response below | 200 |
| POST | /auth/me/consents/{purpose}/withdraw | Required | Withdraw consent for a processing purpose | `{ noticeVersion: string, locale?: string }` | 204 |
| POST | /auth/me/data-export | Required | Request a DPDP data portability export bundle | — | `{ requestId, status, estimatedReadyAt }` 202 |
| GET | /auth/me/data-export | Required | Status of most-recent data export request | `?requestId` (optional) | `{ requestId, status, downloadUrl?, requestedAt }` 200; 404 if no export yet |
| POST | /auth/me/data-correction | Required | Submit a data-correction request | `{ dataCategory: string, description: string }` | `{ requestId, status }` 202 |
| GET | /auth/me/data-correction | Required | List own data-correction requests | — | `[{ requestId, dataCategory, description, status, submittedAt, resolvedAt? }]` 200 |

**`GET /auth/me/consents` response — additive dual-name contract (Phase 7 QA fix):**

Both the original backend field names and the aligned mobile-contract field names are serialized.
Admin web does NOT call this endpoint (admin reads `/loans/applications/{id}/consents`).
Mobile `privacy.ts` normalizer accepts both shapes; future mobile cleanup can drop the normalizer shim.

```json
{
  "consents": [ ... ],
  "items": [ ... ]
}
```

Each entry in `consents` / `items` contains both sets of keys:

| Mobile name (aligned) | Backend name (original) | Notes |
|----------------------|------------------------|-------|
| `purposeCode` | `purpose` | same value |
| `description` | `purposeDescription` | same value |
| `consentTextVersion` | `noticeVersion` | same value |
| `grantedAt` | `actionAt` | same value |
| `status` | `status` | `"granted"` or `"withdrawn"` |
| `locale` | `locale` | BCP-47 |

**Purpose values:** `ACCOUNT_MANAGEMENT`, `GST_FILING`, `ITR_FILING`, `LOAN_PROCESSING`, `MARKETING`, `ANALYTICS`.
**Status values for consent:** `granted`, `withdrawn` (lowercase from entity; mobile uppercases on compare).

### Org Role Management — `/auth/org/roles`

| Method | Route | Permission Required | Request Body | Response |
|--------|-------|---------------------|-------------|----------|
| GET | /auth/org/roles | `org.roles.read` | — | `[{ id, name, displayName, description, isSystemRole, isActive, memberCount, permissionNames:[...] }]` 200 |
| POST | /auth/org/roles | `org.roles.create` | `{ name: string, displayName: string, description?: string }` | `{ roleId: guid }` 201 |
| GET | /auth/org/roles/{id} | `org.roles.read` | — | `{ id, name, displayName, description, isSystemRole, organizationId, isActive, permissions:[{permissionId, name, resource, action, description}] }` 200 |
| PUT | /auth/org/roles/{id} | `org.roles.update` | `{ displayName: string, description?: string }` | 204 |
| DELETE | /auth/org/roles/{id} | `org.roles.delete` | — | 204 (conflicts if members assigned) |
| GET | /auth/org/roles/{id}/permissions | `org.roles.read` | — | `{ roleId, permissions:[{permissionId, name, resource, action, description}] }` 200 |
| PUT | /auth/org/roles/{id}/permissions | `org.permissions.grant` | `{ permissionIds: guid[] }` | 204 (403 if delegation rule violated) |

**Delegation rule on PUT /auth/org/roles/{id}/permissions**: server rejects any `permissionId` not in the caller's own effective set. Returns `403 Role.PrivilegeEscalation`.

### Permission Catalog — `/auth/permissions` and `/auth/me/grantable-permissions`

| Method | Route | Permission Required | Request Body | Response |
|--------|-------|---------------------|-------------|----------|
| GET | /auth/permissions | `org.permissions.read` | — | `[{ module: string, displayName: string, permissions:[{ id, name, resource, action, description }] }]` 200 — grouped by module |
| GET | /auth/me/grantable-permissions | `org.permissions.read` | — | `{ grantablePermissionIds: guid[] }` 200 — subset the caller may delegate |

### Member (Team) Management — `/auth/team`

| Method | Route | Permission Required | Request Body | Response |
|--------|-------|---------------------|-------------|----------|
| GET | /auth/team | `org.members.read` | `?role=&status=&page=&pageSize=` | `{ items:[{ userId, email, displayName, role, status, modules, joinedAt, lastActiveAt, photoUrl }], totalCount }` 200 |
| PATCH | /auth/team/{memberId} | `org.members.update` | `{ role?: string }` | 204 |
| POST | /auth/team/{memberId}/suspend | `org.members.suspend` | — | 204 |
| POST | /auth/team/{memberId}/reactivate | `org.members.suspend` | — | 204 |
| DELETE | /auth/team/{memberId} | `org.members.remove` | — | 204 |

### Invitation Management — `/auth/team/invite`, `/auth/team/invites`, `/auth/invite/{token}`

| Method | Route | Auth | Permission | Request Body | Response |
|--------|-------|------|------------|-------------|----------|
| POST | /auth/team/invite | Required | `org.members.invite` | `{ email: string, role: string, phone?: string, customMessage?: string }` | `{ inviteId, expiresAt }` 201 |
| GET | /auth/team/invites | Required | `org.members.invite` | — | `[{ inviteId, email, role, invitedByUserId, invitedAt, expiresAt, status }]` 200 |
| POST | /auth/team/invites/{id}/resend | Required | `org.members.invite` | — | `{ expiresAt }` 200 |
| DELETE | /auth/team/invites/{id} | Required | `org.members.invite` | — | 204 |
| GET | /auth/invite/{token} | PUBLIC | — | — | `{ inviteId, organizationName, email, roleName, roleDisplayName, expiresAt, isValid }` 200; 410 Gone if expired/invalid |
| POST | /auth/invite/{token}/accept | Required | — | — | `{ organizationId, organizationName, roleId, roleName }` 200; 409 if already member |

### Platform Admin — `/auth/admin`

| Method | Route | Permission Required | Request Body | Response |
|--------|-------|---------------------|-------------|----------|
| GET | /auth/admin/organizations | `platform.orgs.read` | `?page=&pageSize=&search=&isActive=` | `{ items:[{ id, businessName, gstin, panNumber, businessType, isGstRegistered, isActive, memberCount, createdAt }], totalCount }` 200 |
| POST | /auth/admin/organizations | `platform.orgs.create` | `{ businessName: string, gstin?: string, panNumber?: string, businessType?: string }` | `{ organizationId }` 201 |
| POST | /auth/admin/organizations/{id}/suspend | `platform.orgs.suspend` | — | 204 |
| GET | /auth/admin/users | `platform.orgs.read` | `?page=&pageSize=&search=` | `{ items:[...], totalCount }` 200 |
| GET | /auth/admin/users/{id} | `platform.orgs.read` | — | `{ userId, ... }` 200 |
| GET | /auth/admin/team-members | `org.members.read` | `?role=` | `[...]` 200 |
| GET | /auth/admin/staff | `platform.orgs.read` | `?role=` | `[...]` 200 |
| GET | /auth/admin/audit-events | `platform.orgs.read` | `?userId=&from=&to=&page=&pageSize=` | `{ items:[...], totalCount }` 200 |

### 2FA TOTP — `/auth/me/2fa`, `/auth/2fa`

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /auth/me/2fa/enroll | Required | Generate TOTP secret (unconfirmed) | — | `{ otpauthUri: string, base32Secret: string }` 200 |
| POST | /auth/me/2fa/confirm | Required | Confirm TOTP; enable 2FA; return recovery codes | `{ code: string }` | `{ recoveryCodes: string[] }` 200 |
| POST | /auth/me/2fa/disable | Required | Disable 2FA (TOTP or recovery code) | `{ code: string }` | 204 |
| GET | /auth/me/2fa/status | Required | Current 2FA state | — | `{ enabled: bool, confirmedAt: string\|null }` 200 |
| POST | /auth/2fa/challenge | PUBLIC | Complete 2FA login step | `{ challengeToken: string, code: string }` | `{ token, userId, refreshToken, refreshExpiresAt }` 200 |

**Modified login response when 2FA enabled:**
```json
{ "isNewUser": false, "token": null, "userId": "uuid", "refreshToken": null, "requires2fa": true, "challengeToken": "<5-min-signed-token>" }
```

### Password Reset — `/auth/password`

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /auth/password/forgot | PUBLIC | Initiate reset — no user enumeration | `{ email: string }` | 204 |
| POST | /auth/password/reset | PUBLIC | Consume token, set new password | `{ token: string, newPassword: string }` | 204 |

Rate limit: 5 req / 10 min per IP. Reset link emailed via SendGrid (or logged to stdout if API key absent).

### KYC — `/auth/me/kyc`

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /auth/me/kyc/pan/verify | Required | Verify PAN (mock: always VERIFIED for valid format) | `{ pan: string, name?: string }` | `{ status: "VERIFIED"\|"FAILED", verifiedAt: string\|null }` 200 |
| POST | /auth/me/kyc/aadhaar/otp/send | Required | Initiate Aadhaar OTP | `{ aadhaar: string }` | `{ transactionId: string }` 200 |
| POST | /auth/me/kyc/aadhaar/otp/verify | Required | Verify Aadhaar OTP | `{ transactionId: string, otp: string }` | `{ status: "VERIFIED"\|"FAILED", verifiedAt: string\|null }` 200 |

**DPDP:** Full Aadhaar never stored. `reference_number` masked as `XXXX-XXXX-1234` (last 4 digits). Controlled by `KYC_PROVIDER=mock` (default) or `KYC_PROVIDER=sandbox`.

### Org Settings — `/auth/org/settings` (CONTRACT-GAPS task #27)

| Method | Route | Permission | Description | Request Body | Response |
|--------|-------|-----------|-------------|-------------|----------|
| GET | /auth/org/settings | `org.settings.read` | Return org self-service settings | — | `{ name, gstin, phone, email, logoUrl, addressLine1, addressLine2, city, state, pincode }` 200 |
| PATCH | /auth/org/settings | `org.settings.update` | Update mutable org settings | `{ name?, logoUrl?, addressLine1?, addressLine2?, city?, state?, pincode?, gstin? }` | 204 |

**PATCH field notes:**
- All fields optional (null = keep existing value).
- `name` — org display name, editable by ORG_ADMIN tier.
- `gstin` — if supplied, always rejected with 400 `{ code: "Gstin", message: "GSTIN changes require re-verification — contact support." }`. This makes the read-only contract explicit rather than silently ignored.
- `addressLine2` — was previously accepted by PATCH but missing from GET response (BUG-CONTRACT-002). Now included in GET response.

### Platform Config — `/auth/config` and `/auth/feature-flags`

| Method | Route | Permission | Description | Request Body | Response |
|--------|-------|-----------|-------------|-------------|----------|
| GET | /auth/feature-flags | `platform.feature-flags.read` | List all feature flags | — | `{ [flag]: bool }` 200 |
| PATCH | /auth/feature-flags/{flag} | `platform.feature-flags.write` | Enable/disable a feature flag | `{ enabled: bool }` | 204 |
| GET | /auth/config/language | `platform.config.read` | Platform language/locale config | — | `{ defaultLocale, supportedLocales, fallbackLocale }` 200 |
| PATCH | /auth/config/language | `platform.config.write` | Update language config | JSON body | 204 |
| GET | /auth/config/whatsapp | `platform.config.read` | WhatsApp integration config | — | `{ enabled, wabaId, phoneNumberId, webhookVerifyToken }` 200 |
| PATCH | /auth/config/whatsapp | `platform.config.write` | Update WhatsApp config | JSON body | 204 |
| GET | /auth/config/privacy-contact | Required (no permission gate) | DPDP DPO / privacy-contact details (Task #27, item 4) | — | `{ name, email, address }` 200 |

**GET /auth/config/privacy-contact notes:**
- Reads `Privacy:Contact:Name`, `Privacy:Contact:Email`, `Privacy:Contact:Address` from server configuration (appsettings / GCP Secret Manager env-override).
- No `[RequiresPermission]` gate — all authenticated users may read DPO contact info (DPDP Act 2023, Section 8(7): data fiduciaries must disclose DPO details to data principals).
- Never fails: if config keys are absent, empty strings are returned (TL-10 DPO appointment is pending).
- Development environment substitutes placeholder values when config is absent, so frontends render without production secrets.
- **Do NOT ship DPO contact details in mobile app builds** — always fetch from this endpoint at runtime.

### Security Controls

| Code | Control |
|------|---------|
| SEC-RLS-001 | Per-request PostgreSQL session vars `app.current_user_id` + `app.is_platform_admin` set by `RlsSessionInterceptor` |
| SEC-DELEGATION | Application-layer guard in `SetRolePermissionsCommand`, `UpdateOrgMemberCommand`, `CreateInvitationCommand` — rejects privilege escalation; returns 403 `Role.PrivilegeEscalation` |
| SEC-IDOR | All handlers verify `resource.OrganizationId == caller.OrganizationId`; SUPER_ADMIN bypasses |
| SEC-INVITE-TOKEN | 256-bit URL-safe base64 token; SHA-256 hash stored in DB; 48-hour expiry |

---

## DocumentService

> Base URL: Aspire-assigned (typically port 5047 locally).
> Rate limit: standard 100 req/min.

| Method | Route | Permission | Description | Request Body | Response |
|--------|-------|-----------|-------------|-------------|----------|
| POST | /documents/upload | Required | Upload a document to GCS | `{ fileName, contentType, base64Content, category }` | `{ documentId, gcsUri, status }` 201 |
| GET | /documents | Required | List documents for org | `?page&pageSize&category` | `{ items:[{documentId,fileName,category,status,uploadedAt}], totalCount }` 200 |
| GET | /documents/{id} | Required | Get document detail | — | `{ documentId, fileName, gcsUri, ocrStatus, ocrResultJson, ... }` 200 |
| PUT | /documents/{id}/category | Required | Re-categorize document | `{ category }` | 204 |
| POST | /documents/{id}/share | Required | Share document with org member | `{ targetUserId }` | 204 |
| POST | /documents/{id}/ocr | Required | Request OCR extraction | — | `{ jobId, status }` 202 |
| POST | /documents/{id}/approve | `document.review` | Approve document; publishes accounting event | — | `{ message: "Document approved." }` 200 |
| POST | /documents/{id}/reject | `document.review` | Reject with mandatory reason | `{ reason: string (≤2000 chars) }` | `{ message: "Document rejected." }` 200 |
| POST | /documents/{id}/request-clarification | `document.review` | Request more info (status unchanged) | `{ message: string (≤2000 chars) }` | `{ message: "Clarification request recorded." }` 200 |
| POST | /documents/{id}/archive | `document.archive` | Archive document (idempotent) | — | `{ message: "Document archived." }` 200 |
| GET | /documents/admin/dashboard-stats | `platform.orgs.read` | Pending document count for admin dashboard | — | `{ pendingCount }` 200 |
| GET | /documents/admin/activity | `platform.orgs.read` | Daily doc-creation counts for activity chart | `?range=7d\|30d` | `{ items:[{date,count}] }` 200 |
| GET | /documents/admin/users/{userId}/documents | `platform.orgs.read` | Recent docs for a specific user | — | `[{ documentId, fileName, status, uploadedAt }]` 200 |

**Document status machine:** `UPLOADED → OCR_IN_PROGRESS → OCR_COMPLETE → IN_REVIEW → APPROVED`; any non-terminal → `REJECTED`; most → `ARCHIVED`. Clarification does not change status.

**OCR:** Google Document AI. Results stored as `ocr_result_json`. On approve, publishes `OcrCompletedPayload` to `snapaccount.document.ocr.completed` Pub/Sub topic; AccountingService's `PostFromOcrCommand` picks it up.

---

## AccountingService

> Base URL: Aspire-assigned (typically port 5005 locally).

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /accounting/journal-entries | Post a journal batch | `{ entries:[{ledgerAccountId, debitAccountId, creditAccountId, amount, description, referenceId, referenceType}], batchType, organizationId, fiscalYear, periodMonth, postedById, description }` | `{ batchId, status, entryCount }` 200 |
| GET | /accounting/trial-balance | Get trial balance | `?organizationId&fiscalYear&periodMonth` | `{ accounts:[{code,name,debitTotal,creditTotal,balance}] }` 200 |
| GET | /accounting/reports/{type} | Get P&L or Balance Sheet | `?organizationId&fiscalYear&periodMonth` type=`profit-and-loss`\|`balance-sheet` | `{ sections:[{name,accounts:[...],total}], netProfit/totalAssets }` 200 |
| POST | /accounting/fiscal-year/close | Close a fiscal year | `{ organizationId, fiscalYear }` | 204 |
| POST | /accounting/organizations/{id}/bootstrap-coa | Bootstrap Chart of Accounts | `{ templateCode }` | `{ accountsCreated }` 200 |
| POST | /accounting/postings/{id}/review | Approve a pending posting | `{}` | 204 |
| POST | /accounting/postings/{id}/reverse | Reverse a posted entry | `{ reason }` | 204 |

---

## GstService (Phase 6B)

> Base URL: Aspire-assigned (typically port 5003 locally).
> **Mock-backed routes:** e-invoices/generate, e-way-bills, and GSTN portal queries default to deterministic mock adapters. Set `GST_PRODUCTION_APIS_ENABLED=true` for real GSTN/IRP/EWB APIs.

| Method | Route | Permission | Description | Request Body | Response |
|--------|-------|-----------|-------------|-------------|----------|
| POST | /gst/returns | Required | Create a GST return | `{ organizationId, gstin, returnType, financialYear, taxPeriod }` | `{ returnId, status }` 201 |
| GET | /gst/returns | Required | List GST returns | `?organizationId&financialYear&page&pageSize` | `{ items:[...], totalCount }` 200 |
| GET | /gst/returns/{id} | Required | Get GST return detail | — | `{ returnId, status, ... }` 200 |
| POST | /gst/returns/{id}/submit | Required | Submit for approval | — | 204 |
| POST | /gst/returns/{id}/approve | `gst.returns.approve` | Approve GST return | — | 204 |
| POST | /gst/returns/{id}/file | `gst.returns.file` | File return to GSTN portal [MOCK-DEFAULT] | — | `{ ackNumber, filedAt }` 200 |
| POST | /gst/returns/nil | Required | File nil return [MOCK-DEFAULT] | `{ gstReturnId }` | `{ ackNumber, filedAt }` 200 |
| POST | /gst/returns/{id}/invoices | Required | Add invoice to return | `{ invoiceNumber, invoiceType, invoiceDate, ... }` | 201 |
| GET | /gst/returns/{id}/invoices | Required | List invoices for a return | `?page&pageSize` | `{ items, totalCount }` 200 |
| GET | /gst/invoices | Required | List GST invoices | `?organizationId&financialYear&page&pageSize` | `{ items:[...], totalCount }` 200 |
| POST | /gst/invoices | Required | Create a GST invoice | `{ organizationId, gstin, buyerGstin, invoiceDate, lineItems:[...], placeOfSupply, isInterstate, documentType }` | `{ invoiceId, invoiceNumber, totalTaxableValue, totalGst, totalAmount }` 201 |
| POST | /gst/invoices/bulk-import | Required | Bulk import invoices (max 500) | `{ invoices:[...] }` | `{ importedCount, skippedCount, errors }` 200 |
| GET | /gst/itc-mismatches | Required | Get ITC mismatches | `?organizationId&taxPeriod` | `{ items:[...] }` 200 |
| POST | /gst/itc-reconciliation | Required | Reconcile ITC | `{ organizationId, taxPeriod }` | `{ reconciledCount }` 200 |
| GET | /gst/notices | Required | List GST notices | `?orgId&status&page&pageSize` | `{ items, totalCount, page, pageSize }` 200 |
| GET | /gst/notices/due-summary | `platform.orgs.read` | Overdue/due-soon notice counts for admin dashboard | — | `{ overdueCount, dueSoonCount }` 200 |
| GET | /gst/notices/{id} | Required | Get notice detail | — | `{ id, noticeNumber, noticeType, status, attachmentsJson, ... }` 200 |
| POST | /gst/notices | Required | Create GST notice | `{ orgId, noticeNumber, noticeType, issuedBy?, issuedDate, dueDate?, description? }` | `{ noticeId, status }` 201 |
| POST | /gst/notices/{id}/respond | Required | Respond to GST notice | `{ respondedByUserId, responseText?, responseAttachmentMetadataJson? }` | 204 |
| POST | /gst/notices/{id}/assign-ca | `gst.notices.assign` | Assign notice to CA | `{ caUserId }` | 204 |
| POST | /gst/e-invoices | Required | Generate IRN via IRP [MOCK-DEFAULT] | `{ invoiceId, orgId, supplierGstin }` | `{ irnNumber, ackNumber, signedInvoice, signedQRCode }` 200 |
| POST | /gst/e-way-bills | Required | Generate e-way bill [MOCK-DEFAULT] | `{ invoiceId, orgId, ... }` | `{ ewbNumber, ewbDate, validUpto }` 201 |
| GET | /gst/hsn-sac/search | Required | Search HSN/SAC codes | `?query&limit` | `{ items:[{ code, description, gstRate }] }` 200 |
| GET | /gst/admin/dashboard-stats | `platform.orgs.read` | GST returns due today for admin dashboard | — | `{ returnsDueToday }` 200 |
| GET | /gst/admin/activity | `platform.orgs.read` | Daily GST return creation counts | `?range=7d\|30d` | `{ items:[{date,count}] }` 200 |
| GET | /gst/admin/orgs/{organizationId}/returns | `platform.orgs.read` | Recent returns for org (admin) | — | `[{ returnId, ... }]` 200 |
| GET | /gst/admin/filing-queue | `gst.returns.file` | CA filing queue ordered by SLA | `?page&pageSize` | `{ items:[...], totalCount }` 200 |
| GET | /gst/admin/workload-by-user | `platform.orgs.read` | Per-assignee GST notice workload | — | `[{ userId, assignedCount }]` 200 |

**GST rates:** 0%, 5%, 12%, 18%, 28% — loaded from DB config, never hardcoded.
**E-invoicing:** Mandatory for turnover > 5 Crore. Check `organization.annualTurnoverCr` before calling `/gst/e-invoices`.
**Notice attachments:** `attachmentsJson` must be JSON array of GCS URI metadata objects — never base64.
**Recurring jobs:** Deadline reminders via `gst-service-recurring-jobs-sub` Pub/Sub at D-7, D-3, D-1, D+1.
**Rate limits:** 100 req/min per user (standard window); 30 req/min for write-strict endpoints (IRP/GSTN cost).

---

## GstService — IMS (Invoice Management System) (GAP-101, Phase 7)

> Mandatory from 1 Apr 2026 (CGST circular). Taxpayers must act on each inward invoice before GSTR-2B is generated.
> GSTR-3B Table 3 is hard-locked after GSTR-3B is filed. Corrections only via GSTR-1A.
> **Mock-backed by default** (`GST_PRODUCTION_APIS_ENABLED != "true"`): `MockImsGstnClient` returns deterministic seeded invoices.
> **Rate limits:** IMS action endpoints: 30 req/min (gst-write-strict). List/summary: 100 req/min.

### IMS Inbox

| Method | Route | Permission | Description | Request | Response |
|--------|-------|-----------|-------------|---------|----------|
| GET | /gst/ims/invoices | `gst.ims.read` | List inward invoices (paginated, filterable) | `?organizationId&period=MMYYYY&status=PENDING\|ACCEPTED\|REJECTED\|PENDING_KEPT&supplierGstin&search&page&pageSize` | `{ items:[ImsInvoiceSummary], totalCount, page, pageSize }` 200 |
| GET | /gst/ims/invoices/{id} | `gst.ims.read` | Get full invoice detail + action log | `?organizationId` | `ImsInvoiceDetail` 200 |
| POST | /gst/ims/invoices/{id}/action | `gst.ims.action` | Accept / reject / keep-pending a single invoice (idempotent) | `{ organizationId, actionedBy, action: "ACCEPTED"\|"REJECTED"\|"PENDING_KEPT", reason? }` | `{ invoiceId, previousStatus, newStatus, changed, gstnRef? }` 200 |
| POST | /gst/ims/actions/bulk | `gst.ims.action` | Bulk action on up to 100 invoices | `{ organizationId, actionedBy, items:[{ invoiceId, action, reason? }] }` | `{ totalRequested, changed, skipped, failed, results:[BulkImsInvoiceResult] }` 200 |
| GET | /gst/ims/summary | `gst.ims.read` | Status counts + GSTR-2B deadline for a period | `?organizationId&period=MMYYYY` | `{ period, pending, accepted, rejected, pendingKept, total, deemedAccepted, gstr2bGenerationDeadline, gstr2bGenerationPast, totalPendingValue, totalAcceptedValue, totalRejectedValue }` 200 |
| POST | /gst/ims/sync | `gst.ims.sync` | Pull inward invoices from GSTN IMS into local store (idempotent upsert) | `{ organizationId, gstin, period }` | `{ inserted, skipped, period }` 200 |

#### ImsInvoiceSummary shape
```json
{
  "id": "uuid",
  "supplierGstin": "29AABCU9603R1ZX",
  "supplierName": "Acme Supplies Pvt Ltd",
  "invoiceNumber": "INV-001",
  "invoiceDate": "2026-03-15",
  "invoiceValue": 11800.00,
  "taxableValue": 10000.00,
  "igstAmount": 1800.00,
  "cgstAmount": 0.00,
  "sgstAmount": 0.00,
  "cessAmount": 0.00,
  "period": "032026",
  "source": "GSTR-1",
  "status": "PENDING",
  "deemedAccepted": false,
  "actionedAt": null,
  "actionedBy": null
}
```

#### ImsInvoiceDetail shape (includes action log)
```json
{
  "id": "uuid",
  ...all ImsInvoiceSummary fields...,
  "rejectionReason": null,
  "createdAt": "2026-04-01T10:00:00Z",
  "actionLog": [
    {
      "id": "uuid",
      "action": "REJECTED",
      "previousStatus": "PENDING",
      "newStatus": "REJECTED",
      "actedAt": "2026-04-05T14:30:00Z",
      "actedBy": "uuid",
      "reason": "Price mismatch",
      "isBulk": false
    }
  ]
}
```

### GSTR-1A Amendments

| Method | Route | Permission | Description | Request | Response |
|--------|-------|-----------|-------------|---------|----------|
| POST | /gst/gstr1a | `gst.gstr1a.create` | Create GSTR-1A amendment draft (sole mechanism to correct GSTR-3B Table 3) | `{ organizationId, originalImsInvoiceId?, originalInvoiceNumber, originalSupplierGstin, amendmentType, amendmentPayloadJson, period }` | `{ amendmentId, status:"DRAFT", period, amendmentType }` 201 |
| GET | /gst/gstr1a | `gst.gstr1a.read` | List GSTR-1A amendment drafts | `?organizationId&period&status=DRAFT\|SUBMITTED\|FILED&page&pageSize` | `{ items:[Gstr1aAmendmentSummary], totalCount, page, pageSize }` 200 |

**Amendment types:** `B2B_AMENDMENT`, `B2BA`, `CDNR_AMENDMENT`, `CDNRA`

#### Gstr1aAmendmentSummary shape
```json
{
  "id": "uuid",
  "originalInvoiceNumber": "INV-001",
  "originalSupplierGstin": "29AABCU9603R1ZX",
  "originalImsInvoiceId": "uuid-or-null",
  "amendmentType": "B2B_AMENDMENT",
  "period": "032026",
  "status": "DRAFT",
  "arnNumber": null,
  "filedAt": null,
  "createdAt": "2026-04-10T09:00:00Z"
}
```

### GSTR-3B Table 3 Lock

**Backend verdict (GAP-101, verified 2026-06-11):** There is no backend endpoint that allows direct mutation of GSTR-3B Table 3 figures (`TotalIgst`, `TotalCgst`, `TotalSgst`, `TotalCess`, `TotalItcAvailable`, `NetTaxPayable`) after the return is in FILED status. The `UpdateTotals()` method on `GstReturn` is defined but never called by any command handler post-filing — the state machine (`File()` transition) prevents further writes.

**The GSTR-3B Table 3 lock is therefore a frontend concern:** the UI must render these fields as read-only once `status == "FILED"` and surface a "Fix via GSTR-1A" CTA. No 409 guard is needed server-side at this time.

> **TODO (GAP-101-3B-VERIFY):** Before adding any backend 409 guard for "zero-mismatch 3B block," verify the claim against a primary GSTN advisory (not secondary sources). The delta doc flags this as needing primary-source verification. Do NOT implement until confirmed.

### IMS Deemed Acceptance Sweep (Hangfire)

The `ApplyDeemedAcceptanceCommand` is invokable by Hangfire monthly on the 14th of each month (GSTR-2B generation date). It marks all `PENDING`/`PENDING_KEPT` invoices for the period as `ACCEPTED` with `deemed_accepted = true` and appends `DEEMED_ACCEPTED` action log entries.

This command has no `[RequiresPermission]` and is not exposed as an API endpoint — it is a system-internal Hangfire job.

---

## ItrService (Phase 6D)

> Base URL: Aspire-assigned (typically port 5007 locally).
> **Mock-backed routes:** Tax slabs loaded from `itr.tax_slab_versions` (real DB, no external API). E-verification is real-submission mock by default.

### Assessee Profile

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /itr/profile/{userId} | Required | Get assessee profile | — | `{ id, userId, panLast4, fullName, assesseeType, organizationId?, email?, phoneNumber?, address?, annualTurnoverCr? }` 200 |
| PUT | /itr/profile | Required | Create/update assessee profile | `{ userId, panCipher, panLast4, fullName, assesseeType, organizationId?, email?, phone?, dateOfBirth?, address?, annualTurnoverCr? }` | `{ assesseeId, panLast4, fullName }` 200 |

**PAN handling:** `panCipher` must be AES-256-CBC ciphertext from `IPanEncryptionService`. PAN is immutable once set.

### Filings

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /itr/filings | Required | List filings (org-wide or assessee-scoped) | `?assesseeId&status&page&pageSize&assessmentYear` | `{ items:[{id,assesseeId,assessmentYear,itrFormType,regime,status,payableOrRefund,filedAt}], totalCount, page, pageSize }` 200 |
| GET | /itr/filings/kpi | Required | ITR filing KPI counts for admin KpiStrip | `?assessmentYear` | `{ awaitingReview, slaBreached, avgTimeToReviewDays, totalFilingsAy }` 200 |
| POST | /itr/filings | Required | Start a new filing | `{ assesseeId, assessmentYear, itrFormType, regime }` | `{ filingId, assessmentYear, status }` 201 |
| GET | /itr/filings/{id} | Required | Get filing detail | — | `{ id, assesseeId, assessmentYear, itrFormType, regime, status, taxSlabVersionId?, computationHash?, salaryIncome, housePropertyIncome, businessIncome, capitalGains, otherIncome, totalDeductions, acknowledgementNumber?, filedAt?, eVerifiedAt?, reviewedByCaId?, caRejectionReason? }` 200 |
| POST | /itr/filings/{id}/compute | Required (AI; 20 req/min) | Run tax computation engine | `{ salaryIncome, housePropertyIncome, businessIncome, capitalGains, otherIncome, section80C, section80D, section80E, otherDeductions, advanceTaxPaid, tdsPaid }` | `{ filingId, grossTotalIncome, taxableIncome, totalTaxPayable, payableOrRefund, computationHash, regime, assessmentYear }` 200 |
| POST | /itr/filings/{id}/compare-regimes | Required (AI; 20 req/min) | Compare OLD vs NEW regime | same as compute | `{ old:{...}, new:{...}, recommendedRegime, taxSaving }` 200 |
| POST | /itr/filings/{id}/submit | Required | Submit filing for CA review | — | 204 |
| POST | /itr/filings/{id}/ca-approve | `itr.filings.approve` | CA approves filing | `{ caUserId }` | 204 |
| POST | /itr/filings/{id}/ca-reject | `itr.filings.approve` | CA rejects filing | `{ caUserId, reason }` | 204 |
| POST | /itr/filings/{id}/mark-filed | `itr.filings.file` | Mark as filed with IT dept | `{ acknowledgementNumber }` | 204 |
| POST | /itr/filings/{id}/e-verify | Required | E-verify filing | `{ verificationMethod, itrVObjectKey? }` | 204 |
| POST | /itr/filings/{id}/form16 | Required (AI; 20 req/min) | Upload Form 16 (OCR extraction) | `{ assesseeId, gcsUri, employeePanCipher, employeePanLast4 }` | `{ form16ExtractId, ocrStatus }` 201 |
| POST | /itr/filings/{id}/notices | Required | Upload ITR notice | `{ assesseeId, noticeNumber, noticeType, issuedDate, dueDate?, subject?, attachmentsJson? }` | `{ noticeId, status }` 201 |
| GET | /itr/filings/{id}/refund | Required | Get refund status | — | `{ filingId, refundStatus, refundAmount?, refundDate?, transactionReference?, statusMessage?, lastPolledAt }` 200 |

**`GET /itr/filings` two modes:**
- **Assessee-scoped** (`?assesseeId=...`): returns filings for that assessee. SEC-039: assessee must belong to caller's org — returns empty list (not 403) to prevent existence leaks.
- **Org-wide** (no `assesseeId`): returns all filings across caller's org via join through `assessee_profiles.organization_id`. Requires `admin.itr.read` permission.

**Filing state machine:** `DRAFT → UNDER_CA_REVIEW → USER_APPROVED → FILED → E_VERIFIED → REFUND_ISSUED`; side: `REJECTED_BY_CA`, `NOTICE_RECEIVED`.
**`itr.organization_id` enforcement:** Org-scope check enforced when `organization_id IS NOT NULL` (rows predating the column backfill are excluded from the check).

### Notices, Refunds, Tax Reference

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /itr/notices/{noticeId}/respond | Required | Respond to ITR notice | `{ respondedByUserId, responseText?, responseAttachmentsJson? }` | 204 |
| GET | /itr/tax-slabs | Required | Get tax slab for AY + regime | `?assessmentYear&regime` | `{ versionId, assessmentYear, regime, slabsJson, standardDeduction, rebate87AIncomeLimit, rebate87AMaxAmount, cessRatePct }` 200 |
| GET | /itr/deduction-catalog | Required | Get deduction section catalog | `?assessmentYear&regime` | `{ sections:[{id,sectionCode,name,maxLimit?,availableInNewRegime,availableInOldRegime}] }` 200 |
| GET | /itr/doc-checklist | Required | Per-filing document checklist | `?filingId` | `{ items:[{documentType,label,isUploaded,documentId?}] }` 200 |

### Grievances

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /itr/grievances | Required | Raise a grievance against a filing | `{ assesseeId, subject, description, attachmentsJson? }` | `{ grievanceId, status }` 201 |
| GET | /itr/grievances | Required | List grievances for assesseeId | `?assesseeId&page&pageSize` | `{ items:[...], totalCount }` 200 |

### Admin

| Method | Route | Permission | Description | Request Body | Response |
|--------|-------|-----------|-------------|-------------|----------|
| GET | /itr/admin/dashboard-stats | `platform.orgs.read` | ITR verifications-pending count | — | `{ verificationsPending }` 200 |
| GET | /itr/admin/activity | `platform.orgs.read` | Daily filing creation counts | `?range=7d\|30d` | `{ items:[{date,count}] }` 200 |
| GET | /itr/admin/workload-by-user | `platform.orgs.read` | Per-assignee ITR grievance workload | — | `[{ userId, assignedCount }]` 200 |

**Tax engine:** Config-driven from `itr.tax_slab_versions` — never hardcoded. Computation pinned with `tax_slab_version_id` + `computation_jsonb` + SHA-256 `computation_hash`.
**AI endpoints rate limit:** `/compute`, `/compare-regimes`, `/form16` — 20 req/min per user (fixed window).
**DPDP:** `Anonymize()` on `Filing` nulls `ComputationJsonb`; on `Assessee` nulls PII. 7-year document retention at GCS layer.

---

## LoanService (Phase 6C)

> Base URL: Aspire-assigned (typically port 5009 locally).
> All routes require Firebase JWT. IDOR: all handlers filter by `OrgId` from JWT.
> **Mock-backed routes:** `/loans/webhooks/{bankId}/disbursement` uses mock HMAC when `RAZORPAY_WEBHOOK_SECRET` absent; partner-bank API calls use mock adapter by default.

### Loan Products (Catalog) — Phase 7 QA fix

Org-agnostic public catalog. All authenticated users see the same products.
Mobile LoanHubScreen calls `GET /loans/products?pageSize=50` on mount.

| Method | Route | Permission | Description | Query Params | Response |
|--------|-------|------------|-------------|-------------|----------|
| GET | /loans/products | `loan.products.read` | Paginated active loan product catalog | `?page=1&pageSize=20` (capped at 100) | `{ items:[LoanProductDto], totalCount }` 200 |
| GET | /loans/products/{id} | `loan.products.read` | Single active loan product by ID | — | `LoanProductDto` 200 / 404 |

**`LoanProductDto` — exact field names match mobile TypeScript `LoanProduct` interface:**

```json
{
  "productId": "uuid",
  "bankId": "uuid",
  "productName": "MSME Business Loan",
  "description": null,
  "minAmount": 100000.00,
  "maxAmount": 5000000.00,
  "tenureMonths": 12,
  "interestRate": 12.5,
  "eligibilityCriteriaJson": null,
  "isActive": true
}
```

> `interestRate` maps to `interest_rate_min_pct` (the floor rate). `description` and `eligibilityCriteriaJson` are excluded from API response (shadow/JsonDocument properties).
> LoanHubScreen sorts client-side by `interestRate` / `maxAmount` / `tenureMonths`.

### Applications

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /loans/applications | Required | Start a new loan application (DRAFT) | `{ loanProductId, requestedAmount, tenureMonths, purpose? }` | `{ applicationId }` 201 |
| GET | /loans/applications | Required | List applications for org | `?status&page&pageSize` | `{ items:[{applicationId,orgId,status,requestedAmount,tenureMonths,loanProductId,productName,submittedAt,assignedBankId?,assignedBankName?,createdAt}], totalCount }` 200 |
| GET | /loans/applications/{id} | Required | Get application detail | — | `{ applicationId, orgId, loanProductId, productName, requestedAmount, tenureMonths, purpose, status, submittedAt, bankReferenceNo, disbursedAt, disbursedAmount, assignedBankId?, assignedBankName?, createdAt, updatedAt }` 200 |
| PATCH | /loans/applications/{id} | Required | Update DRAFT application | `{ requestedAmount?, tenureMonths?, purpose? }` | `{ applicationId, ... }` 200 |
| POST | /loans/applications/{id}/documents | Required | Attach a supporting document | `{ documentId, documentType }` | `{ applicationDocumentId }` 201 |
| POST | /loans/applications/{id}/kfs | Required | Generate RBI-compliant Key Facts Statement | `?locale=en\|hi\|bn` (optional, defaults to en) | `{ kfsId, annualPercentageRate, loanAmount, tenureMonths, monthlyEmi, fees, repaymentSchedule, lenderName, grievanceOfficerContact, coolingOffDays, generatedAt, locale }` 201 |
| GET | /loans/applications/{id}/kfs | Required | Retrieve current KFS | `?kfsId` (optional, defaults to latest) `?locale=hi` (optional, prefers locale variant) | `{ kfsId, applicationId, annualPercentageRate, loanAmount, tenureMonths, monthlyEmi, feesJson, repaymentScheduleJson, locale, ... }` 200 |
| POST | /loans/applications/{id}/consents | Required | Record consent signature (HMAC-SHA256) | `{ consentType, consentTextVersion, kfsId, consentLocale? }` | `{ consentId, signatureHex }` 201 |
| POST | /loans/applications/{id}/submit | Required | Submit DRAFT application for bank review | — | 200 |
| POST | /loans/applications/{id}/assign-bank | `loan.applications.assign` | Assign to partner bank | `{ bankId, packageId }` | `{ assignedBankId, ... }` 200 |
| POST | /loans/applications/{id}/bank-decision | `loan.applications.decide` | Record bank decision (approve/reject/docs) | `{ decision, bankReferenceNo?, reason? }` | 200 |
| POST | /loans/applications/{id}/disbursement | `loan.applications.disburse` | Record disbursement | `{ disbursedAmount, bankReferenceNo }` | 200 |
| POST | /loans/applications/{id}/close | Required | Close application | — | 200 |
| POST | /loans/applications/{id}/package | Required | Generate composite loan PDF package (≤30s) | `{ orgName }` | `{ packageUrl, gcsKey }` 200 |
| GET | /loans/applications/{id}/package/download-url | Required | Signed GCS download URL (1h TTL) | — | `{ url, expiresAt }` 200 |
| GET | /loans/applications/{id}/bank-comms-log | Required | Status and bank communications log | — | `{ items:[{logId, status, action, notes, timestamp}] }` 200 |

### Eligibility

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /loans/eligibility-check | Required | Run eligibility engine for org | `{ orgId, loanProductId? }` | `{ isEligible, score, reasons:[string], eligibleProducts:[...] }` 200 |
| GET | /loans/eligibility | Required | Get latest eligibility result for org | `?orgId` (required) | `{ isEligible, score, lastCheckedAt, reasons:[string] }` 200 |

### KPI & Dashboard

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /loans/kpi | Required | Org-scoped loan KPI counts for LoansListPage KpiStrip | — | `{ totalApps, submitted, underReview, awaitingDocs, approved, disbursed }` 200 |
| GET | /loans/admin/dashboard-stats | `platform.orgs.read` | Active loan applications count for admin cross-service dashboard | — | `{ activeApplicationsCount }` 200 |

### Partner Banks

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /loans/partner-banks | Required | List partner banks | `?includeInactive=false` | `{ items:[{bankId,name,adapterType,logoUrl,isActive}] }` 200 |
| POST | /loans/partner-banks | `loan.banks.create` | Register partner bank | `{ name, adapterType, contactEmail?, apiConfigJson?, webhookSecretRef? }` | `{ bankId }` 201 |
| PATCH | /loans/partner-banks/{id} | `loan.banks.update` | Update partner bank | `{ name?, logoUrl?, contactEmail?, apiConfigJson?, isActive? }` | 200 |

### Consents & KFS

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /loans/consents/catalog | Required | Versioned consent text catalog (DPDP audit trail) | `?locale` | `{ items:[{consentType,textVersion,text,locale,effectiveFrom}] }` 200 |

### Webhooks

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /loans/webhooks/{bankId}/disbursement | No JWT (HMAC-SHA256) | Receive bank disbursement webhook | `{ loanApplicationId, status, disbursedAmount, bankReferenceNo, reason? }` | `{ status: "accepted"\|"already_processed" }` 200 |

**Webhook headers:** `X-Idempotency-Key` (required), `X-Signature` (HMAC-SHA256, required).
**Idempotency:** `loan.webhook_idempotency_keys` deduplicates by `(bank_id, idempotency_key)` with 30-day TTL.

**State machine:** DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED | DOCS_REQUESTED → DISBURSED → CLOSED.
**Consent locale:** `consentLocale` (BCP-47, e.g. `"en"`, `"hi"`) stored in `loan.consents.consent_locale` (GAP-040/RBI audit trail).
**KFS:** Must be generated and acknowledged before consent submission (GAP-021 RBI Digital Lending Guidelines).
**KFS locale (NEW-D10):** `POST /kfs?locale=hi` generates a Hindi KFS row stored with `locale='hi'`. `GET /kfs?locale=hi` prefers the Hindi variant; falls back to any locale (typically `en`) if the requested variant is not found — never errors on locale mismatch. Supported values: `en`, `hi`, `bn`. Validated by `GenerateKfsCommandValidator` before hitting the handler.
**Cooling-off:** `coolingOffDays` from KFS stored on `loan.applications.cooling_off_days` + `cooling_off_ends_at` after disbursement.
**DPDP:** `AnonymizedAt` + `AnonymizationReason` on `LoanApplication`. `UserId` nullable for right-to-erasure.
**Rate limits:** Standard 100 req/min per user.

---

## CallbackService (Phase 6E — 12th microservice)

> Base URL: Aspire-assigned (typically port 5112 locally).
> Rate limit: standard 100 req/min per user.

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /callbacks | Required | Customer requests callback | `{ phoneNumber, category, priority, issueDescription?, preferredWindowStart?, preferredWindowEnd? }` | `{ callbackId, status }` 201 |
| GET | /callbacks | Required | List callbacks | `?userId&agentId&status&category&page&pageSize` | `{ items:[...], totalCount }` 200 |
| GET | /callbacks/{id} | Required | Get callback detail | — | `{ id, userId, status, category, priority, assignedAgentId, scheduledAt, notes:[...], ... }` 200 |
| POST | /callbacks/{id}/assign | `callback.manage` | Assign agent | `{ agentId }` | 204 |
| POST | /callbacks/{id}/confirm | `callback.manage` | Confirm schedule | `{ scheduledAt }` | 204 |
| POST | /callbacks/{id}/complete | `callback.manage` | Mark completed | `{ resolutionSummary? }` | 204 |
| POST | /callbacks/{id}/escalate | `callback.manage` | Escalate | `{ reason }` | 204 |
| POST | /callbacks/{id}/cancel | Required | Cancel | `{ reason? }` | 204 |
| POST | /callbacks/{id}/reschedule | `callback.manage` | Reschedule | `{ newWindowStart, newWindowEnd }` | 204 |
| POST | /callbacks/{id}/notes | `callback.manage` | Add call note | `{ content, isInternal }` | 201 |
| GET | /callbacks/kpi | Required | Daily KPI snapshot (org-scoped) | — | `{ organizationId, ... }` 200 |

**State machine:** Pending → Assigned → Confirmed → Completed; any → Escalated|Cancelled.
**Category values:** General, Gst, Itr, Loan, Accounting, Subscription, Technical.
**Priority values:** Low, Normal, High, Urgent.
**Phone format:** `+91XXXXXXXXXX` (Indian numbers only).

---

## NotificationService (Phase 6C/6F)

> Base URL: Aspire-assigned (typically port 5011 locally).
> Rate limit: standard 100 req/min per user.

| Method | Route | Auth | Permission | Description | Request Body | Response |
|--------|-------|------|-----------|-------------|-------------|----------|
| POST | /notifications/send | Required | — | Fan-out notification dispatch | `{ userId, eventCode, locale, variables:{}, recipientEmail?, recipientPhone? }` | `{ results:[{channel,status,messageId,error}], dispatchedCount, suppressedCount }` 200 |
| GET | /notifications/inbox | Required | — | In-app inbox | `?page&pageSize` | `{ items:[{id,eventCode,body,status,sentAt}], totalCount, unreadCount }` 200 |
| POST | /notifications/{id}/read | Required | — | Mark notification read | — | 204 |
| GET | /notifications/preferences | Required | — | Get channel preferences | — | `{ items:[{eventCode,pushEnabled,smsEnabled,emailEnabled,inAppEnabled,quietHoursStart,quietHoursEnd,doNotDisturb}] }` 200 |
| PUT | /notifications/preferences | Required | — | Upsert channel preference | `{ eventCode, pushEnabled, smsEnabled, emailEnabled, inAppEnabled, quietHoursStart?, quietHoursEnd?, doNotDisturb }` | 204 |
| POST | /notifications/push-tokens | Required | — | Register FCM device token | `{ deviceId, token, platform: "ios"\|"android" }` | 204 |
| GET | /notifications/dlq | Required | `notification.dlq.manage` | List DLQ items (operator) | `?includeResolved&page&pageSize` | `{ items:[{id,userId,eventCode,channel,locale,lastErrorMessage,retryCount,exhaustedAt,isResolved}], totalCount }` 200 |
| POST | /notifications/dlq/{id}/retry | Required | `notification.dlq.manage` | Retry DLQ item | — | 202 |
| POST | /notifications/celebrations/{kind}/fire | Required | — | Record celebration animation (idempotent) | — | `{ fired: true, alreadyFired: bool }` 200 |
| GET | /notifications/celebrations | Required | — | Get fired-state of all celebration kinds | — | `{ first_gst_filed, first_refund_credited, first_loan_disbursed, first_itr_filed, first_document_uploaded }` 200 |

**Fan-out behavior:** For each channel in `[Push, Sms, Email, InApp]`: skipped if user preference disables; skipped during DND or quiet hours (IST-aware); suppressed if same event sent within 6h dedupe window (SHA-256 key); SMS blocked if DLT template ID absent.
**GetCelebrations:** Now backed by real DB query on `notification.notification_log` (user_id + event_code columns confirmed in migration 066).
**DLQ locale:** `locale` field in DLQ response defaults to `"en"` (no `locale` column in `notification.dlq_items`; DLQ locale is informational only).
**Pub/Sub subscribers:** `LoanEventsSubscriber` (loan disbursed/failed/reversed), `AccountDeletionSubscriber` (DPDP erasure), `RecurringJobsSubscriber` (reminders).

---

## ChatService (Phase 6F)

> Base URL: Aspire-assigned (typically port 5013 locally).
> SignalR Hub: `ws://{host}/hubs/chat` — requires `Authorization: Bearer <token>`.
> Rate limit: standard 100 req/min per user.

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /chat/threads | Required | Open a new support thread | `{ category, subject?, initialMessage, clientMessageId? }` | `{ threadId, status, category, messageId }` 201 |
| GET | /chat/threads | Required | List thread inbox | `?status&category&page&pageSize` | `{ items:[{threadId,subject,category,status,lastMessageAt,unreadCount}], totalCount }` 200 |
| GET | /chat/threads/{id} | Required | Get thread detail | — | `{ threadId, subject, category, status, assignedToUserId, participants:[{userId,role}], createdAt }` 200 |
| GET | /chat/threads/{id}/messages | Required | Cursor-paginated messages | `?beforeMessageId&pageSize` | `{ items:[{messageId,senderUserId,body,attachmentsJson,clientMessageId,createdAt}], hasMore }` 200 |
| POST | /chat/threads/{id}/messages | Required | Send message | `{ body, attachmentsJson?, clientMessageId? }` | `{ messageId, threadId, senderUserId, body, createdAt }` 201 |
| POST | /chat/threads/{id}/read | Required | Mark thread read | — | 204 |
| POST | /chat/threads/{id}/assign | `chat.threads.assign` | Assign thread to agent/CA | `{ assignedToUserId, role }` | 204 |
| POST | /chat/threads/{id}/resolve | `chat.threads.resolve` | Resolve thread | — | 204 |
| POST | /chat/threads/{id}/escalate | `chat.threads.escalate` | Escalate thread | — | 204 |
| POST | /chat/threads/{id}/reopen | `chat.threads.resolve` | Reopen resolved/escalated thread | — | 204 |
| POST | /chat/threads/{id}/participants | `chat.threads.assign` | Add participant | `{ userId, role }` | 201 |
| DELETE | /chat/threads/{id}/participants/{userId} | `chat.threads.assign` | Remove participant | — | 204 |
| POST | /chat/threads/{id}/typing | Required | Record typing ping (SignalR broadcast) | — | 204 |
| GET | /chat/threads/search | Required | Full-text search message history | `?q&page&pageSize` | `{ items:[{messageId,threadId,senderUserId,body,threadCategory,threadStatus,createdAt}], totalCount }` 200 |
| GET | /chat/threads/unread-count | Required | Get unread thread count | — | `{ count }` 200 |

**SignalR hub events (server → client):**
- `MessageReceived` — `{ messageId, threadId, senderUserId, body, createdAt }`
- `TypingIndicator` — `{ threadId, userId }`

**Offline idempotency:** `clientMessageId` UNIQUE per `(thread_id, client_message_id)`. Re-posting returns existing message (200) without duplication.
**DPDP:** `SenderUserId` set to NULL on erasure; `AnonymizationReason = 'DPDP_USER_ERASURE'`. ThreadParticipant soft-deleted. DB triggers block hard-delete.
**Redis presence:** `presence:{userId}` key with 30s TTL.

---

## SubscriptionService (Phase 6F)

> Base URL: Aspire-assigned (typically port 5015 locally).
> Rate limit: standard 100 req/min per user.
> **Mock-backed routes:** Razorpay webhook endpoint does no real payment processing; `RAZORPAY_WEBHOOK_SECRET` required for HMAC verification.

| Method | Route | Auth | Permission | Description | Request Body | Response |
|--------|-------|------|-----------|-------------|-------------|----------|
| GET | /subscriptions/plans | Required | — | List active subscription plans | — | `[{ planId, name, tier, billingCycle, priceInr, trialDays, isActive }]` 200 |
| POST | /subscriptions/plans | Required | `subscription.plan.create` | Create plan (admin) | `{ name, tier, billingCycle, priceInr, trialDays?, description? }` | `{ planId, name, priceInr }` 201 |
| PUT | /subscriptions/plans/{id} | Required | `subscription.plan.update` | Update plan | `{ name, priceInr, description?, isActive }` | 204 |
| GET | /subscriptions/me | Required | — | Get current org subscription | — | `{ subscriptionId, planId, planName, planTier, billingCycle, priceInr, status, currentPeriodStart, currentPeriodEnd, createdAt }` 200; **404** `{ code: "Subscription.NotFound", message }` when no subscription (CONTRACT-GAPS task #27, item 3) |
| POST | /subscriptions | Required | — | Subscribe org to plan | `{ planId, razorpaySubscriptionId?, razorpayCustomerId? }` | `{ subscriptionId, status, currentPeriodEnd }` 201 |
| POST | /subscriptions/{id}/cancel | Required | — | Cancel subscription | — | 204 |
| POST | /subscriptions/{id}/upgrade | Required | — | Upgrade to higher-tier plan | `{ newPlanId }` | `{ subscriptionId, newPlanId }` 200 |
| POST | /subscriptions/{id}/downgrade | Required | — | Downgrade to lower-tier plan | `{ newPlanId }` | `{ subscriptionId, newPlanId }` 200 |
| GET | /subscriptions/invoices | Required | — | List invoices for org | `?page&pageSize` | `[{ invoiceId, invoiceNumber, amountInr, gstAmountInr, status, paidAt }]` 200 |
| POST | /subscriptions/{id}/invoices | Required | — | Generate invoice for subscription period | — | `{ invoiceId, invoiceNumber, amountInr, gstAmountInr, pdfGcsUri }` 201 |
| POST | /subscriptions/{id}/payments | Required | — | Record Razorpay payment and renew subscription | `{ razorpayPaymentId, invoiceNumber, amountInr, newPeriodEnd }` | 204 |
| GET | /subscriptions/mrr | Required | `subscription.plan.create` | MRR dashboard (admin) | — | `{ totalMrr, activeCount, trialingCount, pastDueCount, cancelledCount }` 200 |
| PUT | /subscriptions/razorpay-config | Required | `subscription.config.write` | Update Razorpay API credentials | `{ keyId, keySecret }` | 204 |
| POST | /webhooks/razorpay | No JWT (HMAC-SHA256) | — | Razorpay event webhook (SEC-051) | Razorpay JSON payload | 200 |

**GET /subscriptions/me — null vs 404 contract (CONTRACT-GAPS task #27, item 3):**
- **200** when an active (or cancelled/past-due) subscription exists.
- **404** `{ code: "Subscription.NotFound", message: "This organisation has no active subscription." }` when the org has no subscription (free tier / never subscribed). Clients must treat 404 as "no subscription" — NOT as an error.
- Mobile client (`mobile/src/api/subscriptions.ts`): already handles 404 → null.
- Admin client (`src/admin/src/lib/subscriptionApi.ts`): should catch 404 and treat as no-subscription state (empty body / null result).

**Webhook header:** `X-Razorpay-Signature` (HMAC-SHA256 verified).
**Plan tiers:** Free=0, Starter=1, Growth=2, Enterprise=3.
**Billing cycles:** Monthly=1, Quarterly=3, Annual=12 (used for MRR normalization).
**GST on SaaS:** 18% (CGST 9% + SGST 9%). Stored as `decimal` INR — never float.
**State machine:** `TRIALING → ACTIVE → PAST_DUE → CANCELLED | PAUSED`.
**Anonymization columns** (subscription.subscription): `anonymized_at`, `anonymization_reason` — pending migration 067; Ignored in EF until that migration is applied.

---

## ReportService (Phase 6C/6F)

> Base URL: Aspire-assigned (typically port 5017 locally).
> Rate limit: standard 100 req/min per user.

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /reports/generate | Required | Enqueue and synchronously generate a report | `{ reportType, format, financialYear, periodStart, periodEnd, loanApplicationId? }` | `{ jobId, status, gcsUri }` 201 |
| GET | /reports | Required | List report jobs for org | `?page&pageSize` | `{ items:[{jobId,reportType,format,status,createdAt}], totalCount }` 200 |
| GET | /reports/{id} | Required | Get report job detail | — | `{ jobId, reportType, format, status, gcsUri, sha256HashHex, pageCount, errorMessage }` 200 |
| GET | /reports/{id}/download-url | Required | Get signed GCS download URL (15 min TTL) | — | `{ url, expiresAt }` 200 |
| POST | /reports/{id}/share-link | Required | Generate signed GCS URL for CA/bank (15 min TTL) | — | `{ url, expiresAt }` 200 |

**Report types:** TrialBalance, ProfitAndLoss, BalanceSheet, CashFlow, TaxLiability, LedgerByAccount, LoanPackage.
**Formats:** Pdf, Json.
**PDF engine:** QuestPDF Community License. Fonts: Inter (Latin), Noto Sans Devanagari (Hindi), Noto Sans Bengali.
**SHA-256 integrity:** Each generated PDF stores its hex digest in `ReportJob.Sha256HashHex` for tamper detection.
**SEC-046:** Share-link TTL capped at 15 minutes; IDOR-scoped to org.

---

## AiService (P7a — GAP-030)

> Base URL: Aspire-assigned (typically port 5019 locally).
> Rate limit: 20 req/min per user (AI fixed window — SEC-011).
> **[MOCK-DEFAULT]** All AI calls use MockAiProvider in local/CI (no GCP credentials required).
> Real providers activated via admin AI config at `GET /auth/config/ai/effective`.

### Implemented (P7a)

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /ai/extract | Required | Invoice/document field extraction [MOCK-DEFAULT] | `{ documentId?, rawText?, featureCode? }` | `{ fields:{…}, confidence, provider, model, latencyMs }` 200 |
| POST | /ai/chat | Required | Org-scoped RAG Q&A, Indic-locale support [MOCK-DEFAULT] | `{ message, organizationId?, sessionId?, locale?, topK? }` | `{ answer, sourceChunkCount, provider, model, latencyMs }` 200 |

**POST /ai/extract notes:**
- Either `documentId` OR `rawText` must be provided. When only `documentId` is given, `rawText` is required in P7a (DocumentService text retrieval is P7b).
- `featureCode` defaults to `"invoice_extract"`. Admin overrides resolved from `admin_ai_feature_overrides` (migration 048).
- SEC-AI-01: PAN, Aadhaar, and card numbers are redacted from `rawText` before any provider call.
- Expected latency: mock ~5ms; vertex/gemini 1000–3000ms.
- Input limit: rawText ≤ 50,000 characters (token cost guardrail).

**POST /ai/chat notes:**
- `organizationId` can come from JWT `org_id` claim or body field.
- `Accept-Language` header drives Indic routing (hi, ta, te, kn, ml, mr, bn, gu, pa, or, as → Sarvam AI).
- Degrades gracefully when no embeddings exist: returns `sourceChunkCount: 0` with a helpful message.
- Daily token budget: 100,000 tokens/org/day (local ledger; P7b: wire SubscriptionService metering).
- Budget exceeded → HTTP 429 with `code: "Ai.DailyBudgetExceeded"`.
- `topK` range: 1–10.
- Expected latency: mock ~15ms; vertex 2000–5000ms with HNSW retrieval.

### Stubs (P7b roadmap)

| Method | Route | Status | Roadmap |
|--------|-------|--------|---------|
| POST | /ai/chat/{sessionId}/message | **501 — P7b** | Session continuation, conversation history entity |
| POST | /ai/documents/{documentId}/embed | **501 — P7b** | On-demand re-embed trigger (RAG ingestion currently auto via Pub/Sub) |
| POST | /ai/search | **501 — P7b** | Standalone semantic search API (retrieval currently internal to /ai/chat) |
| POST | /ai/tax-advice | **501 — GAP-108 P7b** | GST notice reply draft via AI (delivery order §4) |

### RAG Ingestion Worker (background, no direct endpoint)

- Topic: `snapaccount.document.ocr.completed`
- Subscription: `ai-service-rag-sub` (separate from `accounting-service-ocr-sub` on same topic)
- Triggered when: DocumentService approves a document and includes `ocrText` in the Pub/Sub payload
- Pipeline: chunk (512-token target, 64-token overlap) → embed (MockAiProvider / Vertex text-embedding-005) → upsert `ai.chunks` + `ai.embeddings`
- Idempotent: re-ingesting a document replaces existing chunks

**RAG pipeline:** Chunk size 512 tokens, 64 token overlap. Embedding stored as `float4[]` in P7a; pgvector `vector(768)` + HNSW index after db-engineer applies DDL handoff.
**Token guardrail:** Requests exceeding configurable max token budget are rejected with 429.

---

## Phase 7 — Document Operator Review Loop (Task B15/NEW-D03)

**Service:** DocumentService (`:5047`)
**Permission required:** `document.review` (approve / reject / request-clarification); `document.archive`
**Rate limit:** Standard — 100 req/min per user

### Document Review Decision Endpoints

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /documents/{id}/approve | Approve document; publishes `snapaccount.document.ocr.completed` to accounting pipeline | — | `{ message: "Document approved." }` 200 |
| POST | /documents/{id}/reject | Reject document with mandatory reason | `{ reason: string (required, ≤2000 chars) }` | `{ message: "Document rejected." }` 200 |
| POST | /documents/{id}/request-clarification | Request more info from document owner (status unchanged) | `{ message: string (required, ≤2000 chars) }` | `{ message: "Clarification request recorded." }` 200 |
| POST | /documents/{id}/archive | Archive document (status → ARCHIVED, idempotent) | — | `{ message: "Document archived." }` 200 |

### State Transitions

```
UPLOADED → OCR_IN_PROGRESS → OCR_COMPLETE ─┬→ APPROVED (via /approve)
                                  IN_REVIEW ─┘
                                            └→ REJECTED (via /reject)
Any non-terminal ────────────────────────────→ REJECTED (via /reject)
Any status ──────────────────────────────────→ /request-clarification (status unchanged)
APPROVED / OCR_COMPLETE / IN_REVIEW / etc. ──→ ARCHIVED (via /archive)
```

**Terminal statuses:** `APPROVED`, `ARCHIVED` — cannot be rejected; approve is idempotent.

### Approve semantics

- Valid inbound statuses: `OCR_COMPLETE`, `IN_REVIEW`
- Idempotent: second call on already-APPROVED doc returns 200 without re-emitting the accounting event
- On success: publishes `OcrCompletedPayload` to `snapaccount.document.ocr.completed` Pub/Sub topic
- Permission: `document.review`

### Notification events

| Trigger | Event code | Note |
|---------|------------|------|
| Approve | `DOC_APPROVED` | Already in 26-event catalog (Push, InApp channels) |
| Request Clarification | `DOC_CLARIFICATION_REQUESTED` | Proposed event — future NotificationService catalog update |

### DDL handoff

No schema changes required for document review. Columns `rejection_reason`, `approved_by`, and `approved_at` are new fields on `document.document` table — migration `AddDocumentReviewFields` required.
**Columns to add:**
- `rejection_reason text null`
- `approved_by uuid null`
- `approved_at timestamptz null`

---

## Phase 7 — Task #5: MCA Edit-Log Auditor Endpoints (AccountingService)

**Service:** AccountingService (`:5103`)
**Permission required:** `accounting.editlog.read`
**Rate limit:** Standard — 100 req/min per user
**Compliance:** MCA Companies (Accounts) Rules, 2014 Rule 3(5)/(6); migration 071 (GAP-100)

### Edit-Log Read Endpoints

| Method | Route | Description | Query Params | Response |
|--------|-------|-------------|-------------|----------|
| GET | /accounting/edit-log | Paginated list of statutory edit-log entries for caller's org | `fyYear` (YYYY-YY, optional), `entityType` (optional), `page` (default 1), `pageSize` (default 50, max 200) | `EditLogPageDto` 200 |
| GET | /accounting/edit-log/export | Download full FY edit log as CSV stream (auditor export) | `fyYear` (YYYY-YY, required) | `text/csv` download 200 |

#### EditLogPageDto Response Shape

```json
{
  "page": 1,
  "pageSize": 50,
  "totalCount": 123,
  "items": [
    {
      "id": "uuid",
      "entityType": "journal_entry",
      "entityId": "uuid",
      "operation": "UPDATE",
      "changedBy": "user-uuid",
      "changedAt": "2026-04-01T10:30:00Z",
      "fyYear": "2026-27",
      "changeReason": "GST reconciliation",
      "requestId": "req-id",
      "beforeState": "{...}",
      "afterState": "{...}",
      "retentionUntil": "2034-04-01"
    }
  ]
}
```

#### Notes

- All rows are **org-scoped**: `OrgId` is enforced in the query handler; no cross-org leakage.
- Valid `entityType` values: `journal_entry`, `journal_entry_line`, `ledger_entry`, `account`, `ledger`.
- `fyYear` format: `YYYY-YY` (e.g., `2026-27`). Invalid formats return 400.
- CSV export streams all rows for the FY; intended for annual statutory audit handoff.
- **GUC wiring:** `McaEditLogGucInterceptor` (SaveChangesInterceptor) sets `SET LOCAL app.current_user_id` on every accounting write transaction — the DB trigger reads this to populate `changed_by` in `accounting.edit_log`.
- **Permission seeding:** `INSERT INTO auth.permissions (code, description) VALUES ('accounting.editlog.read', 'View MCA statutory edit log (GAP-100).') ON CONFLICT (code) DO NOTHING;`
- **DDL:** No new DDL from application — `accounting.edit_log` table and trigger are in migration 071 (db-engineer owned). Audit rows are written by DB trigger only; application is read-only on this table.

---

## Phase 7 — Task #14: IT Act 2025 Version Awareness (ItrService)

**Service:** ItrService (`:5106`)
**Migration:** 072 (GAP-102) — adds `act_version VARCHAR(20)` + `tax_year VARCHAR(10)` to `itr.tax_slab_versions` and `itr.deduction_sections`

### Behavior Change

No API surface change — this is a resolver upgrade within `GetTaxSlabsQuery` and `GetDeductionCatalogQuery`.

**Resolution rule:**
- AY < `AY2026-27` → always resolve `IT_ACT_1961`
- AY >= `AY2026-27` → try `IT_ACT_2025` rows first; if none seeded, fall back to `IT_ACT_1961` with a warning log (no error surfaced to caller)

### Response DTO additions

`GET /itr/tax-slabs?assessmentYear=AY2026-27&regime=NEW` now includes:

```json
{
  "actVersion": "IT_ACT_1961",
  "taxYear": "2026-27"
}
```

`GET /itr/deduction-catalog?assessmentYear=AY2026-27` now includes:

```json
{
  "actVersion": "IT_ACT_1961",
  "sections": [
    { "actVersion": "IT_ACT_1961", ... }
  ]
}
```

#### Notes

- Existing behaviour is unchanged until 2025-Act slab rows are seeded (forward-compatible).
- `ResolveTargetActVersion(string ay)` is a `public static` method on both handler classes — callable from tests and future planning tools without handler instantiation.
- `TaxComputationEngine` uses the same lexicographic rule.

---

## Phase 7 — Task #15: ChatService SendMessage Idempotency

**Service:** ChatService (`:5109`)
**Migration:** 057 — `chat.messages.client_message_id VARCHAR(128)` column + unique partial index `uq_messages_thread_client_msg_id` on `(thread_id, client_message_id) WHERE client_message_id IS NOT NULL`

### Updated Endpoint

`POST /chat/threads/{threadId}/messages` — request body now accepts `clientMessageId`:

```json
{
  "body": "Hello",
  "attachmentsJson": null,
  "clientMessageId": "offline-uuid-or-device-key"
}
```

**Response:** `SendMessageResponse` — unchanged shape, but now echoes `clientMessageId`:

```json
{
  "messageId": "server-uuid",
  "threadId": "uuid",
  "body": "Hello",
  "clientMessageId": "offline-uuid-or-device-key",
  "sentAt": "2026-06-11T10:00:00Z"
}
```

#### Idempotency semantics

| Scenario | Behaviour |
|----------|-----------|
| `clientMessageId` provided, message not yet persisted | Normal insert — new `messageId` returned |
| `clientMessageId` provided, message already persisted for this `(threadId, clientMessageId)` | Returns existing `messageId` — no duplicate row. HTTP 200 (not 409). |
| `clientMessageId` is `null` or empty | No idempotency check — new message created each call |

- `clientMessageId` max length: 128 chars. Longer values → 400.
- Unique partial index on `(thread_id, client_message_id) WHERE client_message_id IS NOT NULL` is declared in `ChatMessageConfiguration.cs` (migration 057) — no new DDL needed.

---

## Cross-Cutting Notes

### Rate Limits

| Policy | Limit | Applied To |
|--------|-------|-----------|
| `standard` | 100 req/min per user (fixed window) | All standard endpoints |
| `ai` | 20 req/min per user (fixed window) | `/ai/*`, `/itr/filings/{id}/compute`, `/itr/filings/{id}/compare-regimes`, `/itr/filings/{id}/form16` |
| `otp` | 5 req / 10 min per IP (sliding window) | `/auth/otp/send`, `/auth/otp/verify`, `/auth/social/firebase`, `/auth/password/forgot`, `/auth/password/reset` |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEV_AUTH_BYPASS` | `false` | Bypass Firebase JWT validation in local dev (never in prod) |
| `DB_PASSWORD` | (via user-secrets) | PostgreSQL password (`#{DB_PASSWORD}#` placeholder in appsettings) |
| `GST_PRODUCTION_APIS_ENABLED` | `false` | Real GSTN/IRP/EWB APIs (mock-default) |
| `KYC_PROVIDER` | `mock` | KYC adapter: `mock`, `sandbox`, `uidai` |
| `RAZORPAY_WEBHOOK_SECRET` | (via Secret Manager) | Razorpay webhook HMAC secret |
| `ENCRYPTION_KEY` | (derived dev key) | AES-256-CBC key for TOTP secret storage |
| `SendGrid:ApiKey` | (none) | SendGrid for password-reset emails |
| `App:BaseUrl` | `http://localhost:3000` | Password reset link base URL |
| `REDIS_CONNECTION_STRING` | `localhost:6379` | Redis for distributed cache / presence |

---

## Wave 6 Backend Batch #38 (2026-06-11)

Items: GAP-014, GAP-041, GAP-013, GAP-015, GAP-053, GAP-022, GAP-045, GAP-PCI-01, GAP-PCI-02, GAP-036, GAP-038/052.

### DocumentService — OCR Feedback Write-Path (GAP-014)

> Service: DocumentService (port Aspire-assigned). Gate: `document.review` permission.
> Rate limit: standard (100 req/min). Latency note: DB write only, no AI call.

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| POST | /documents/{id}/ocr-feedback | Required | Submit operator correction for an OCR-extracted field | `{ ocrFieldId: uuid, issueType: "WRONG_VALUE"\|"MISSING_FIELD"\|"WRONG_FIELD"\|"ILLEGIBLE"\|"FORMATTING_ERROR"\|"OTHER", notes?: string }` | `{ feedbackId, createdAt }` 200 |
| GET | /documents/admin/ocr-accuracy | Required | Aggregated OCR feedback accuracy metrics (admin view) | — | `{ totalFeedbacks, byIssueType: {...}, last30DaysTrend: [...] }` 200 |

Notes:
- `ocrFieldId` must belong to the document identified by `{id}` — IDOR-guarded.
- `notes` is required when `issueType == "OTHER"`, max 2000 chars.
- `ErrorType.NotFound` returned as 404 if document or OCR field not found.

### DocumentService — Document Tags (GAP-015)

> Gate: `document.write` (add/remove), `document.read` (list). IDOR-scoped to caller's org.

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /documents/{id}/tags | Required | List tags on a document | — | `[{ tagId, name, createdAt }]` 200 |
| POST | /documents/{id}/tags | Required | Add a tag to a document (idempotent) | `{ name: string }` | `{ tagId, name, createdAt }` 200 |
| DELETE | /documents/{id}/tags/{tagId} | Required | Remove a tag from a document (idempotent) | — | 204 |

Notes:
- Tag name max 100 chars.
- Adding an already-present tag returns 200 with the existing tag (idempotent, no duplicate row created).
- Removing a non-existent tag returns 204 (idempotent).

### DocumentService — Document SLA Tracking (GAP-013)

Already-surfaced via the document review loop (Task B15). The `document_slas` table (migration added with B15) stores `due_at`, `breached_at`, `priority` per document. No new API surface in Wave 6 (surfaced via existing review-loop endpoints).

### GstService — Tax Rate CRUD (GAP-022)

> Service: GstService. Gate: `gst.tax-rate.manage` (write), `gst.tax-rate.read` (read).
> Tax rates are effective-dated: a new rate supersedes the current one; old row gets `valid_to` set.
> Never hardcode rates — always load from this table.

| Method | Route | Auth | Description | Request Body | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /gst/tax-rates | Required | List all tax rates (optionally filter by active) | `?activeOnly=true` | `[{ id, rateName, ratePct, cgstPct, sgstPct, igstPct, cessPct, validFrom, validTo, isActive, notes }]` 200 |
| GET | /gst/tax-rates/effective | Required | Get the currently-effective rate by name | `?rateName=GST_18` | `{ id, rateName, ratePct, cgstPct, sgstPct, igstPct, cessPct, validFrom, notes }` 200 / 404 |
| POST | /gst/tax-rates | Required | Create a new tax rate (terminates prior active same-name rate) | `{ rateName, ratePct, cgstPct, sgstPct, igstPct, cessPct?, validFrom, notes? }` | `{ id, rateName, validFrom }` 201 |
| DELETE | /gst/tax-rates/{id}/deactivate | Required | Soft-deactivate a tax rate (sets `is_active=false`) | — | 204 |

Notes:
- `ratePct` standard values: 0, 5, 12, 18, 28 — enforced by constraint, not hardcoded in code.
- `cgstPct` = `sgstPct` = `ratePct / 2` for intra-state; `igstPct` = `ratePct` for inter-state.
- `validFrom` defaults to `UtcNow` if not supplied.
- Deactivate is idempotent; deactivating an already-inactive rate returns 204.

### NotificationService — WhatsApp Adapter (GAP-045)

No new public API route. Feature-flag controlled at dispatch: `WhatsApp:Enabled = true|false` in config.
When disabled, dispatches return a "WHATSAPP_DISABLED" status without HTTP call. No consumer-facing change.

### SubscriptionService — Admin Subscriber List (GAP-036)

> Service: SubscriptionService. Gate: `subscription.plan.create` permission (same as MRR dashboard).
> Rate limit: standard. Pagination: page/pageSize (max 100).

| Method | Route | Auth | Description | Query Params | Response |
|--------|-------|------|-------------|-------------|----------|
| GET | /subscriptions/admin/list | Required | Paginated platform-admin view of all org subscriptions | `?page=1&pageSize=25&status=Active&tier=Pro` | `{ items: [SubscriberRowDto], totalCount, page, pageSize, totalPages }` 200 |

`SubscriberRowDto`:
```json
{
  "subscriptionId": "uuid",
  "organizationId": "uuid",
  "organizationName": "uuid-string (org name read-model pending)",
  "planId": "uuid",
  "planName": "string",
  "tier": "Free|Starter|Pro|Enterprise",
  "status": "Active|Trialing|PastDue|Canceled|Expired",
  "currentPeriodEnd": "ISO-8601",
  "razorpaySubscriptionId": "string|null",
  "mrr": "decimal (planPriceInr / billingCycleDays)",
  "createdAt": "ISO-8601"
}
```

Notes:
- `organizationName` currently returns the `organizationId` string until the AuthService org-name read-model ships.
- `status` and `tier` filters are string-equality matched against enum `ToString()`.

### AuthService — Aggregate Health (GAP-038/052)

> Service: AuthService (admin endpoints group). Gate: `admin.dashboard.read` permission.
> Fans out to all 12 services' `/healthz` endpoints in parallel (3-second per-service timeout).
> Rate limit: standard.

| Method | Route | Auth | Description | Response |
|--------|-------|------|-------------|----------|
| GET | /admin/health/aggregate | Required | Aggregated health status of all 12 services | `{ overall: "healthy"\|"degraded"\|"down"\|"unknown", services: [ServiceHealthResult], checkedAt: ISO-8601 }` 200 |

`ServiceHealthResult`:
```json
{
  "name": "auth-service",
  "status": "healthy|degraded|down|unknown",
  "statusCode": 200,
  "responseTimeMs": 42,
  "checkedAt": "ISO-8601"
}
```

Status derivation: all healthy → `"healthy"`, any `down` → `"down"`, any `degraded` → `"degraded"`, else `"unknown"`.
Services probed: `auth-service`, `document-service`, `accounting-service`, `gst-service`, `loan-service`, `itr-service`, `chat-service`, `notification-service`, `report-service`, `subscription-service`, `ai-service`, `callback-service`.

### Guards / Security (GAP-041, GAP-053, GAP-PCI-01, GAP-PCI-02)

No new public API routes. Internal changes:
- **GAP-041** (LoanService): `ILoanPdfGenerator` registered as dev-only stub; non-Development environments throw `InvalidOperationException` at resolve with code `GAP-041`.
- **GAP-053** (GcpStartup): GCP service registrations emit `Console.Error.WriteLine` warning when feature flag disabled, instead of silently no-op.
- **GAP-PCI-01**: `VerifyWebhookSignature` removed from `IRazorpayClient` interface and both implementations; constant-time HMAC verification lives exclusively in `RazorpayWebhook.cs` (not exposed to Application layer).
- **GAP-PCI-02** (SubscriptionService): `MockRazorpayClient` registered as dev-only; non-Development environments throw at resolve with code `GAP-PCI-02`.

---

### Indian Compliance

- **GST rates:** 0%, 5%, 12%, 18%, 28% — always loaded from DB config, never hardcoded
- **Tax slabs:** Old/New regime — versioned with `effective_date`; pinned per filing via `tax_slab_version_id`
- **PAN format:** `XXXXX9999X` — validated by `PanNumberValidator` (FluentValidation reusable rule)
- **GSTIN format:** 15-character — validated by `GstinNumberValidator`
- **Aadhaar:** OTP-based verification only; last 4 digits stored (`AadhaarLastFour` value object)
- **DPDP Act 2023:** Right-to-erasure subscribers on all 12 services; data localization (India); consent management at `/auth/me/consents`
- **E-invoicing:** Mandatory for turnover > 5 Crore — enforced before `/gst/e-invoices` call
- **Document retention:** 7 years minimum at GCS layer; DB trigger prevents consent hard-delete (`trg_consents_no_delete`)
- **Financial values:** All monetary amounts as `decimal` INR — never `float`/`double`

---

## Wave 7A — Chat/Report/Notification

**Branch:** `2026-06-10-s5t4` | **Migrations:** 080, 081 | **GAPs:** 031, 032, 037, 043

### GAP-031: CA Appointments (ChatService)

Base URL: `http://localhost:5103` (via Aspire: `chat-service`)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| POST | `/appointments/slots` | Required | `chat.slots.manage` | Create a CA availability slot |
| GET | `/appointments/slots` | Required | — | List available slots (query: `caProfileId`, `date`) |
| POST | `/appointments` | Required | `chat.appointments.book` | Book an appointment (reserves slot, generates meet link, raises AppointmentBookedEvent) |
| GET | `/appointments` | Required | `chat.appointments.book` | List org appointments (query: `status`, `page`, `pageSize`) |
| POST | `/appointments/{id}/reschedule` | Required | `chat.appointments.book` | Reschedule (≥2h rule enforced) |
| POST | `/appointments/{id}/cancel` | Required | `chat.appointments.book` | Cancel (≥2h rule; `Error.Validation` if within window) |
| POST | `/appointments/{id}/rate` | Required | `chat.appointments.book` | Rate completed appointment (1–5 stars, once per appointment; updates CA aggregate) |

**Request/Response notes:**
- `BookAppointment` → 201 `{ appointmentId, slotId, meetLink, slotStartUtc, slotEndUtc, status }`
- `Cancel` within 2h → 400 `{ code: "Appointment.TooLateToCancel" }`
- `Reschedule` within 2h → 400 `{ code: "Appointment.TooLateToReschedule" }`
- `Rate` on non-completed → 400; second rate attempt → 409 `{ code: "Appointment.AlreadyRated" }`
- `BookAppointment` publishes `AppointmentBookedEvent` to Pub/Sub for reminder scheduling

**Meeting link provider:** `IMeetingLinkProvider` — default `MockMeetingLinkProvider` (deterministic fake `https://meet.google.com/snap-{appointmentId:short}`). Set `MeetingLink:Provider=GoogleCalendar` to activate real provider (requires `GoogleCalendar:*` secrets in Secret Manager).

**New permissions seeded (migration 080):**
- `chat.appointments.book` → SUPER_ADMIN, ORG_ADMIN, ORG_MEMBER
- `chat.slots.manage` → SUPER_ADMIN, ORG_ADMIN

### GAP-043: Message Bookmarks (ChatService)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| POST | `/appointments/bookmarks/toggle` | Required | `chat.read` | Toggle bookmark on a message (create or soft-delete) |
| GET | `/appointments/bookmarks` | Required | `chat.read` | List current user's bookmarks (paginated, joined with message body) |

**Request/Response notes:**
- `ToggleBookmark` → `{ messageId, isBookmarked, bookmarkId? }` (200 for both on/off)
- `ListBookmarks` query params: `page` (default 1), `pageSize` (default 20, max 100)
- Bookmark uniqueness enforced by partial UNIQUE index: `(user_id, message_id) WHERE deleted_at IS NULL`

### GAP-032: Tally XML Export (ReportService)

Base URL: `http://localhost:5105` (via Aspire: `report-service`)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| POST | `/reports/tally-export` | Required | `reports.generate` | Generate Tally-importable XML (or CSV fallback) for org + date range |

**Request body:** `{ periodStart?: DateTime, periodEnd?: DateTime }`
**Response:** `{ jobId, status, gcsUri, sha256HashHex, pageCount }` — async job pattern; GCS URI for download.

**Feature flag:** `Report:TallyExportEnabled=true` in config/Secret Manager. When `false` (default), returns CSV with columns: `Date, VoucherType, ReferenceNumber, DebitLedger, CreditLedger, Amount, Narration`.

**Tally XML structure:** `ENVELOPE → HEADER (VERSION/TALLYREQUEST/TYPE/SUBTYPE) + BODY → IMPORTDATA (Masters: LEDGER per account) + IMPORTDATA (Vouchers: VOUCHER per journal entry)`. Currency: `INR`. Double-entry: each voucher has two `ALLLEDGERENTRIES.LIST` (debit: `ISDEEMEDPOSITIVE=Yes`, credit: `ISDEEMEDPOSITIVE=No`).

**Cross-schema reads:** `accounting.chart_of_accounts` + `accounting.journal_entries` via raw Npgsql (read-only, same DB, no EF coupling).

### GAP-043: Chat Thread PDF Export (ReportService)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| POST | `/reports/chat-thread-pdf` | Required | `reports.generate` | Export a chat thread as PDF |

**Request body:** `{ threadId: Guid }`
**Response:** `{ jobId, status, gcsUri, sha256HashHex, pageCount }`

**IDOR guard:** verifies `chat.threads.organization_id` matches calling user's org before reading messages.
**QuestPDF output:** header (org name, thread subject, export date) + per-message blocks (timestamp, sender role, body). License: `LicenseType.Community`.
**Cross-schema reads:** `chat.threads` + `chat.messages` via raw Npgsql.

### GAP-037: Notification Template Manager (NotificationService)

Base URL: `http://localhost:5109` (via Aspire: `notification-service`)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| GET | `/notifications/templates` | Required | `notification.templates.manage` | List templates (query: `eventCode`, `channel`, `locale`, `page`, `pageSize`) |
| GET | `/notifications/templates/{id}` | Required | `notification.templates.manage` | Get template detail (includes extracted placeholder names) |
| POST | `/notifications/templates` | Required | `notification.templates.manage` | Create template → 201 (retires previous current for same event+channel+locale) |
| PUT | `/notifications/templates/{id}` | Required | `notification.templates.manage` | In-place update (body, subject, DLT template ID, sender name) |
| DELETE | `/notifications/templates/{id}` | Required | `notification.templates.manage` | Soft-delete template |
| POST | `/notifications/templates/{id}/test-send` | Required | `notification.templates.manage` | Test-send to calling admin only; returns rendered body + missing variable warnings |

**Request/Response notes:**
- `CreateTemplate` body: `{ eventCode, channel (Push|Sms|Email|InApp), locale (en|hi|bn), body, subject?, dltTemplateId?, senderName?, name? }` → `{ templateId, code, replacedPrevious }`
- `GetTemplate` includes `placeholderNames: string[]` (extracted `{{tokens}}` from body+subject)
- `TestSend` body: `{ variables: Record<string,string>, recipientEmail?, recipientPhone? }` → `{ templateId, renderedBody, missingVariables, channelsAttempted, status }`
- Missing variables are substituted with `[MISSING:varName]` in rendered body
- Versioning: `Retire()` sets `IsCurrent=false` + `EffectiveTo=today`; dispatch always queries `IsCurrent=true`

**New permission seeded (migration 081):**
- `notification.templates.manage` → SUPER_ADMIN only

**Migration 081 side effect:** backfills `effective_from = '2024-04-01'` for pre-existing template rows with NULL `effective_from` (required by non-nullable EF mapping).

### New Domain Entities (migration 080)

| Table | Schema | Description |
|-------|--------|-------------|
| `ca_profiles` | `chat` | CA staff metadata, rating aggregate (NUMERIC(3,2)), availability flag |
| `appointment_slots` | `chat` | CA availability windows, CHECK(end_utc > start_utc) |
| `appointments` | `chat` | Bookings; status CHECK IN ('DRAFT','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW') |
| `message_bookmarks` | `chat` | Per-user message bookmarks; UNIQUE(user_id, message_id) WHERE deleted_at IS NULL |

All tables: UUID PKs, `created_by`/`updated_by` UUID (not TEXT), `set_updated_at` trigger, RLS enabled.

### Test Summary (Wave 7A)

| Suite | Unit | EfSmoke | Total |
|-------|------|---------|-------|
| ChatService.Tests | 50 | 12 | 62 |
| NotificationService.Tests | 80 | 9 | 89 |
| ReportService.Tests | 28 | 0 | 28 |
| **Total** | **158** | **21** | **179** |

All tests green vs live PostgreSQL 17 (`localhost:5432/snapaccount`).

---

### Wave 7A addendum — CA residuals

**Service**: ChatService (`:5107`)
**Migration**: `085_chat_ca_availability_rules.sql`

#### New endpoints

| Method | Route | Permission | Description |
|--------|-------|-----------|-------------|
| GET | `/appointments/ca-profiles` | `chat.appointments.book` | List CA profiles (activeOnly=true default, paginated). Replaces `/auth/admin/team-members?role=CA` workaround. Response: `{ items: [{ caProfileId, userId, displayName, bio, specialisations, averageRating, ratingCount, isActive, createdAt }], totalCount, page, pageSize }` |
| POST | `/appointments/{id}/cancel-by-ca` | `chat.slots.manage` | CA-initiated cancel — no 2h rule. Body: `{ reason: string }`. Marks `cancelledByCa=true`, fires `AppointmentCancelledByCaEvent` (NotificationService push to user). Response: `{ appointmentId, status, cancelledByCa }` |
| POST | `/appointments/availability-rules` | `chat.slots.manage` | Create recurring weekly rule. Body: `{ weekday (0–6), startTimeIst, endTimeIst, slotDurationMinutes (15–480), effectiveFrom, effectiveTo? }`. Response: `{ ruleId, caProfileId, weekday, startTimeIst, endTimeIst, slotDurationMinutes, effectiveFrom, effectiveTo, isActive, createdAt }` |
| GET | `/appointments/availability-rules` | `chat.slots.manage` | List rules for a CA. Query: `?caProfileId=&activeOnly=true`. |
| DELETE | `/appointments/availability-rules/{id}` | `chat.slots.manage` | Soft-delete (deactivate) a rule. Does NOT delete already-generated slots. |
| POST | `/appointments/availability-rules/generate` | `chat.slots.manage` | On-demand slot generation from active rules. Body: `{ caProfileId?, weeksAhead? (1–52, default 4) }`. Idempotent. Response: `{ caProfileId, rulesProcessed, slotsCreated, slotsSkipped }` |

#### Domain changes

- `Appointment.CancelByCa(reason)` — new domain method, bypasses 2h rule, raises `AppointmentCancelledByCaEvent`
- `Appointment.CancelledByCa` (bool) + `Appointment.CaCancellationReason` (string?) — new properties, migration 085 columns
- `CaAvailabilityRule` — new domain entity: `(weekday, startTimeIst, endTimeIst, slotDurationMinutes, effectiveFrom, effectiveTo, isActive)`
- `AppointmentSlot.CreateFromRule(...)` — new public factory, bypasses "must be future" guard (caller has already checked)

#### Hangfire recurring job

`GenerateSlotsFromRulesJob` — weekly, every **Sunday 01:00 IST** (Saturday 19:30 UTC, cron `30 19 * * 6`).  
Generates 4-week slot horizon for all CAs with active rules. Idempotent: skips existing slots.  
Registered via `app.Lifetime.ApplicationStarted` (same pattern as `ImsDeemedAcceptanceJob` in GstService).

#### Infrastructure

- `ISlotGenerationService` / `SlotGenerationService` — shared generation logic used by both the command handler (HTTP) and the Hangfire job (system-level, bypasses PermissionBehavior)
- New EF config: `CaAvailabilityRuleConfiguration` (table `chat.ca_availability_rules`)

#### Migration 085 DDL handoff

| Object | Change |
|--------|--------|
| `chat.ca_availability_rules` | New table (uuid PK, `weekday`, `start_time_ist`/`end_time_ist` INTERVAL, `slot_duration_minutes`, `effective_from`/`effective_to` DATE, `is_active`, audit cols, RLS) |
| `chat.appointments.cancelled_by_ca` | New BOOLEAN column (DEFAULT FALSE) |
| `chat.appointments.ca_cancellation_reason` | New VARCHAR(1000) column (nullable) |

#### Test summary (Wave 7A addendum)

| Suite | New Unit | New EfSmoke | Total (suite) |
|-------|----------|-------------|---------------|
| ChatService.Tests | +29 | +6 | 79 unit + 17 EfSmoke |

All 79 unit + 17 EfSmoke tests green vs live PostgreSQL 17.

---

## Wave 7B — Loan/Accounting/Auth

Board #44 — GAP-044, GAP-047, GAP-051, GAP-110, Board-#42-polish.
Migrations: 082 (`loan.fraud_checks`), 083 (`auth.device_approval_requests`).

### GAP-110 — Fraud Pre-Submission Stage (LoanService)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| POST | `/loans/applications/{id}/fraud-check` | Firebase JWT | `loan.application.submit` | Run all 6 fraud checks before submission. FLAG → 200 with note; FAIL → 422 blocks submission. |
| GET | `/loans/applications/{id}/fraud-summary` | Firebase JWT | `loan.fraud.view` | Fraud check results for an application (operator/admin tier). IDOR: org-scoped. |

**POST /loans/applications/{id}/fraud-check request:**
```json
{ "applicantPan": "ABCDE1234F", "applicantPhone": "+919876543210", "deviceId": "android-abc", "bankAccountNumber": "1234567890", "ifscCode": "HDFC0001234", "declaredName": "Rajesh Kumar" }
```

**200 response (Pass/Flag):**
```json
{ "allPassed": false, "hasFlags": true, "fraudSummaryNote": "1 flag(s) detected: DuplicatePhone.", "checkResults": [...] }
```

**422 response (FAIL blocks):**
```json
{ "code": "FraudCheck.HardFail", "message": "Application blocked: DuplicatePan FAIL." }
```

**Checks:** DuplicatePan, DuplicatePhone, DuplicateDevice (cross-org counts only), VelocityPan, VelocityPhone (30-day rolling), PennyDrop (mock; real provider TL-gated).

**Config thresholds (`FraudCheck` section):** `VelocityPanFlagThreshold`=3, `VelocityPanFailThreshold`=5, `VelocityPhoneFlagThreshold`=3, `VelocityPhoneFailThreshold`=5, `VelocityWindowDays`=30, `DuplicatePanOrgThreshold`=2, `DuplicatePhoneOrgThreshold`=2, `PennyDropMinSimilarity`=0.80.

**New permission:** `loan.fraud.view` — granted to ORG_ADMIN, SUPER_ADMIN, OPERATIONS_MANAGER (migration 082).

---

### GAP-044 — Comparative Financial Analysis (AccountingService)

| Method | Route | Auth | Permission | Description |
|--------|-------|------|------------|-------------|
| GET | `/accounting/reports/comparative` | Firebase JWT | `accounting.reports.read` | YoY and MoM revenue/expense/profit by month over Indian FY. Chart-ready DTO. |

**Query params:** `orgId` (Guid, required), `baseYear` (int 2020–2100), `priorYear` (int, optional, default baseYear-1), `categoryFilter` (INCOME|EXPENSE|ASSET|LIABILITY, optional).

**Response shape:** `labels` (12 Apr–Mar strings), `baseRevenue[]`, `priorRevenue[]`, `baseExpense[]`, `priorExpense[]`, `baseProfit[]`, `priorProfit[]`, `yoYRevenueGrowth[]` (null when prior=0), `moMBaseRevenue[]` (null for April), `topMovers[]` (top 10 by absolute change).

Indian FY: April = period 1, March = period 12. No AI dependency — pure LINQ over `accounting.ledger_entries`.

---

### GAP-051 — Admin Web Token Security (AuthService)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/admin/login` | None | Browser login. Access token in body; `sa_admin_rt` httpOnly cookie. CSRF header required. |
| POST | `/auth/admin/refresh` | Cookie `sa_admin_rt` | Rotate refresh token. New access token in body; cookie rotated. CSRF header required. |
| POST | `/auth/admin/logout` | Cookie `sa_admin_rt` | Revoke + clear cookie. Idempotent. CSRF header required. |

**CSRF:** `SameSite=Strict` (primary) + `X-Requested-With: XMLHttpRequest` header (defence-in-depth). Missing header → 400. Mobile flow (POST /auth/refresh-token) **untouched**.

**Cookie:** `sa_admin_rt; HttpOnly; Secure; SameSite=Strict; Path=/auth/admin; Max-Age=604800`

**Token lifetimes:** Admin access = 1 hour; admin refresh = 7 days (both shorter than mobile for added security).

---

### GAP-047 — Old-Device Approval Backend (AuthService)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/auth/devices/pending-approvals` | Firebase JWT | List active (non-expired, non-resolved) device approval requests for current user. |
| POST | `/auth/devices/{id}/approve` | Firebase JWT | Approve new-device login from a different registered device. |
| POST | `/auth/devices/{id}/deny` | Firebase JWT | Deny new-device login. Revokes session when `DeviceApproval:Enforce=true`. |

**Trigger:** `POST /auth/devices` (AddDevice) — if user has ≥1 existing device, creates `DeviceApprovalRequest` (10-min expiry) and publishes `DeviceApprovalRequestedEvent` to `device-approval-requests` Pub/Sub topic (NotificationService pushes to existing devices, excluding new device).

**Soft-launch:** `DeviceApproval:Enforce=false` (default) = log/notify only, no session revocation on denial.

**Request (approve/deny):** `{ "reviewingDeviceEntityId": "uuid" }` — reviewing device must belong to authenticated user and differ from new device.

---

### Board #42 — RefreshContext 500 Fix (AuthService)

`POST /auth/token/refresh-context` — DEV_AUTH_BYPASS canned GUID previously returned HTTP 500 "User not found". Fixed: `NotFound` → 401 with message "Session user not found. Please sign in again."

---

### Migrations (Wave 7B)

| # | File | Tables | Notes |
|---|------|--------|-------|
| 082 | `082_loan_fraud_checks.sql` | `loan.fraud_checks` | Append-only fraud decision log; JSONB details; GIN index; `loan.fraud.view` permission. Idempotent. |
| 083 | `083_auth_device_approval_requests.sql` | `auth.device_approval_requests` | Pending device approval table; RLS via `app.current_user_id`; FKs to `auth.user` + `auth.user_device`. Idempotent. |

### Test Coverage (Wave 7B)

| Service | Tests | Notes |
|---------|-------|-------|
| LoanService | 166 pass | 9 EfSmoke incl. FraudCheck full-materialization |
| AuthService | 738 pass | 8 EfSmoke incl. DeviceApprovalRequest full-materialization |
| AccountingService | 60 pass | Comparative analysis validator, Indian FY label contract |

All EfSmoke tests run against live PostgreSQL 17 (`localhost:5432/snapaccount`) with migrations 082 + 083 applied and scratch-replayed (idempotent).

## Wave 7C — GST Notice Engine (GAP-108, migration 084)

Base URL: `http://localhost:5100` (GstService)
Auth: Firebase JWT required on all endpoints unless noted.

### New Endpoints

| Method | Route | Permission | Rate Limit | Description |
|--------|-------|-----------|------------|-------------|
| `PATCH` | `/gst/notices/{id}/form-type` | `gst.notices.update` | gst-write-strict (30/min) | Set CGST form-type (ASMT_10/DRC_01/01A/01B/01C/ADT_01/OTHER) + stamp statutory deadline |
| `GET` | `/gst/notices/{id}/deadline` | `gst.notices.read` | standard (100/min) | Get statutory + effective deadline, days-remaining, overdue flag, GSTAT backlog flag |
| `PATCH` | `/gst/notices/{id}/appeal-stage` | `gst.notices.update` | gst-write-strict (30/min) | Update GSTAT appeal stage (forward-only state machine); sets appeal deadline on ORDER_RECEIVED |
| `GET` | `/gst/notices/simulate-drc` | `gst.notices.read` | standard (100/min) | Pre-filing DRC-01B/01C simulator; returns wouldTrigger + mismatch lines |
| `GET` | `/gst/notice-deadline-rules` | `gst.notices.read` | standard (100/min) | List all active statutory deadline rules (FY-versioned config) |

### Changed Endpoints (additive, backward-compatible)

| Method | Route | Change |
|--------|-------|--------|
| `GET` | `/gst/notices` | Added query params: `formType`, `appealStage`, `gstatBacklogOnly`. Added response fields: `formType`, `statutoryDeadline`, `deadlineOverridden`, `appealStage`, `appealDeadline`, `isGstatBacklogFlagged` |
| `GET` | `/gst/notices/{id}` | Added response fields: `formType`, `statutoryDeadline`, `deadlineOverridden`, `daysRemaining`, `isOverdue`, `appealStage`, `appealDeadline`, `appealDaysRemaining`, `isGstatBacklogFlagged` |
| `POST` | `/gst/notices` | Added optional body field: `formType` (default: `OTHER`). Response now includes `formType`, `statutoryDeadline`, `effectiveDeadline` |

### PATCH /gst/notices/{id}/form-type

**Request body:**
```json
{
  "formType": "DRC_01B",
  "explicitDeadlineOverride": null
}
```

**Response:**
```json
{
  "noticeId": "uuid",
  "formType": "DRC_01B",
  "statutoryDeadline": "2026-01-14",
  "effectiveDeadline": "2026-01-14",
  "deadlineOverridden": false
}
```

### GET /gst/notices/{id}/deadline

**Response:**
```json
{
  "noticeId": "uuid",
  "formType": "DRC_01B",
  "noticeDate": "2026-01-07",
  "financialYear": "2025-26",
  "statutoryDeadline": "2026-01-14",
  "effectiveDeadline": "2026-01-14",
  "deadlineOverridden": false,
  "daysRemaining": -3,
  "isOverdue": true,
  "appealStage": "NONE",
  "appealDeadline": null,
  "appealDaysRemaining": null,
  "isGstatBacklogFlagged": false,
  "gstatBacklogDeadline": "2026-06-30"
}
```

### PATCH /gst/notices/{id}/appeal-stage

**Request body:**
```json
{
  "newStage": "ORDER_RECEIVED",
  "orderDate": "2026-03-01",
  "appealWindowDaysOverride": null
}
```
Valid stages (forward-only): `NONE` → `REPLY_FILED` → `ORDER_RECEIVED` → `APPEAL_FILED` → `GSTAT_PENDING` → `RESOLVED`

**Response:**
```json
{
  "noticeId": "uuid",
  "appealStage": "ORDER_RECEIVED",
  "appealDeadline": "2026-05-30",
  "isGstatBacklogFlagged": true
}
```

### GET /gst/notices/simulate-drc

**Query params:** `orgId` (required), `formType` (DRC_01B|DRC_01C), `fy` (e.g. 2025-26), `month` (1-12)

**Response:**
```json
{
  "formType": "DRC_01B",
  "financialYear": "2025-26",
  "periodMonth": 4,
  "dataAvailable": true,
  "wouldTrigger": true,
  "verdictSummary": "DRC-01B would be triggered. GSTR-1 reported tax ₹500,000 exceeds GSTR-3B paid tax ₹450,000 by ₹50,000.",
  "mismatchLines": [
    {
      "description": "IGST mismatch",
      "gstr1OrGstr2bAmount": 300000,
      "gstr3bAmount": 270000,
      "differenceAmount": 30000,
      "mismatchType": "IGST_UNDERPAYMENT"
    }
  ],
  "totalExposureAmount": 50000
}
```

When `dataAvailable=false`, `wouldTrigger=false` and `verdictSummary` explains what data is missing.

### GET /gst/notice-deadline-rules

**Query params:** `fy` (optional, e.g. `2025-26`)

**Response:**
```json
[
  {
    "id": "uuid",
    "financialYear": "2025-26",
    "formType": "DRC_01B",
    "responseWindowDays": 7,
    "allowsNoticeTextOverride": true,
    "legalBasis": "Rule 88C CGST Rules 2017 — Notification 38/2023 dt. 04-Aug-2023",
    "isActive": true
  }
]
```

### Statutory Deadline Rules (migration 084 seed data)

| Form Type | Response Window | Legal Basis |
|-----------|----------------|-------------|
| ASMT_10 | 30 days | Rule 99 CGST Rules 2017 |
| DRC_01 | 30 days | Rule 142 CGST Rules 2017 |
| DRC_01A | 30 days | Rule 142(1a) CGST Rules 2017 |
| DRC_01B | **7 days** | Rule 88C — Notification 38/2023 dt. 04-Aug-2023 |
| DRC_01C | **7 days** | Rule 88D — Notification 38/2023 dt. 04-Aug-2023 |
| ADT_01 | 30 days | Section 65(3) CGST Act 2017 |
| OTHER | 30 days | Conservative default |

Config key: `GstService:GstatBacklogAppealDeadline` (default: `2026-06-30`). Rules seeded for FY 2025-26, 2026-27, and "ALL" sentinel rows.

### Deadline engine config shape

```json
// appsettings.json / Secret Manager
{
  "GstService": {
    "GstatBacklogAppealDeadline": "2026-06-30"
  }
}
```

The deadline rules table (`gst.notice_deadline_rules`) is the primary config store. Operators can add FY-specific rows via the database without code changes.

### Test results (Wave 7C)

| Suite | Count | Notes |
|-------|-------|-------|
| GstService Unit | 164 pass | Includes 30 new GAP-108 tests: form-type domain, deadline, appeal stage, DRC simulator validator, `GetFinancialYear` FY derivation |
| GstService EfSmoke | 16 pass | Includes 4 new: `GstNotices_NewGap108Columns`, `GstNoticeDeadlineRules_CanQuery`, `GstNoticeDeadlineRules_HasSeededRows_For2025_26`, `GstNotices_FullEntityMaterialise_WithGap108Fields` |

Migration 084 applied and scratch-replayed (idempotent, all `IF NOT EXISTS` guards pass).

---

## Wave 7 Mobile Reconciliation — ChatService + AuthService + GstService (migration 086)

Closes mobile client residuals documented in `mobile/src/api/appointments.ts` and `mobile/src/api/auth.ts`.

Base URLs: ChatService `:5107`, AuthService `:5101`, GstService `:5100`.

---

### Item 1 — GET /appointments/{id} (ChatService)

Single-appointment detail. IDOR-guarded by organisation (appointment must belong to caller's org; 404 otherwise). Replaces the client-side list-scan workaround in `getAppointment()`.

| Method | Route | Auth | Permission | Rate Limit |
|--------|-------|------|------------|------------|
| GET | `/appointments/{id}` | Firebase JWT | — (org-scoped via middleware) | standard (100/min) |

**Response (200):** `AppointmentDetailDto` — superset of the list item DTO.
```json
{
  "appointmentId": "uuid",
  "caProfileId": "uuid",
  "caDisplayName": "Priya Sharma",
  "slotStartUtc": "2026-06-15T10:00:00Z",
  "slotEndUtc": "2026-06-15T10:30:00Z",
  "status": "CONFIRMED",
  "meetLink": "https://meet.google.com/...",
  "ratingStars": null,
  "createdAt": "2026-06-11T09:00:00Z",
  "topic": "GST",
  "notes": "GSTR-3B query for Apr",
  "ratingComment": null,
  "ratedAt": null,
  "cancelledByCa": false,
  "caCancellationReason": null
}
```
**Error:** 404 `Appointment.NotFound` when id not found or belongs to another org.

---

### Item 2 — topic on booking (ChatService, migration 086)

`topic` is now a first-class field on the booking command and response DTOs. The mobile no longer embeds it as a `[TOPIC]` prefix in `notes`.

**Migration 086 (additive):** `chat.appointments.topic VARCHAR(50) NULL CHECK (topic IN ('ACCOUNTING','GST','ITR','LOAN','OTHER'))`.

**POST /appointments — updated request body:**
```json
{ "caProfileId": "uuid", "slotId": "uuid", "notes": "optional free text", "topic": "GST" }
```
Valid topic values: `ACCOUNTING`, `GST`, `ITR`, `LOAN`, `OTHER`. Null/omitted is allowed (backward compat for pre-086 rows).

**GET /appointments (list) — updated DTO:** `AppointmentSummaryDto` now includes `topic` and `notes` fields.

---

### Item 3 — GET /appointments/slots/day-map (ChatService)

Per-day availability map for the DateStrip. Returns `{ date, availableCount }` per day so the mobile can grey out fully-booked or slot-free days without fetching every individual slot.

| Method | Route | Auth | Rate Limit |
|--------|-------|------|------------|
| GET | `/appointments/slots/day-map` | Firebase JWT | standard (100/min) |

**Query params:**
- `caProfileId` (required, UUID) — the CA to query
- `from` (required, `YYYY-MM-DD`) — range start (inclusive)
- `to` (required, `YYYY-MM-DD`) — range end (inclusive; max 90 days from `from`)

**Response (200):**
```json
{
  "days": [
    { "date": "2026-06-15", "availableCount": 4 },
    { "date": "2026-06-16", "availableCount": 0 },
    { "date": "2026-06-17", "availableCount": 2 }
  ]
}
```
`availableCount = 0` = fully booked or no slots — DateStrip should grey out that day.
Only future (`StartUtc > now`) available (`IsAvailable = true`) slots are counted.

**Errors:** 400 when `to < from` or range > 90 days.

---

### Item 4 — GET /auth/devices/my-approval-status (AuthService)

NEW-device waiting screen polls this endpoint. Returns the caller's most recent device approval request status without inferring from session disappearance. Also surfaces the `mode` so mobile can branch ENFORCE vs NOTIFY_ONLY.

| Method | Route | Auth | Rate Limit |
|--------|-------|------|------------|
| GET | `/auth/devices/my-approval-status` | Firebase JWT | standard (100/min) |

**Response (200):**
```json
{
  "approvalRequestId": "uuid",
  "status": "PENDING",
  "decidedAt": null,
  "expiresAt": "2026-06-11T10:10:00Z",
  "mode": "NOTIFY_ONLY"
}
```
`status` values: `PENDING`, `APPROVED`, `DENIED`, `EXPIRED`, `UNKNOWN`.
`mode` values: `ENFORCE` (denial revokes session), `NOTIFY_ONLY` (soft-launch; denial only logs).
`decidedAt`: UTC timestamp when approved/denied/expired; null while pending.
`approvalRequestId`: null when no request found (status = UNKNOWN).

**Polling guidance:** Mobile should stop polling once `status != "PENDING"`.

**Deferred (product-gated, NOT in this release):**
- Approximate location field on approval request — requires IP geolocation integration (TL decision pending).
- Resend-push action — requires idempotency check on notification delivery (TL decision pending).
- Both are noted in `mobile/src/api/auth.ts` residual comments.

---

### Item 5 — BookmarkDto enrichment (ChatService)

`GET /appointments/bookmarks` response enriched with thread and sender context. Joins: `message_bookmarks → messages → threads`.

**Updated BookmarkDto:**
```json
{
  "bookmarkId": "uuid",
  "messageId": "uuid",
  "threadId": "uuid",
  "messageBody": "Here is your GSTR-3B summary...",
  "note": "save for filing",
  "bookmarkedAt": "2026-06-11T09:00:00Z",
  "messageCreatedAt": "2026-06-10T14:30:00Z",
  "senderUserId": "uuid",
  "senderRole": "CA",
  "threadSubject": "GST filing query June 2026"
}
```
**Note on `senderDisplayName`:** Cross-schema join to `auth.*` violates schema-per-service isolation. Mobile resolves display names from its local user/profile cache using `senderUserId` + `senderRole` (USER → auth cache; CA → CA profile from booking context). `senderUserId` is null for DPDP-erased senders.

---

### Item 6 — GST notice legacy status shim (GstService)

Legacy mobile values (`Open`, `Overdue`) pre-Wave-7C are mapped to canonical status vocabulary at the endpoint layer (before the query validator runs). Old app builds in the field will continue to receive 200 instead of 400.

**Mapping (DEPRECATED — will be removed when all app builds are ≥ Wave-7C):**

| Legacy (mobile pre-Wave-7C) | Canonical (server) |
|-----------------------------|--------------------|
| `Open` | `RECEIVED` |
| `Overdue` | `UNDER_REVIEW` |
| `Responded` | `RESPONDED` |
| `Closed` | `CLOSED` |

Canonical values pass through unchanged. `null` (no filter) passes through unchanged. Unknown values fall through to the validator (400 with clear message).

---

### Migration (Wave 7 Reconciliation)

| # | File | Change |
|---|------|--------|
| 086 | `086_chat_appointment_topic.sql` | Additive: `chat.appointments.topic VARCHAR(50) NULL` with CHECK; index `ix_appointments_topic`. Replay-safe. |

---

### Test Coverage (Wave 7 Mobile Reconciliation)

| Suite | Before | After | New tests |
|-------|--------|-------|-----------|
| ChatService Unit | 79 | 97 | +18 (Wave7ReconciliationTests) |
| ChatService EfSmoke | 17 | 20 | +3 (topic column: list, firstOrDefault, filter) |
| AuthService Unit | 627 | 641 | +14 (GetMyApprovalStatusTests) |
| GstService Unit | 164 | 182 | +18 (NoticeStatusShimTests) |

All EfSmoke tests run against live PostgreSQL 17 (`localhost:5432/snapaccount`) with migration 086 applied and scratch-replayed (idempotent).

---

## Phase 7 Wave 8 — GAP-064: Device Integrity Attestation + BUG-W7-IOS-001: ChatService SignalR Hub Fix

### GAP-064: Device Integrity Attestation (AuthService only)

**Service**: AuthService (port 5101 / Cloud Run)
**Purpose**: 2026 fintech baseline — prevent bots/emulators from driving OTP and loan flows via Play Integrity (Android) / App Attest (iOS).
**Pattern**: KYC_PROVIDER-style provider switch + soft-launch flag (DeviceIntegrity:Enforce=false default).

#### Headers (mobile sends on gated endpoints)

| Header | Required | Values | Notes |
|--------|----------|--------|-------|
| `X-Device-Integrity` | Optional (soft) | Platform attestation token | Absent = SKIPPED verdict |
| `X-Device-Integrity-Platform` | Optional | `ANDROID` \| `IOS` | Used for routing to correct verifier |

#### Gated Endpoints (default configuration)

- `POST /auth/otp/send`
- `POST /auth/otp/verify`
- `POST /auth/password/login`
- `POST /auth/social/firebase`

Configurable via `DeviceIntegrity:CheckedEndpoints` (comma-separated path prefixes).

#### Behaviour Matrix

| Condition | Enforce=false (default) | Enforce=true |
|-----------|------------------------|--------------|
| Header absent + RequireToken=false (default) | 200 SKIPPED, logged | 200 SKIPPED, logged |
| Header absent + RequireToken=true | 200 SKIPPED, logged | 403 DeviceIntegrity.Failed |
| Token present, verdict PASS | 200 | 200 |
| Token present, verdict FAIL | 200 (soft-fail), logged | 403 DeviceIntegrity.Failed |
| Token present, verdict NOT_CONFIGURED | 200 (treated as SKIPPED) | 200 |

#### 403 Error Response (enforce mode, FAIL verdict)

```json
{
  "type": "DeviceIntegrity.Failed",
  "title": "Device integrity check failed.",
  "status": 403,
  "detail": "The device could not be verified as a genuine, unmodified device. Please ensure you are using the official SnapAccount app."
}
```

#### Telemetry Table: `auth.device_integrity_checks` (Migration 089)

Every checked request is recorded regardless of verdict:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID? | null for anonymous OTP-send |
| `organization_id` | UUID? | From session JWT org claim |
| `platform` | VARCHAR(20) | ANDROID, IOS, or null |
| `verdict` | VARCHAR(20) NOT NULL | PASS, FAIL, SKIPPED, NOT_CONFIGURED |
| `endpoint` | VARCHAR(256) NOT NULL | Request path |
| `failure_reason` | VARCHAR(500) | Provider detail on FAIL/NOT_CONFIGURED |
| `client_ip` | VARCHAR(64) | For abuse pattern analysis |
| `recorded_at` | TIMESTAMPTZ NOT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

#### Provider Configuration

| `DeviceIntegrity:Provider` | Class | Credentials Required |
|---------------------------|-------|---------------------|
| `mock` (default) | `MockDeviceIntegrityVerifier` | None — dev bypass |
| `play_integrity` | `PlayIntegrityVerifier` | `DeviceIntegrity:PlayIntegrity:ServiceAccountJson` + `PackageName` |
| `app_attest` | `AppAttestVerifier` | `DeviceIntegrity:AppAttest:TeamId` + `BundleId` |

**Mock sentinel tokens** (local dev / CI testing):
- `mock-fail` → verdict FAIL (test enforcement path)
- `mock-skip` or absent → verdict SKIPPED
- Any other value → verdict PASS

#### Runtime Config Keys

```
DeviceIntegrity:Enforce=false           # Set true to block FAIL verdicts (production rollout)
DeviceIntegrity:RequireToken=false      # Set true to block absent headers in enforce mode
DeviceIntegrity:Provider=mock           # mock | play_integrity | app_attest
DeviceIntegrity:CheckedEndpoints=...    # Comma-separated path prefixes (override defaults)
DeviceIntegrity:PlayIntegrity:ServiceAccountJson=...    # GCP SA JSON (via Secret Manager)
DeviceIntegrity:PlayIntegrity:PackageName=...           # com.snapaccount.app
DeviceIntegrity:AppAttest:TeamId=...                    # Apple Team ID
DeviceIntegrity:AppAttest:BundleId=...                  # com.snapaccount.app
```

---

### BUG-W7-IOS-001: ChatService SignalR Hub 404 Fix

**Root cause**: Mobile `HUB_BASE_URL` in `ChatDetailScreen.tsx` defaults to `apiBaseUrl` (port 5101, AuthService). The hub negotiate call reaches AuthService which has no hub → 404.

**Backend verification**: `POST http://localhost:5107/hubs/chat/negotiate?negotiateVersion=1` → 401 (auth required, hub correctly registered). Hub is at `/hubs/chat` on ChatService port 5107.

**Backend change (this wave)**: ChatService DI now uses `AbortOnConnectFail=false` for Redis so the hub starts and serves negotiate requests even when Redis is temporarily unavailable in local dev (graceful fallback to in-process SignalR).

**Mobile fix required (mobile-dev action — cannot edit mobile/):**

In `mobile/src/screens/chat/ChatDetailScreen.tsx`, change `HUB_BASE_URL`:

```typescript
// BEFORE (broken — resolves to AuthService port 5101)
const HUB_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:5000';

// AFTER — correctly targets ChatService port 5107
const HUB_BASE_URL =
  (Constants.expoConfig?.extra?.chatServiceBaseUrl as string | undefined) ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:5107' : 'http://localhost:5107');
```

Add to `mobile/app.json` `extra` section:
```json
{
  "extra": {
    "chatServiceBaseUrl": "http://localhost:5107"
  }
}
```

Android simulator needs `http://10.0.2.2:5107` — use `resolveHost()` from `mobile/src/lib/api.ts` or apply the same Platform.OS check inline.

---

### Test Coverage (Wave 8)

| Suite | Before | After | New tests |
|-------|--------|-------|-----------|
| AuthService Unit | 641 | 780 | +139 (DeviceIntegrityVerifierTests: 12, DeviceIntegrityEntityTests: 9, pre-existing growth) |
| ChatService Unit | 195 | 199 | +4 (SignalRHubConfigTests) |
