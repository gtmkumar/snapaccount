---
name: Phase 6A+6E+6B+6D Backend Build
description: AccountingService, NotificationService, CallbackService (Phase 6A+6E), GstService full completion (Phase 6B), ItrService full build (Phase 6D) — AppHost wiring, test counts, build status
type: project
---

Phase 6A+6E completed: AccountingService, NotificationService, CallbackService (12th microservice) fully built and wired into AppHost. All SEC-026..029 hotfixes applied.

Phase 6B completed (2026-04-25): GstService all 501 stubs replaced with real handlers.
- GSTN/IRP/EWB adapter pattern: Mock (default) + Production (`GST_PRODUCTION_APIS_ENABLED=true`) with 3x retry (100ms/1s/5s)
- 26 endpoints mapped: notices (CRUD + respond + assign-CA), e-invoice (IRN gen), e-way bill, nil return, HSN/SAC search, return invoices, bulk import
- GstRecurringJobsSubscriber: Pub/Sub subscriber for deadline reminders at D-7, D-3, D-1, D+1
- Notice tracker: GCS URI metadata (P6-HANDOFF-14, never base64), AssignToCa domain event
- PermissionBehavior SEC-026 wired
- Build: 0 errors, 0 warnings
- Tests: GstService.Tests 20/20 pass

Phase 6D completed (2026-04-25): ItrService full build.
- Domain: Assessee (PAN cipher P6-HANDOFF-19), Filing (state machine + computation pinning P6-HANDOFF-18 + ItrVObjectKey P6-HANDOFF-20), TaxSlabVersion, DeductionSection, Form16Extract, ItrNotice, RefundStatusEntry
- TaxComputationEngine: pure, config-driven from itr.tax_slab_versions, SHA-256 hash for audit invariant
- 17 endpoints: profile, filings CRUD, compute, compare-regimes, submit/approve/reject/mark-filed/e-verify, form16, notices, refund, tax-slabs, deduction-catalog
- ItrRecurringJobsSubscriber: seasonal gating (May-Sep full cascade, off-season Sunday digest)
- ItrDeadlineReminderHandler + ItrRefundPollingHandler implemented
- AppHost updated with GstService and ItrService env vars
- Build: 0 errors, 0 warnings
- Tests: ItrService.Tests 20/20 pass (6 golden-file tax computation + 14 state machine tests)

**Why:** Largest Phase 6 unit. GST adapters needed for production readiness; ITR engine needed for tax computation audit trail compliance (P6-HANDOFF-18).

**How to apply:** AppHost env vars for GstService: GST_PRODUCTION_APIS_ENABLED, GSTN_API_BASE_URL, IRP_API_BASE_URL, EWB_API_BASE_URL. For ItrService: GOOGLE_DOCUMENT_AI_CONFIG, GCS_BUCKET_ITR, PUBSUB_SUBSCRIPTION_RECURRING_JOBS_ITR.

**Total test count as of 2026-04-25:** AuthService 79 + NotificationService 46 + AccountingService 20 + CallbackService 28 + GstService 20 + ItrService 20 = 213 unit tests, all passing.
