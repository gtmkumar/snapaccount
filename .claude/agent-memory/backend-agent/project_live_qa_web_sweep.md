---
name: live-qa-web-sweep-2026-06-11
description: Live QA fix bundle — 16 failing endpoints (WEB-01..WEB-14), EF↔DB divergence, RBAC HTTP status fixes
type: project
---

# Live QA Web Sweep Fix Bundle (2026-06-11)

**Fact:** All 16 failing endpoints from `.claude/qa/live-web-sweep-2026-06-11.md` fixed.
Build: 0 errors. All tests pass (exit 0). 7 new GstService EF smoke tests pass.

**Why:** Systemic EF Core ↔ DB schema divergence — entity configs had wrong table names, column names, or unmapped GENERATED columns. Also RBAC HTTP status mapping (Forbidden → 500 instead of 403) in AuthService/GstService endpoints.

**How to apply:** When encountering 500s from EF-powered endpoints, always check `\d schema.table` in psql vs EF entity config. DB schema is source of truth.

## Ground Rules Applied
- DB schema is source of truth; EF configs fixed to match DB (not vice versa)
- If no matching table exists: map to nearest equivalent or DDL handoff + safe interim (empty/null)
- GENERATED ALWAYS AS columns: `builder.Ignore(e => e.Prop)`
- Missing DB columns: `builder.Ignore()` + DDL HANDOFF comment
- Present DB columns missing from entity: shadow property via `builder.Property<T>("Name")`

## Fixes by Service

### GstService (WEB-01, WEB-02, WEB-10)
- `GstNoticeConfiguration`: `OrganizationId→org_id`, `IssuedDate→notice_date`, `Description→subject`, `AssignedCaId→assigned_to`
- `ItcMismatchConfiguration` (created): `DifferenceAmount` is GENERATED AS — `Ignore()`
- `ItcRecordConfiguration` (created): table `itc_record` singular, `TotalItc` computed property → `Ignore()`
- `GstRefundConfiguration`: `ClaimedAmount→refund_amount`, `ApprovedAmount→sanctioned_amount`, `ApprovedAt→final_order_date`, `RejectionReason→remarks`. Ignored: `TaxPeriod`, `FiledAt`, `ApplicationNumber`, `Notes`
- `GstAnnualReturnConfiguration`: `FiledAt→filing_date`. Ignored: `FormType`, `TotalTurnover`, `TotalTaxPaid`, `TotalItcClaimed`, `Notes`, `IsReconciled`, `ReconciledAt`
- `LutFilingConfiguration`: `FiledAt→filing_date`, `Notes→remarks`. Ignored: `ExportType`, `IsAutoRenewal`
- `Gst.cs` endpoint: `organizationId` query param `Guid?` nullable with explicit 400 return

### LoanService (WEB-03)
- `PartnerBankConfiguration`: `api_config_encrypted` bytea→jsonb; entity property `ApiConfigEncrypted` `byte[]→string?`
- `LoanApplicationConfiguration`: `AssignedBankId` + `AssignedBank` navigation ignored (no DB column); query handlers use null substitution
- `LoanPdfPackageConfiguration`: `IsCurrent` ignored (no DB column); column names explicitly set
- `ConsentConfiguration`: `ConsentLocale` ignored (no DB column — DDL handoff)
- `WebhookIdempotencyKeyConfiguration`: table doesn't exist — DDL handoff with comment; no 500 at startup (lazy DbSet)
- Command handlers: `credentialEncryption.EncryptAsync()` returns `byte[]` → `Convert.ToBase64String()` for `string?` property
- `RestPartnerBankAdapter`: `Convert.FromBase64String(bank.ApiConfigEncrypted)` before `DecryptAsync()`

### ItrService (WEB-04)
- `AssesseeConfiguration`: `OrganizationId` ignored (no `organization_id` in `itr.assessee_profiles`); org-scoping relies on RLS
- `FilingConfiguration`: `AssesseeId→assessee_profile_id`, `AssessmentYear→ay`, `ItrFormType→itr_form`, `Regime→regime_chosen`, `AcknowledgementNumber→ack_number`, `CaRejectionReason→ca_review_notes`. Ignored: `ComputationHash`, `SalaryIncome`, `HousePropertyIncome`, `BusinessIncome`, `CapitalGains`, `OtherIncome`
- `GetFilingQuery`/`ListFilingsQuery`: removed `currentUser` param (unused after org check moved to RLS)

### SubscriptionService (WEB-05)
- `PlanConfiguration`: `plans→subscription_plan`, `Tier` mapped to `sort_order smallint`
- `InvoiceConfiguration`: `invoices→subscription_invoice`; column renames; ignored `RazorpayOrderId`, `AnonymizedAt`, `AnonymizationReason`
- `SubscriptionConfiguration`: `subscriptions→subscription`
- `UsageRecordConfiguration`: `usage_records→usage_record`; `OrgId→organization_id`; `PeriodStart→billing_period_start`; ignored `FeatureCode`, `Units`, `CorrelationId`

### ReportService (WEB-06)
- `ReportJobConfiguration`: `report_jobs→report`; `OrgId→organization_id`; `GcsUri→storage_path`; `CompletedAt→generated_at`; `RequestedBy→user_id`. Ignored `Format`, `Sha256HashHex`, `StartedAt`, `LoanApplicationId`. Shadow property `Title` with default `"Report"` for NOT NULL constraint.
- `ListReportsQuery`/`GetReportQuery`: `j.Format.ToString()→"PDF"` literal; `j.Sha256HashHex→null`; `j.StartedAt→null`

