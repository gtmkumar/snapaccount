# SnapAccount API Endpoint Contracts

Base URL: `http://localhost:5000` (individual service ports assigned by Aspire)
Auth: Firebase JWT in `Authorization: Bearer <token>` header.
All endpoints require `.RequireAuthorization()` unless noted.

---

## Phase 6 — Accounting, Notification, Callback, GST

### AccountingService (port 5005/5006)

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /accounting/journal-entries | Post a journal batch (manual or from OCR) | `{ entries: [{ledgerAccountId, debitAccountId, creditAccountId, amount, description, referenceId, referenceType}], batchType, organizationId, fiscalYear, periodMonth, postedById, description }` | `{ batchId, status, entryCount }` 200 |
| GET | /accounting/trial-balance | Get trial balance for org/period | `?organizationId&fiscalYear&periodMonth` | `{ accounts: [{code,name,debitTotal,creditTotal,balance}] }` 200 |
| GET | /accounting/reports/{type} | Get P&L or Balance Sheet | `?organizationId&fiscalYear&periodMonth` type=profit-and-loss\|balance-sheet | `{ sections: [{name, accounts:[...], total}], netProfit/totalAssets }` 200 |
| POST | /accounting/fiscal-year/close | Close a fiscal year | `{ organizationId, fiscalYear }` | 204 |
| POST | /accounting/organizations/{id}/bootstrap-coa | Bootstrap Chart of Accounts from template | `{ templateCode }` | `{ accountsCreated }` 200 |
| POST | /accounting/postings/{id}/review | Approve a pending posting | `{}` | 204 |
| POST | /accounting/postings/{id}/reverse | Reverse a posted entry | `{ reason }` | 204 |

### GstService (port varies)

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| GET | /gst/returns | List GST returns for org | `?organizationId&financialYear&page&pageSize` | `{ items:[...], totalCount }` 200 |
| GET | /gst/invoices | List GST invoices | `?organizationId&financialYear&page&pageSize` | `{ items:[...], totalCount }` 200 |
| POST | /gst/invoices | Create a GST invoice | `{ organizationId, gstin, buyerGstin, invoiceDate, lineItems:[...], placeOfSupply, isInterstate, documentType }` | `{ invoiceId, invoiceNumber, totalTaxableValue, totalGst, totalAmount }` 201 |

### NotificationService (port varies)

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /notifications/send | Fan-out notification dispatch | `{ userId, eventCode, locale, variables:{}, recipientEmail?, recipientPhone? }` | `{ results:[{channel,status,messageId,error}], dispatchedCount, suppressedCount }` 200 |
| GET | /notifications/inbox | In-app notification inbox | `?page&pageSize` | `{ items:[{id,eventCode,body,status,sentAt}], totalCount, unreadCount }` 200 |
| POST | /notifications/{id}/read | Mark notification read | — | 204 |
| GET | /notifications/preferences | Get all channel preferences | — | `{ items:[{eventCode,pushEnabled,smsEnabled,emailEnabled,inAppEnabled,quietHoursStart,quietHoursEnd,doNotDisturb}] }` 200 |
| PUT | /notifications/preferences | Upsert channel preference | `{ eventCode, pushEnabled, smsEnabled, emailEnabled, inAppEnabled, quietHoursStart?, quietHoursEnd?, doNotDisturb }` | 204 |
| POST | /notifications/push-tokens | Register FCM device token | `{ deviceId, token, platform }` platform=ios\|android | 204 |
| GET | /notifications/dlq | List DLQ items (operator) | `?includeResolved&page&pageSize` | `{ items:[...], totalCount }` 200 |
| POST | /notifications/dlq/{id}/retry | Retry DLQ item | — | 202 |

**Fan-out behavior:** For each channel in `[Push, Sms, Email, InApp]`:
- Skipped if user preference disables it
- Skipped during DND or quiet hours (IST-aware)
- Suppressed if same event sent within 6h dedupe window (SHA-256 key)
- SMS blocked if DLT template ID not registered on TRAI DLT portal
- Failed dispatches land in DLQ (operator-retryable)

