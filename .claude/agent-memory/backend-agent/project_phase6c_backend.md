---
name: Phase 6C Backend Build (LoanService + ReportService + NotificationService)
description: Phase 6C + hotfix complete — SEC-044/046/047/049 fixed, 313 unit tests passing
type: project
---

## Phase 6C Backend — Complete (2026-04-25)

**Services delivered:**
1. **LoanService** — Full Clean Architecture build: 21 REST endpoints, PDF package generation, HMAC-SHA256 consent, webhook idempotency, DPDP anonymization, partner bank adapter pattern (SBI, HDFC, ICICI adapters)
2. **ReportService** — QuestPDF (Community License) integration, 7 report generators, IReportGenerator strategy pattern, SHA-256 integrity, GCS upload
3. **NotificationService** — Extended catalog from 26 → 29 events, LoanEventsSubscriber BackgroundService

**Why:** P6-HANDOFF-25..34 cross-agent handoff items (db-engineer + ui-ux-agent + devops-engineer delivered first).

**How to apply:** When extending LoanService or ReportService, follow the existing ILoanStorageService / IReportStorageService pattern (not Shared interfaces — they have different signatures).

## Key Architecture Decisions

### Interface Isolation (P6-HANDOFF pattern)
LoanService defines its own interfaces to avoid namespace collisions with Shared:
- `ILoanStorageService` — `UploadAsync(bucketName, objectName, byte[], contentType, ct)` — different from Shared `ICloudStorageService` which takes `Stream`
- `ILoanEventPublisher` — `PublishAsync(topicId, object, ct)` — different from Shared `IPubSubPublisher` which requires `IDomainEvent` generic constraint

Same pattern for ReportService: `IReportStorageService`.

### GCS ADC Pattern (Loan + Report)
```csharp
var credential = await GoogleCredential.GetApplicationDefaultAsync(ct);
var signer = UrlSigner.FromCredential(credential);  // NOT FromServiceAccountPathAsync
```
Never use `IConfiguration` in storage adapters — ADC provides credentials from environment.

### QuestPDF Setup
```csharp
QuestPDF.Settings.License = LicenseType.Community;  // Set once in DI, before any generator runs
```
All generators inherit `BaseReportGenerator`. `PageSizes` requires `using QuestPDF.Helpers;`.
Page count: count `"/Type /Page"` occurrences in raw PDF bytes (heuristic, no direct API).

### EF InMemory FK Configuration (Test Pattern)
For unit tests using EF InMemory, must explicitly configure FK relationships in OnModelCreating:
```csharp
modelBuilder.Entity<LoanApplication>()
    .HasOne(a => a.LoanProduct).WithMany()
    .HasForeignKey(a => a.LoanProductId).IsRequired(false);
```
Without this, navigation properties in `.Select()` projections cause queries to return 0 results silently (EF InMemory doesn't auto-discover FK conventions).

### State Machine (LoanApplication)
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED | DOCS_REQUESTED → DISBURSED → CLOSED
- Domain events raised on: Submit, AssignToBank, Approve, Reject, RecordDisbursement, RecordDisbursementFailed, RecordDisbursementReversed
- OrgId is `init`-only (set at creation, never changes)

### Webhook Idempotency
`WebhookIdempotencyKey` entity (webhook_id, received_at) with 24h TTL. Handler checks before processing:
```csharp
if (await db.WebhookIdempotencyKeys.AnyAsync(k => k.WebhookId == webhookId)) return 200;
```

### NotificationService Catalog Fix
Test `NotificationEventCatalog_Contains26Events` renamed to `Contains29Events` after Phase 6C added 3 loan events.

## Security Hotfix (2026-04-25) — SEC-044/046/047/049

**SEC-044 (HIGH) FIXED:** `DisbursementWebhookHandler` line 58: replaced `if (!string.IsNullOrEmpty(bank.WebhookSecretRef))` guard with hard-reject (`IsNullOrWhiteSpace`). Also added `CreatePartnerBankCommandValidator` rule requiring `WebhookSecretRef` for Rest/OAuth adapter types. 7 new unit tests cover: null/empty/whitespace bypass attempts, unknown bank, valid secret + correct HMAC, valid secret + wrong HMAC.

**SEC-046 (MEDIUM) FIXED:** Both `GetPackageDownloadUrlQuery.cs` (LoanService) and `GetDownloadUrlQuery.cs` (ReportService) changed from `TimeSpan.FromHours(1)` to `TimeSpan.FromMinutes(15)`.

**SEC-047 (MEDIUM) FIXED:** Removed `["disbursedAmount"]` from `LoanEventsSubscriber` variables dict for LOAN_DISBURSED events. Amount appeared in FCM push body (device lock screen). Tracked as P6-HANDOFF-35 for Phase 7 multi-channel variable support.

**SEC-049 (MEDIUM) FIXED:** `SnapAccountDocumentStyles.LoanPackageWatermark(orgName, generatedAt, packageId)` method added. `LoanPackageReportGenerator.BuildDocument()` now captures `generatedAt`, `orgName`, `packageId` and threads `watermark` variable through all 5 watermark render sites. Static `WatermarkText` const retained for non-loan reports.

**Flags to other agents:**
- SEC-045 → frontend-dev (PayloadViewer.tsx oauth-token kind unmasks bearer tokens)
- SEC-048 → mobile-dev (P6-HANDOFF-24: biometric Alert fallback)  
- SEC-050 → mobile-dev (consent_text_version hardcoded '1.4')

## Test Coverage
- LoanService: 73 unit tests (34 state machine, 9 consent signature, 4 IDOR security, 7 SEC-044 webhook bypass, remainder domain)
- All services combined: 313 unit tests, 0 failures
- Pre-existing integration test projects exist but require running Postgres (not run in unit test pipeline)

## AppHost Environment Variables (Phase 6C additions)
LoanService: `GCP_PROJECT_ID`, `GCS_LOAN_PACKAGES_BUCKET`, `LOAN_EVENTS_TOPIC`, `PARTNER_BANK_CREDS_TEMPLATE`, `ServiceUrls__GstService`, `ServiceUrls__AccountingService`
NotificationService: `PUBSUB_SUBSCRIPTION_LOAN_EVENTS = notification-service-loan-events-sub`
ReportService: `GCP_PROJECT_ID`, `GCS_REPORTS_BUCKET`, `GCS_LOAN_PACKAGES_BUCKET`
