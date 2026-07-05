---
name: project-dg-loan-01
description: DG-LOAN-01 admin loan-operations endpoints implemented — begin-review, approve, reject, request-docs, disburse alias, list-consents, status-log, bank-communications, banks alias. 0 errors build.
metadata:
  type: project
---

## DG-LOAN-01: Admin Loan Operations Endpoints — 2026-06-28

All admin loan-operations endpoints that were 404-ing are now implemented (0 errors, 171 LoanService tests passing).

**Why:** `src/admin/src/lib/loanApi.ts` called routes that had no backend handler. Admin LoanDetailPage, BankCommunicationsPage were entirely broken at runtime.

### New files created (Finance.Application):
- `Loan/LoanApplications/Commands/BeginReview/BeginReviewCommand.cs` — SUBMITTED→UNDER_REVIEW
- `Loan/LoanApplications/Commands/ApproveApplication/ApproveApplicationCommand.cs` — UNDER_REVIEW→APPROVED
- `Loan/LoanApplications/Commands/RejectApplication/RejectApplicationCommand.cs` — UNDER_REVIEW|DOCS_REQUESTED→REJECTED
- `Loan/LoanApplications/Commands/RequestDocuments/RequestDocumentsCommand.cs` — UNDER_REVIEW→DOCS_REQUESTED
- `Loan/LoanApplications/Queries/ListConsents/ListConsentsQuery.cs` — GET consents for application
- `Loan/LoanApplications/Queries/ListStatusLog/ListStatusLogQuery.cs` — GET status timeline
- `Loan/BankCommunications/Queries/ListBankCommunications/ListBankCommunicationsQuery.cs` — org-wide comm log
- `Loan/BankCommunications/Queries/GetBankCommKpi/GetBankCommKpiQuery.cs` — comm KPI
- `Loan/BankCommunications/Commands/ResendBankMessage/ResendBankMessageCommand.cs` — resend audit entry
- `Loan/PartnerBanks/Queries/ListPartnerBanks/ListPartnerBanksQuery.cs` — paginated banks list

### Routes added to Finance.WebApi/Endpoints/Loan/Loans.cs:
- `POST /loans/applications/{id}/begin-review` — BeginReviewCommand
- `POST /loans/applications/{id}/approve` — ApproveApplicationCommand  
- `POST /loans/applications/{id}/reject` — RejectApplicationCommand
- `POST /loans/applications/{id}/request-documents` — RequestDocumentsCommand
- `POST /loans/applications/{id}/disburse` — alias for RecordDisbursementCommand (matches admin RecordDisbursementRequest body)
- `GET /loans/applications/{id}/consents` — ListConsentsQuery
- `GET /loans/applications/{id}/status-log` — ListStatusLogQuery
- `GET /loans/bank-communications` — ListBankCommunicationsQuery (org-wide)
- `GET /loans/bank-communications/kpi` — GetBankCommKpiQuery
- `POST /loans/bank-communications/{id}/resend` — ResendBankMessageCommand
- `GET /loans/banks` — ListPartnerBanksQuery (paginated, { items, totalCount } envelope)
- `POST /loans/banks` — CreatePartnerBankCommand alias with string adapterType parsing

### Key patterns:
- All commands use `[RequiresPermission("loan.bank.decision")]` (reusing existing permission)
- All handlers apply IDOR org-scoping via `currentUser.OrganizationId`
- Status transitions always add ApplicationStatusLog row in same SaveChangesAsync (P6-HANDOFF-28)
- `POST /disburse` reuses existing `RecordDisbursementCommand` — no code duplication
- BankCommunications queries build on ApplicationStatusLog + PartnerBank join (no new DB table needed)
- Consent list returns `SignatureHex` as hex-encoded string (lowercase), never raw bytes
- `/loans/banks` alias returns `PartnerBanksListSchema` envelope { items, totalCount } vs bare array from `/partner-banks`

**How to apply:** When the admin frontend needs a route that seems missing, check if the domain entity already has the state machine method (LoanApplication.BeginReview/Approve/Reject etc.) before creating new domain logic.