**Rate limits:** 100 req/min per user (standard window)

### CallbackService (port varies, 12th microservice)

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /callbacks | Customer requests callback | `{ phoneNumber, category, priority, issueDescription?, preferredWindowStart?, preferredWindowEnd? }` | `{ callbackId, status }` 201 |
| GET | /callbacks | List callbacks (paginated) | `?userId&agentId&status&category&page&pageSize` | `{ items:[...], totalCount }` 200 |
| GET | /callbacks/{id} | Get full callback detail | — | `{ id, userId, status, category, priority, assignedAgentId, scheduledAt, notes:[...], ... }` 200 |
| POST | /callbacks/{id}/assign | Assign agent → Assigned | `{ agentId }` | 204 |
| POST | /callbacks/{id}/confirm | Confirm schedule → Confirmed | `{ scheduledAt }` | 204 |
| POST | /callbacks/{id}/complete | Mark completed | `{ resolutionSummary? }` | 204 |
| POST | /callbacks/{id}/escalate | Escalate | `{ reason }` | 204 |
| POST | /callbacks/{id}/cancel | Cancel | `{ reason? }` | 204 |
| POST | /callbacks/{id}/reschedule | Reschedule window | `{ newWindowStart, newWindowEnd }` | 204 |
| POST | /callbacks/{id}/notes | Add call note | `{ content, isInternal }` | 201 |
| GET | /callbacks/kpi | Daily KPI snapshot (org-scoped) | — | `{ organizationId, ... }` 200 |

**State machine:** Pending → Assigned → Confirmed → Completed; any → Escalated\|Cancelled

**Category values:** General, Gst, Itr, Loan, Accounting, Subscription, Technical

**Priority values:** Low, Normal, High, Urgent

**Phone format:** `+91XXXXXXXXXX` (Indian numbers only)

**Rate limits:** 100 req/min per user (standard window)

---

## Phase 6B — GST Completion (GstService)

Base URL: `http://localhost:5003/gst` (Aspire local)

| Method | Route | Description | Request body | Response |
|--------|-------|-------------|--------------|----------|
| GET | /gst/notices | List notices (paginated) | `?orgId&status&page&pageSize` | 200 `{ items, totalCount, page, pageSize }` |
| GET | /gst/notices/{id} | Get notice detail | — | 200 `{ id, noticeNumber, noticeType, status, attachmentsJson, ... }` |
| POST | /gst/notices | Create notice | `{ orgId, noticeNumber, noticeType, issuedBy?, issuedDate, dueDate?, description? }` | 201 `{ noticeId, status }` |
| POST | /gst/notices/{id}/respond | Respond to notice | `{ noticeId, respondedByUserId, responseText?, responseAttachmentMetadataJson? }` | 204 |
| POST | /gst/notices/{id}/assign-ca | Assign notice to CA | `{ caUserId }` | 204 |
| POST | /gst/e-invoices/generate | Generate IRN via IRP | `{ invoiceId, orgId, supplierGstin }` | 200 `{ irnNumber, ackNumber, signedInvoice, signedQRCode }` |
| POST | /gst/e-way-bills | Generate e-way bill via EWB | `{ invoiceId, orgId, ... }` | 201 `{ ewbNumber, ewbDate, validUpto }` |
| POST | /gst/returns/{id}/nil | File nil return | `{ gstReturnId }` | 200 `{ ackNumber, filedAt }` |
| GET | /gst/hsn-sac | Search HSN/SAC codes | `?query&limit` | 200 `{ items: [{ code, description, gstRate }] }` |
| GET | /gst/returns/{id}/invoices | List invoices for a return | `?page&pageSize` | 200 `{ items, totalCount }` |
| POST | /gst/returns/{id}/invoices | Add invoice to return | `{ invoiceNumber, invoiceType, invoiceDate, ... }` | 201 |
| POST | /gst/returns/{id}/invoices/bulk | Bulk import invoices (max 500) | `{ invoices: [...] }` | 200 `{ importedCount, skippedCount, errors }` |

**Adapter pattern:** `GST_PRODUCTION_APIS_ENABLED=true` → real GSTN/IRP/EWB APIs with 3× retry (100ms/1s/5s); default → deterministic mock adapters.

