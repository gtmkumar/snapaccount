---
name: Phase 6B+6D Security Hotfix (SEC-038..043)
description: IDOR fixes for GstService notices and ItrService filings, DPDP erasure subscribers for both services, rate-limit tightening
type: project
---

All 3 HIGH blockers from the Phase 6B+6D security review are now fixed.

## SEC-038 — GstService Notice IDOR (FIXED)
- `GetNoticeQueryHandler`: inline EF org filter `n.OrganizationId == currentUser.OrganizationId` in WHERE clause
- `RespondToNoticeCommandHandler` + `AssignNoticeToCaCommandHandler`: post-fetch `notice.OrganizationId != currentUser.OrganizationId` → `Error.NotFound` (not Forbidden)
- Pattern: same as SEC-029 CallbackService IDOR fix

## SEC-039 — ItrService Filing IDOR (FIXED)
- 10 handlers all now inject `ICurrentUser`
- Query handlers: post-fetch assessee lookup + `assessee.OrganizationId != currentUser.OrganizationId` → NotFound
- `ListFilingsQuery`: returns empty `ListFilingsResponse` (not error) for cross-org assessee — avoids existence leak
- Filing entity has no direct OrganizationId; ownership is via Filing → Assessee.OrganizationId

## SEC-040 — DPDP Erasure (FIXED)
- `GstService.Infrastructure.Messaging.AccountDeletionSubscriber`: soft-deletes gst_invoices (by CreatedBy string), notices (by CreatedBy), cascades to e_invoices+e_way_bills; anonymizes responded_by on shared notices; deletes GCS attachment objects
- `ItrService.Infrastructure.Messaging.AccountDeletionSubscriber`: anonymizes+soft-deletes assessee_profiles+filings+form_16_extracts+notices, anonymizes refund_status_log (CreatedBy=null)
- Both registered with `AddHostedService<AccountDeletionSubscriber>()` in their Infrastructure DI
- GstNotice.AnonymizeRespondent() domain method added for clearing respondent ref without deleting the notice

## SEC-041 — UploadForm16 client-supplied cipher (DEFERRED)
- Requires IPanEncryptionService in ItrService.Application.Interfaces + implementation + DI
- TODO comment added in UploadForm16CommandHandler
- Too invasive for this hotfix pass

## SEC-043 — GST write rate-limit (FIXED)
- "gst-write-strict" policy: 30 req/min fixed window, added to GstService Program.cs
- Applied to POST /gst/notices and POST /gst/e-invoices endpoints

## Build + Tests
- `dotnet build backend/`: 0 errors, 0 warnings
- Total unit tests: 240 passing (79 Auth + 20 Accounting + 28 Callback + 46 Notification + 31 Gst + 36 Itr)
- New tests: GstNoticeIdorTests (9 tests), FilingIdorTests (9 tests), GstDpdpErasureTests (4 tests), ItrDpdpErasureTests (5 tests)

**Why:** `BaseAuditableEntity.CreatedBy` is `string?` (Firebase UID string), not Guid. DPDP subscribers must match by `CreatedBy == userId.ToString()` for invoice/notice rows. ItrNotice.AssesseeId (Guid) and GstNotice.RespondedBy (Guid?) use Guid matching.
