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

1. `locale` query/body param from the caller
2. → User preference locale (from `auth.user_profile.preferred_locale`)
3. → Organisation default locale (from `auth.organization.default_locale`)
4. → `"en"` (hard fallback)

The resolved locale is stored in `key_facts_statement.locale` and echoed in the response.

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
| POST | /auth/token/refresh-context | Required | Re-issue session JWT with current org/RBAC claims (does NOT rotate refresh token) | — | `{ token, expiresAt }` 200 |
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
| POST | /loans/applications/{id}/kfs | Required | Generate RBI-compliant Key Facts Statement | — | `{ kfsId, annualPercentageRate, loanAmount, tenureMonths, monthlyEmi, fees, repaymentSchedule, lenderName, grievanceOfficerContact, coolingOffDays, generatedAt }` 201 |
| GET | /loans/applications/{id}/kfs | Required | Retrieve current KFS | `?kfsId` (optional, defaults to latest) | `{ kfsId, applicationId, annualPercentageRate, loanAmount, tenureMonths, monthlyEmi, feesJson, repaymentScheduleJson, ... }` 200 |
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
