---
name: dg-loan-02-03
description: DG-LOAN-02 disbursement webhook contract alignment + DG-LOAN-03 real loan package PDF via Report pipeline
type: project
---

DG-LOAN-02 (high): Disbursement webhook aligned to docs/devops/loan-disbursement-webhook.md contract.
DG-LOAN-03 (high): GeneratePackageCommandHandler wired to real IReportGenerator pipeline (ReportType.LoanPackage).

**Why:** DG-LOAN-02 webhook had wrong header name (X-Signature→X-Bank-Signature), missing sha256= prefix strip, wrong payload field names (snake_case per [JsonPropertyName]), paise vs rupees amount, wrong HTTP status codes, and old event names. DG-LOAN-03 handler used StubLoanPdfGenerator (returning text bytes, not real PDF; 500 in non-dev) instead of the Report module's QuestPDF LoanPackageReportGenerator.

**How to apply:**
- DG-LOAN-02 key changes in DisbursementWebhookHandler.cs:
  - Header now `X-Bank-Signature` (read in Loans.cs endpoint, passed as `bankSignature` param)
  - Strip `sha256=` prefix before constant-time compare
  - DisbursementPayload record uses `[JsonPropertyName]` for all fields: disbursement_id/loan_id/event_type/amount(long paise)/currency/utr_number/bank_account_number/failure_reason
  - Event types: DISBURSED/PARTIAL→RecordDisbursement, REJECTED→RecordDisbursementFailed, REVERSED→RecordDisbursementReversed
  - WebhookProcessingStatus enum renamed: NotFound/SignatureMismatch/DuplicateKey/BadRequest (no more generic Rejected)
  - HTTP status mapping in Loans.cs: 404/401/409/{code:DUPLICATE_EVENT}/400
  - Pub/Sub event uses snake_case fields (loan_id, amount, utr_number per contract)

- DG-LOAN-03 key changes in GeneratePackageCommand.cs:
  - Handler constructor now takes IReportServiceDbContext + IEnumerable<IReportGenerator> + ILoanStorageService
  - Drops ILoanPdfGenerator (which was either stub or throw in non-dev)
  - Creates a ReportJob (report.reports table) with OrgId+LoanApplicationId, delegates to generator.GenerateAsync(job, ct)
  - On success records LoanPdfPackage in loan.pdf_packages; gets signed URL via cloudStorage.GetSignedDownloadUrlAsync
  - IReportServiceDbContext and IReportGenerator registered by AddReportInfrastructure in Finance.WebApi/Program.cs (same DI container as AddLoanInfrastructure)
  - LoanService.Infrastructure/Loan/DependencyInjection.cs: stub registration kept for test isolation but fail-fast throw removed (non-dev no longer hard-fails because the handler doesn't call ILoanPdfGenerator)

- Tests in DisbursementWebhookSecurityTests.cs updated:
  - Payload uses snake_case field names; amount is `long` paise
  - ComputeHmac returns `sha256=<hex>` prefix format
  - Status assertions updated from Rejected→NotFound/SignatureMismatch/BadRequest
  - Named parameter `signature:` → `bankSignature:`

**Build result:** 0 errors, 171 LoanService unit tests green.