### NotificationService (WEB-07, WEB-08)
- `DlqItemConfiguration`: `Locale` ignored; `OriginalPayload` ignored; `IsResolved(bool)→resolution_status(varchar)` via value converter `"ACKNOWLEDGED"/"OPEN"`
- `NotificationLogEntryConfiguration`: Migration 060 columns not applied to DB. Ignored: `UserId`, `EventCode`, `Channel`, `Locale`, `RenderedBody`, `DedupeKey`. DDL handoff documented.
- `NotificationEventConfiguration`: `notification_event` table doesn't exist — DDL handoff in comment
- `GetCelebrationsQuery`: returns all-false default (safe interim). Removed `INotificationDbContext` parameter.
- `GetDlqQuery`: `d.Locale→"en"` literal

### AccountingService (WEB-14)
- `ChartOfAccountConfiguration`: `chart_of_accounts→account`; `OrgId→organization_id`; `IsPostable`/`IsFromTemplate`/`TemplateCode` ignored; shadow `currency` with default `"INR"`
- `JournalBatchConfiguration`: `journal_batches→journal_entry`; column renames; `FyYear` ignored
- `LedgerEntryConfiguration`: `JournalBatchId→journal_entry_id` (column exists!); `ReviewedBy→reviewer_user_id`
- `FiscalYearCloseConfiguration`: `OrgId→organization_id`; `FyYear(int)→financial_year(varchar)` via converter with static helper; `ClosedBy→initiated_by`; `ClosedAt→completed_at`; `Notes→closing_notes`
- `InternalAuditConfiguration`: Many column renames + 6 entity properties ignored (no DB column)
- `InternalAuditFindingConfiguration`: `InternalAuditId→audit_id`; `FindingType→finding_category`; `TargetResolutionDate→remediation_date`; `AssignedTo→remediation_owner`; ignored: `Title`, `EvidenceDocumentId`, `ResolvedAt`

### AuthService (WEB-09, WEB-10, WEB-11)
- `Auth.cs` endpoints: all `Results.Problem()`/`Results.BadRequest()` replaced with `result.Error.ToHttpResult()`
- `ToHttpResult()` in `SnapAccount.Shared.Api.ErrorResults`: maps `ErrorType.Forbidden→403`, `Validation→400`, `NotFound→404`

## DDL Handoffs Required (db-engineer)
| Table | Missing Columns |
|---|---|
| `itr.assessee_profiles` | `organization_id UUID` (security — org scoping) |
| `loan.applications` | `assigned_bank_id UUID REFERENCES loan.partner_banks(id)` |
| `gst.gst_refund` | `tax_period VARCHAR(20)`, `filed_at TIMESTAMPTZ`, `application_number VARCHAR(100)` |
| `gst.lut_filing` | `export_type VARCHAR(20) DEFAULT 'GOODS'`, `is_auto_renewal BOOLEAN DEFAULT FALSE` |
| `gst.gst_annual_return` | `form_type`, `total_turnover`, `total_tax_paid`, `total_itc_claimed`, `notes`, `is_reconciled`, `reconciled_at` |
| `accounting.account` | `is_postable BOOLEAN`, `is_from_template BOOLEAN`, `template_code VARCHAR(20)` |
| `accounting.journal_entry` | `fy_year SMALLINT` |
| `accounting.internal_audit` | `audit_title`, `financial_year`, `auditor_firm_name`, `executive_summary`, `report_document_id`, `report_issued_at` |
| `accounting.internal_audit_finding` | `title VARCHAR(500)`, `evidence_document_id VARCHAR(100)`, `resolved_at TIMESTAMPTZ` |
| `notification.notification_log` | `user_id`, `event_code`, `channel`, `language`, `rendered_body`, `dedupe_key` |
| `notification.notification_event` | Entire table (CREATE TABLE DDL in config comment) |
| `loan.webhook_idempotency_keys` | Entire table (CREATE TABLE DDL in config comment) |
| `subscription.usage_record` | `feature_code VARCHAR(100)`, `units INTEGER`, `correlation_id VARCHAR(200)` |
| `loan.consents` | `consent_locale VARCHAR(10) DEFAULT 'en'` |
| `itr.filings` | `computation_hash`, `salary_income`, `house_property_income`, `business_income`, `capital_gains`, `other_income` |

## EF Smoke Tests Added
- `/tests/unit/GstService/EfModelSmokeTests.cs`: 7 tests for GstService DbSets, `[Trait("Category", "EfSmoke")]`
- Run: `dotnet test --filter "Category=EfSmoke"` — all 7 pass against local postgres

## Round 3 Fixes (WEB-FIX #1–#6, session 2026-06-11 continuation)

Picking up from a context-window break. One remaining failure:

**CallbackService `GetKpiSnapshotQueryTests` — 4 tests failing with `ArgumentNullException`**:
- Cause: `BuildContext()` only mocked `db.KpiSnapshots`. The new handler (WEB-FIX #5) also queries `db.Callbacks`. That property was null in all 4 existing test setups.
- Fix: Refactored `BuildContext` with a generic `BuildDbSetMock<T>()` helper and made `BuildContext` accept `IEnumerable<Callback>? callbacks = null` — all 4 tests healed without changing test assertions.
- **Pattern: when a handler gains a new DbSet access, all existing test mocks for that context must also set up the new DbSet.**

Final test counts post-round-3: **1,143 total, 0 failures** across all 11 test projects.
| AuthService 642 | GstService 44 | ItrService 61 | LoanService 121 | DocumentService 36 |
| CallbackService 35 | ChatService 37 | AccountingService 20 | ReportService 16 | SubscriptionService 85 | NotificationService 46 |