**E-invoicing:** Mandatory for turnover > 5 Crore per GST Act; check `organization.annualTurnoverCr` before calling `/e-invoices/generate`.

**Notice attachments (P6-HANDOFF-14):** `attachmentsJson` / `responseAttachmentMetadataJson` must be JSON array of GCS URI metadata objects — never base64.

**Recurring jobs:** Deadline reminders dispatched via `gst-service-recurring-jobs-sub` Pub/Sub subscription at D-7, D-3, D-1, D+1.

**Rate limits:** 100 req/min per user (standard window)

---

## Phase 6D — ITR Engine (ItrService)

Base URL: `http://localhost:5007/itr` (Aspire local)

| Method | Route | Description | Request body | Response |
|--------|-------|-------------|--------------|----------|
| GET | /itr/profile/{userId} | Get assessee profile | — | 200 `{ id, userId, panLast4, fullName, assesseeType, ... }` |
| PUT | /itr/profile | Create/update assessee profile | `{ userId, panCipher, panLast4, fullName, assesseeType, orgId?, email?, phone?, dob?, address?, annualTurnoverCr? }` | 200 `{ assesseeId, panLast4, fullName }` |
| GET | /itr/filings | List filings (paginated) | `?assesseeId&status&page&pageSize` | 200 `{ items, totalCount, page, pageSize }` |
| POST | /itr/filings | Start new filing | `{ assesseeId, assessmentYear, itrFormType, regime }` | 201 `{ filingId, assessmentYear, status }` |
| GET | /itr/filings/{id} | Get filing detail | — | 200 `{ id, assesseeId, assessmentYear, status, computationHash?, ... }` |
| POST | /itr/filings/{id}/compute | Run tax computation engine | `{ salaryIncome, housePropertyIncome, businessIncome, capitalGains, otherIncome, section80C, section80D, section80E, otherDeductions, advanceTaxPaid, tdsPaid }` | 200 `{ filingId, grossTotalIncome, taxableIncome, totalTaxPayable, payableOrRefund, computationHash, regime, assessmentYear }` |
| POST | /itr/filings/{id}/compare-regimes | Compare OLD vs NEW regime | same as compute | 200 `{ old: {...}, new: {...}, recommendedRegime, taxSaving }` |
| POST | /itr/filings/{id}/submit | Submit for CA review | — | 204 |
| POST | /itr/filings/{id}/ca-approve | CA approves filing | `{ caUserId }` | 204 |
| POST | /itr/filings/{id}/ca-reject | CA rejects filing | `{ caUserId, reason }` | 204 |
| POST | /itr/filings/{id}/mark-filed | Mark as filed with IT dept | `{ acknowledgementNumber }` | 204 |
| POST | /itr/filings/{id}/e-verify | E-verify filing | `{ verificationMethod, itrVObjectKey? }` | 204 |
| POST | /itr/filings/{id}/form16 | Upload Form 16 | `{ assesseeId, gcsUri, employeePanCipher, employeePanLast4 }` | 201 `{ form16ExtractId, ocrStatus }` |
| POST | /itr/filings/{id}/notices | Upload ITR notice | `{ assesseeId, noticeNumber, noticeType, issuedDate, dueDate?, subject?, attachmentsJson? }` | 201 `{ noticeId, status }` |
| POST | /itr/notices/{noticeId}/respond | Respond to ITR notice | `{ respondedByUserId, responseText?, responseAttachmentsJson? }` | 204 |
| GET | /itr/filings/{id}/refund | Get refund status | — | 200 `{ filingId, refundStatus, refundAmount?, refundDate?, transactionReference?, statusMessage?, lastPolledAt }` |
| GET | /itr/tax-slabs | Get tax slabs | `?assessmentYear&regime` | 200 `{ versionId, assessmentYear, regime, slabsJson, standardDeduction, rebate87AIncomeLimit, rebate87AMaxAmount, cessRatePct }` |
| GET | /itr/deduction-catalog | Get deduction catalog | `?assessmentYear&regime` | 200 `{ sections: [{ id, sectionCode, name, maxLimit?, availableInNewRegime, availableInOldRegime }] }` |

**Tax engine (P6-HANDOFF-18):** Config-driven from `itr.tax_slab_versions` — never hardcoded. Computation pinned with `tax_slab_version_id` + `computation_jsonb` + SHA-256 `computation_hash` on every filing.

**PAN handling (P6-HANDOFF-19):** `panCipher` must be AES-256-CBC ciphertext from `IPanEncryptionService`; `panLast4` used for UI display only. PAN is immutable once set.

**ITR-V (P6-HANDOFF-20):** `itrVObjectKey` stored as GCS object key — signed URL regenerated on demand; never persisted in DB.

**Filing state machine:** `DRAFT → UNDER_CA_REVIEW → USER_APPROVED → FILED → E_VERIFIED → REFUND_ISSUED`; side transitions: `REJECTED_BY_CA`, `NOTICE_RECEIVED`.

**ITR forms:** ITR-1, ITR-2, ITR-3, ITR-4, ITR-5, ITR-6, ITR-7. Assessment year format: `AY2025-26`. Regime: `OLD` or `NEW`.

**Recurring jobs:** Deadline reminders (`itr-service-recurring-jobs-sub`) — filing season (May–Sep): cascade at D-7/D-3/D-1/D+1 overdue; off-season: Sunday digest at D-7 only. Refund polling: `itr_refund_polling` job type.

**AI endpoints rate limit:** `/compute`, `/compare-regimes`, `/form16` — 20 req/min per user (fixed window).

**DPDP compliance:** `Anonymize()` on `Filing` nulls `ComputationJsonb`; `Anonymize()` on `Assessee` nulls PII fields. 7-year document retention enforced at GCS storage layer.

---

## Phase 6C — Loan Hub (LoanService + ReportService + NotificationService extension)

### LoanService

All routes require Firebase JWT. IDOR: all handlers filter by `OrgId` from JWT.

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /loans/products | Create a loan product (admin) | `{ bankId, productName, description, minAmount, maxAmount, tenureMonths, interestRate, eligibilityCriteriaJson, isActive }` | `{ productId }` 201 |
| GET | /loans/products | List active loan products | `?page&pageSize` | `{ items:[{productId,productName,minAmount,maxAmount,interestRate}], totalCount }` 200 |
| GET | /loans/products/{id} | Get loan product detail | — | `{ productId, productName, ... }` 200 |
| PUT | /loans/products/{id}/activate | Activate a loan product | — | 204 |
| PUT | /loans/products/{id}/deactivate | Deactivate a loan product | — | 204 |
| POST | /loans/applications | Create a draft loan application | `{ loanProductId, requestedAmount, tenureMonths, purpose }` | `{ applicationId }` 201 |
| GET | /loans/applications | List applications for org | `?status&page&pageSize` | `{ items:[{applicationId,orgId,status,requestedAmount,...}], totalCount }` 200 |
| GET | /loans/applications/{id} | Get application detail | — | `{ applicationId, orgId, productName, status, ... }` 200 |
| POST | /loans/applications/{id}/submit | Submit a DRAFT application | — | 204 |
| POST | /loans/applications/{id}/begin-review | Mark application under review (bank) | — | 204 |
| POST | /loans/applications/{id}/assign-bank | Assign to partner bank, generate PDF package | `{ bankId }` | `{ packageUrl }` 200 |
| POST | /loans/applications/{id}/approve | Approve application | `{ bankReferenceNo }` | 204 |
| POST | /loans/applications/{id}/reject | Reject application | `{ reason }` | 204 |
| POST | /loans/applications/{id}/request-documents | Request more docs | — | 204 |
| POST | /loans/applications/{id}/disburse | Record disbursement | `{ disbursedAmount, bankReferenceNo }` | 204 |
| POST | /loans/applications/{id}/close | Close application | — | 204 |
| POST | /loans/applications/{id}/documents | Upload a supporting document | `{ documentType, fileBase64, fileName }` | `{ documentId }` 201 |
| GET | /loans/applications/{id}/documents | List documents for application | — | `{ items:[{documentId, documentType, fileName, uploadedAt}] }` 200 |
| POST | /loans/applications/{id}/consent | Record consent signature (HMAC-SHA256) | `{ consentVersion }` | `{ consentId, signatureHex }` 201 |
| GET | /loans/applications/{id}/package/download-url | Get signed GCS download URL for PDF package | — | `{ url, expiresAt }` 200 |
| POST | /loans/banks | Register partner bank | `{ name, gstin, adapterType, configJson }` | `{ bankId }` 201 |
| GET | /loans/banks | List partner banks | `?page&pageSize` | `{ items:[{bankId,name,adapterType,isActive}], totalCount }` 200 |
| POST | /loans/webhooks/disbursement | Incoming disbursement webhook from bank (idempotent) | `{ loanApplicationId, status, disbursedAmount, bankReferenceNo, reason }` | 200 |

**State machine:** DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED \| REJECTED \| DOCS_REQUESTED → DISBURSED → CLOSED.

**PDF package (GCS):** `assign-bank` generates and uploads a composite PDF to `GCS_LOAN_PACKAGES_BUCKET`. Download URL signed with 1h TTL.

**Consent:** HMAC-SHA256 over `{userId}|{applicationId}|{version}|{signedAt}`, key from Secret Manager `partner-bank-creds-{bankId}` template.

**Webhook idempotency:** `WebhookIdempotencyKey` table deduplicates incoming webhooks by `webhook_id` within a 24h TTL window.

**DPDP:** `AnonymizedAt` + `AnonymizationReason` on `LoanApplication`; `UserId` nullable for right-to-erasure.

**Rate limits:** Standard 100 req/min per user.

### ReportService

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /reports/generate | Enqueue and synchronously generate a report | `{ reportType, format, financialYear, periodStart, periodEnd, loanApplicationId? }` | `{ jobId, status, gcsUri }` 201 |
| GET | /reports/ | List report jobs for org | `?page&pageSize` | `{ items:[{jobId,reportType,format,status,createdAt}], totalCount }` 200 |
| GET | /reports/{id} | Get report job detail | — | `{ jobId, reportType, format, status, gcsUri, sha256HashHex, pageCount, errorMessage }` 200 |
| GET | /reports/{id}/download-url | Get signed GCS download URL | — | `{ url, expiresAt }` 200 |

**Report types:** TrialBalance, ProfitAndLoss, BalanceSheet, CashFlow, TaxLiability, LedgerByAccount, LoanPackage.

**Formats:** Pdf, Json.

**PDF engine:** QuestPDF Community License (MIT-equivalent). Fonts: Inter (Latin), Noto Sans Devanagari (Hindi), Noto Sans Bengali. Place fonts in `backend/Shared/fonts/`.

**LoanPackage report (6 pages):** Cover → GSTR-3B summary → P&L → Balance Sheet → Bank Statement Summary → KYC Checklist. Reads loan package data from GCS bucket `GCS_LOAN_PACKAGES_BUCKET`.

**SHA-256 integrity:** Each generated PDF stores its hex digest in `ReportJob.Sha256HashHex` for tamper detection.

**Rate limits:** Standard 100 req/min per user.

### NotificationService — Extended Catalog (Phase 6C additions)

Three new events added to bring catalog to 29 total:

| Event Code | Category | Channels | Description |
|------------|----------|----------|-------------|
| LOAN_DISBURSED | LOAN | Push, SMS, Email | Loan disbursed to borrower account |
| LOAN_DISBURSEMENT_FAILED | LOAN | Push, SMS, Email | Disbursement attempt failed |
| LOAN_DISBURSEMENT_REVERSED | LOAN | Push, SMS, Email | Disbursement reversed by bank |

**Pub/Sub subscriber:** `LoanEventsSubscriber` (BackgroundService) subscribes to `notification-service-loan-events-sub`. In-process dedup via `HashSet<string>`. Maps `LoanDisbursed`/`LoanDisbursementFailed`/`LoanDisbursementReversed` event types to the three catalog entries above.

---

## Phase 6F (Final Phase — ChatService full build, SubscriptionService full build, cross-cutting)

Base URL: `http://localhost:5000` (dev). All endpoints require Firebase JWT (`Authorization: Bearer <token>`) unless noted.

### ChatService

Hub: `ws://{host}/hubs/chat` — SignalR, requires `Authorization: Bearer <token>`.

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /chat/threads | Open a new support thread | `{ category, subject?, initialMessage, clientMessageId? }` | `{ threadId, status, category, messageId }` 201 |
| GET | /chat/threads | List thread inbox (paginated) | `?status&category&page&pageSize` | `{ items:[{threadId,subject,category,status,lastMessageAt,unreadCount}], totalCount }` 200 |
| GET | /chat/threads/{id} | Get thread detail | — | `{ threadId, subject, category, status, assignedToUserId, participants:[{userId,role}], createdAt }` 200 |
| GET | /chat/threads/{id}/messages | Cursor-paginated messages | `?beforeMessageId&pageSize` | `{ items:[{messageId,senderUserId,body,attachmentsJson,clientMessageId,createdAt}], hasMore }` 200 |
| POST | /chat/threads/{id}/messages | Send message in thread | `{ body, attachmentsJson?, clientMessageId? }` | `{ messageId, threadId, senderUserId, body, createdAt }` 201 |
| POST | /chat/threads/{id}/read | Mark thread as read | — | `{}` 204 |
| POST | /chat/threads/{id}/assign | Assign thread to agent/CA | `{ assignedToUserId, role }` | `{}` 204 |
| POST | /chat/threads/{id}/resolve | Resolve thread | — | `{}` 204 |
| POST | /chat/threads/{id}/escalate | Escalate thread | — | `{}` 204 |
| POST | /chat/threads/{id}/reopen | Reopen resolved/escalated thread | — | `{}` 204 |
| POST | /chat/threads/{id}/participants | Add participant | `{ userId, role }` | `{}` 201 |
| DELETE | /chat/threads/{id}/participants/{userId} | Remove participant | — | `{}` 204 |
| POST | /chat/threads/{id}/typing | Record typing ping (SignalR broadcast) | — | `{}` 204 |
| GET | /chat/threads/search | Full-text search message history | `?q&page&pageSize` | `{ items:[{messageId,threadId,senderUserId,body,threadCategory,threadStatus,createdAt}], totalCount }` 200 |
| GET | /chat/threads/unread-count | Get unread thread count | — | `{ count }` 200 |

**SignalR hub events (server → client):**
- `MessageReceived` — `{ messageId, threadId, senderUserId, body, createdAt }`
- `TypingIndicator` — `{ threadId, userId }`

**Offline idempotency:** `clientMessageId` is a UNIQUE constraint per `(thread_id, client_message_id)`. Re-posting the same `clientMessageId` returns the existing message (200) without duplication.

**DPDP:** On user erasure, `SenderUserId` is set to NULL with `AnonymizedAt` + `AnonymizationReason = 'DPDP_USER_ERASURE'`. ThreadParticipant records are soft-deleted. DB triggers block hard-delete.

**Redis presence:** `presence:{userId}` key with 30s TTL. Set on SignalR `OnConnectedAsync`.

**Rate limits:** Standard 100 req/min per user.

---

### SubscriptionService

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /subscriptions/plans | Create a plan (admin) | `{ name, tier, billingCycle, priceInr, trialDays?, description? }` | `{ planId, name, priceInr }` 201 |
| PUT | /subscriptions/plans/{id} | Update a plan (admin) | `{ name, priceInr, description?, isActive }` | `{}` 204 |
| GET | /subscriptions/plans | List active plans | — | `[{ planId, name, tier, billingCycle, priceInr, trialDays, isActive }]` 200 |
| POST | /subscriptions | Subscribe org to plan | `{ planId, razorpaySubscriptionId?, razorpayCustomerId? }` | `{ subscriptionId, status, currentPeriodEnd }` 201 |
| GET | /subscriptions/me | Get current org subscription | — | `{ subscriptionId, planId, status, currentPeriodEnd, razorpaySubscriptionId }` 200 |
| DELETE | /subscriptions/me | Cancel subscription | — | `{}` 204 |
| POST | /subscriptions/me/upgrade | Upgrade to higher tier plan | `{ newPlanId }` | `{ subscriptionId, newPlanId }` 200 |
| POST | /subscriptions/me/downgrade | Downgrade to lower tier plan | `{ newPlanId }` | `{ subscriptionId, newPlanId }` 200 |
| POST | /subscriptions/payment | Record payment (Razorpay webhook) | `{ subscriptionId, razorpayPaymentId, invoiceNumber, amountInr, newPeriodEnd }` | `{}` 204 |
| POST | /subscriptions/invoices/generate | Generate invoice for current period | — | `{ invoiceId, invoiceNumber, amountInr, gstAmountInr, pdfGcsUri }` 201 |
| GET | /subscriptions/invoices | List invoices for org | `?page&pageSize` | `[{ invoiceId, invoiceNumber, amountInr, gstAmountInr, status, paidAt }]` 200 |
| GET | /subscriptions/mrr | MRR dashboard (admin) | — | `{ totalMrr, activeCount, trialingCount, pastDueCount, cancelledCount }` 200 |
| GET | /subscriptions/plans/{id} | Get single plan | — | `{ planId, name, tier, billingCycle, priceInr, trialDays, description, isActive }` 200 |

**Plan tiers:** Free=0, Starter=1, Growth=2, Enterprise=3. Upgrade requires higher tier; downgrade requires lower tier.

**Billing cycles:** Monthly=1, Quarterly=3, Annual=12 (used for MRR normalization).

**GST:** 18% on SaaS invoices (CGST 9% + SGST 9% for intra-state). Stored as `decimal` in INR — never float.

**State machine:** `TRIALING → ACTIVE → PAST_DUE → CANCELLED | PAUSED`.

**Razorpay:** Webhook HMAC verified (SEC-001). `RAZORPAY_WEBHOOK_SECRET` from Secret Manager.

**Rate limits:** Standard 100 req/min per user.

---

### AuthService — Phase 6F additions

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| GET | /auth/me/permissions | Get current user's permission list | — | `{ userId, roles:[string], permissions:[string] }` 200 |
| GET | /search | CommandPalette global search (auth schema) | `?q&types` | `{ query, results:[{type,id,title,subtitle,url}], totalCount }` 200 |

**Search notes:**
- Minimum query length: 2 characters.
- `types` param: comma-separated from `user, organisation, document, return, notice, loan, itr, plan`. Only `user` and `organisation` return results in Phase 6F; others return empty lists (cross-service fan-out is Phase 7).
- P95 target: <250ms warm.
- IDOR: non-admin users see only themselves; admins see all users in their org.

---

### NotificationService — Phase 6F additions (Celebration tracking)

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /notifications/celebrations/{kind}/fire | Record a celebration for the current user | — | `{ fired: true, alreadyFired: bool }` 200 |
| GET | /notifications/celebrations | Get fired-state of all celebration kinds | — | `{ first_gst_return, first_loan_approved, first_itr_filed, profile_complete, first_transaction }` 200 |

**Celebration kinds:** `first_gst_return`, `first_loan_approved`, `first_itr_filed`, `profile_complete`, `first_transaction`.

**Storage:** Reuses `notification.notification_log` with `EventCode = 'celebration.{kind}'` and `Channel = InApp`. No new migration needed. Per-user × per-kind idempotency: fires only once.

---

### ReportService — Phase 6F additions

| Method | Route | Description | Request Body | Response |
|--------|-------|-------------|-------------|----------|
| POST | /reports/{id}/share-link | Generate 15-min signed GCS URL for CA/bank | — | `{ url, expiresAt }` 200 |

**SEC-046:** TTL is capped at 15 minutes. Caller must own the report (IDOR-scoped to org). Use case: share-with-CA, share-with-bank flows.

---

## Phase 5 (prior)

See git history for Phase 5 endpoints (Auth, Document, GST stubs, Loan, ITR, Chat, Report, Subscription, AI).
